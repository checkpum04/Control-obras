// Copia automática a la nube (Supabase). El móvil sigue siendo la fuente de verdad: se puede
// trabajar sin conexión y los cambios se suben en cuanto hay red. Un solo usuario, así que ante
// un conflicto gana la última edición.
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, markSyncTransaction, setLocalChangeListener, SYNC_TABLES, type SyncTable } from './db';
import type { Attachment } from './types';

export const REMOTE: Record<SyncTable, string> = {
  clients: 'clients', projects: 'projects', workers: 'workers', materials: 'materials', concepts: 'expense_concepts',
  reports: 'daily_reports', labor: 'labor_entries', materialEntries: 'material_entries', expenses: 'expenses', attachments: 'attachments',
};
const NUMERIC: Partial<Record<SyncTable, string[]>> = {
  projects: ['budget_cents'], workers: ['default_rate_cents', 'use_count'], materials: ['last_price_cents', 'use_count'],
  concepts: ['last_amount_cents', 'use_count'], labor: ['hours', 'rate_cents', 'cost_cents'],
  materialEntries: ['quantity', 'unit_price_cents', 'cost_cents'], expenses: ['amount_cents'], attachments: ['size'],
};
const TIMESTAMPS = ['created_at', 'updated_at', 'deleted_at', 'last_used_at'];
export const BUCKET = 'adjuntos';
const PAGE = 1000;
/** Margen al pedir cambios, por si el reloj de otro dispositivo va un poco atrasado. */
const OVERLAP_MS = 10 * 60 * 1000;

export type SyncState =
  | { kind: 'off' }
  | { kind: 'idle'; pending: number; lastSync?: string }
  | { kind: 'syncing'; pending: number }
  | { kind: 'offline'; pending: number }
  | { kind: 'blocked'; reason: string; pending: number }
  | { kind: 'error'; message: string; pending: number; lastSync?: string };

// ───────── Conversión de filas

export function toRemote(table: SyncTable, row: any, ownerId: string): Record<string, unknown> {
  const { _dirty, _v, example, blob, size, ...rest } = row;
  const out: Record<string, unknown> = { ...rest, owner_id: ownerId };
  if (table === 'attachments') out.size_bytes = size ?? null;
  return out;
}

export function toLocal(table: SyncTable, row: any): any {
  const { owner_id, size_bytes, ...rest } = row;
  const out: any = { ...rest, _dirty: 0 };
  if (table === 'attachments') out.size = size_bytes ?? 0;
  for (const k of NUMERIC[table] || []) if (out[k] != null) out[k] = Number(out[k]);
  for (const k of TIMESTAMPS) if (out[k]) out[k] = new Date(out[k]).toISOString();
  return out;
}

// ───────── Motor

export class SyncEngine {
  state: SyncState = { kind: 'off' };
  private listeners = new Set<(s: SyncState) => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private sb: SupabaseClient, private userId: string) {}

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }
  private set(s: SyncState) { this.state = s; this.listeners.forEach((l) => l(s)); }

  /** Arranca la sincronización automática: al abrir, al volver la red, tras cada cambio y cada minuto. */
  start() {
    setLocalChangeListener(() => this.soon(2500));
    const online = () => this.soon(0);
    const hidden = () => { if (document.visibilityState === 'hidden') this.syncNow(); else this.soon(0); };
    window.addEventListener('online', online);
    window.addEventListener('offline', () => this.refreshIdle());
    document.addEventListener('visibilitychange', hidden);
    this.interval = setInterval(() => this.syncNow(), 60_000);
    this.syncNow();
    return () => {
      setLocalChangeListener(null);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hidden);
      if (this.interval) clearInterval(this.interval);
      if (this.timer) clearTimeout(this.timer);
    };
  }

  soon(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow(), ms);
    this.refreshIdle();
  }

  private async refreshIdle() {
    if (this.state.kind === 'syncing') return;
    const pending = await pendingCount();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) this.set({ kind: 'offline', pending });
    else if (this.state.kind === 'idle') this.set({ ...this.state, pending });
    else if (this.state.kind === 'offline') this.set({ kind: 'idle', pending });
  }

  /** Sube y baja cambios. Si ya hay una sincronización en marcha, se encadena otra al terminar. */
  syncNow(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    this.running = (async () => {
      do {
        this.again = false;
        await this.once();
      } while (this.again);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  private async once() {
    const pending = await pendingCount();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.set({ kind: 'offline', pending }); return; }
    if (await hasExampleData()) {
      this.set({ kind: 'blocked', pending, reason: 'Borra los datos de ejemplo para empezar a guardar en la nube.' });
      return;
    }
    this.set({ kind: 'syncing', pending });
    try {
      await this.push();
      await this.pull();
      const now = new Date().toISOString();
      await db.meta.put({ key: 'lastSync', value: now });
      this.set({ kind: 'idle', pending: await pendingCount(), lastSync: now });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const message = describeError(e);
      const left = await pendingCount();
      if (offline) this.set({ kind: 'offline', pending: left });
      else this.set({ kind: 'error', message, pending: left, lastSync: (await db.meta.get('lastSync'))?.value as string | undefined });
    }
  }

  /** Sube todas las filas con cambios locales, tabla a tabla en orden de dependencias. */
  async push() {
    await this.mergeSameDayReports();
    for (const t of SYNC_TABLES) {
      const rows = (await db.table(t).toArray()).filter((r: any) => r._dirty !== 0 && !r.example);
      if (!rows.length) continue;
      if (t === 'attachments') {
        for (const a of rows as Attachment[]) await this.uploadFile(a);
      }
      const fresh = t === 'attachments' ? (await db.attachments.bulkGet(rows.map((r: any) => r.id))).filter(Boolean) : rows;
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500) as any[];
        const { error } = await this.sb.from(REMOTE[t]).upsert(chunk.map((r) => toRemote(t, r, this.userId)), { onConflict: 'id' });
        if (error) throw error;
        // Solo se marca como subida si nadie la ha vuelto a tocar mientras tanto.
        await db.transaction('rw', db.table(t), async (tx) => {
          markSyncTransaction(tx);
          for (const r of chunk) {
            const cur = await db.table(t).get(r.id);
            if (cur && cur._v === r._v) await db.table(t).update(r.id, { _dirty: 0 });
          }
        });
      }
    }
  }

  /**
   * Dos personas con la misma cuenta pueden crear sin conexión el parte del mismo día y obra.
   * Antes de subir, si en la nube ya existe ese parte, las líneas locales se pasan a él:
   * queda un único parte con lo que apuntó cada uno.
   */
  async mergeSameDayReports() {
    const local = (await db.reports.toArray()).filter((r) => r._dirty !== 0 && !r.example && !r.deleted_at);
    if (!local.length) return;
    const projectIds = [...new Set(local.map((r) => r.project_id))];
    const { data, error } = await this.sb.from(REMOTE.reports).select('id,project_id,date,notes,created_at')
      .in('project_id', projectIds).is('deleted_at', null);
    if (error) throw error;
    for (const r of local) {
      const m = (data || []).find((x: any) => x.project_id === r.project_id && x.date === r.date && x.id !== r.id);
      if (!m) continue;
      await db.transaction('rw', [db.reports, db.labor, db.materialEntries, db.expenses], async () => {
        // Estas escrituras sí cuentan como cambios locales: las líneas movidas se suben con el parte de la nube.
        await db.labor.where('report_id').equals(r.id).modify({ report_id: m.id });
        await db.materialEntries.where('report_id').equals(r.id).modify({ report_id: m.id });
        await db.expenses.where('report_id').equals(r.id).modify({ report_id: m.id });
        const notes = [m.notes, r.notes].filter((x) => x && String(x).trim()).join('\n');
        const existing = await db.reports.get(m.id);
        if (existing) await db.reports.update(m.id, { notes });
        else await db.reports.add({ id: m.id, project_id: r.project_id, date: r.date, notes, created_at: new Date(m.created_at).toISOString(), updated_at: new Date().toISOString() });
        await db.reports.delete(r.id); // nunca llegó a la nube
      });
    }
  }

  private async uploadFile(a: Attachment) {
    if (a.storage_path || !a.blob) return;
    const path = `${this.userId}/${a.project_id}/${a.id}`;
    const { error } = await this.sb.storage.from(BUCKET).upload(path, a.blob, { contentType: a.mime || undefined, upsert: true });
    if (error) throw error;
    await db.transaction('rw', db.attachments, async (tx) => {
      markSyncTransaction(tx);
      await db.attachments.update(a.id, { storage_path: path });
    });
  }

  /** Baja los cambios hechos en otros dispositivos desde la última vez. */
  async pull() {
    for (const t of SYNC_TABLES) {
      const key = `pull:${t}`;
      const since = ((await db.meta.get(key))?.value as string | undefined) || '1970-01-01T00:00:00.000Z';
      const from = new Date(new Date(since).getTime() - OVERLAP_MS).toISOString();
      let max = since;
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await this.sb.from(REMOTE[t]).select('*').gt('updated_at', from)
          .order('updated_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGE - 1);
        if (error) throw error;
        const rows = (data || []).map((r) => toLocal(t, r));
        if (rows.length) {
          await db.transaction('rw', db.table(t), async (tx) => {
            markSyncTransaction(tx);
            for (const r of rows) {
              const cur = await db.table(t).get(r.id);
              if (cur && cur._dirty !== 0) continue; // cambio local sin subir: se queda el local
              if (cur && cur.updated_at && cur.updated_at > r.updated_at) continue;
              if (t === 'attachments' && cur?.blob) r.blob = cur.blob; // conservar el archivo ya descargado
              await db.table(t).put(r);
            }
          });
          for (const r of rows) if (r.updated_at > max) max = r.updated_at;
        }
        if (!data || data.length < PAGE) break;
      }
      await db.meta.put({ key, value: max });
    }
  }

  /** Descarga el archivo de una foto/documento que se subió desde otro dispositivo. */
  async download(a: Attachment): Promise<Blob | undefined> {
    if (!a.storage_path) return undefined;
    const { data, error } = await this.sb.storage.from(BUCKET).download(a.storage_path);
    if (error || !data) return undefined;
    await db.transaction('rw', db.attachments, async (tx) => {
      markSyncTransaction(tx);
      await db.attachments.update(a.id, { blob: data });
    });
    return data;
  }
}

export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) n += (await db.table(t).toArray()).filter((r: any) => r._dirty !== 0 && !r.example).length;
  return n;
}

async function hasExampleData() {
  return (await db.projects.filter((p) => !!p.example).count()) > 0;
}

function describeError(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return 'Sin conexión con la nube. Se reintentará solo.';
  if (/JWT|token|auth/i.test(msg)) return 'La sesión ha caducado. Vuelve a entrar.';
  return msg;
}
