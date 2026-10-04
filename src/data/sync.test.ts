import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ObraDB, useDB, db } from './db';
import { SyncEngine } from './sync';
import { saveProject, saveReport, deleteReport, projectData, findReport, saveMaterial, listMaterials } from './repo';
import { sumTotals } from '../lib/calc';

/** Supabase falso en memoria: lo justo de la API que usa SyncEngine. */
function fakeSupabase() {
  const tables = new Map<string, Map<string, any>>();
  const files = new Map<string, Blob>();
  let clock = Date.parse('2026-10-04T10:00:00Z');
  const t = (name: string) => tables.get(name) || (tables.set(name, new Map()), tables.get(name)!);
  const sb: any = {
    tables, files, failNext: false,
    from(name: string) {
      return {
        async upsert(rows: any[]) {
          if (sb.failNext) { sb.failNext = false; return { error: { message: 'Failed to fetch' } }; }
          // El servidor guarda como texto los numeric, igual que Postgres.
          for (const r of rows) t(name).set(r.id, JSON.parse(JSON.stringify({ ...r, hours: r.hours != null ? String(r.hours) : undefined })));
          clock += 1000;
          return { error: null };
        },
        select() {
          let filter = (_r: any) => true;
          let range: [number, number] = [0, 1e9];
          const q: any = {
            gt(col: string, v: string) { filter = (r) => r[col] > v; return q; },
            order() { return q; },
            range(a: number, b: number) { range = [a, b]; return q; },
            then(res: any) {
              const data = [...t(name).values()].filter(filter).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)).slice(range[0], range[1] + 1);
              return Promise.resolve({ data, error: null }).then(res);
            },
          };
          return q;
        },
      };
    },
    storage: {
      from() {
        return {
          async upload(path: string, blob: Blob) { files.set(path, blob); return { error: null }; },
          async download(path: string) { return { data: files.get(path) || null, error: files.has(path) ? null : { message: 'no' } }; },
        };
      },
    },
  };
  return sb;
}

let n = 0;
const device = () => new ObraDB(`dev-${++n}`);

describe('sincronización entre dos móviles', () => {
  let sb: any, A: ObraDB, B: ObraDB;
  beforeEach(() => { sb = fakeSupabase(); A = device(); B = device(); });

  it('lo que se apunta en un móvil aparece en el otro, con los mismos totales', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'Casa Martínez', client_name: 'Martínez', status: 'en_curso', budget_cents: 3_000_000 });
    await saveReport({
      project_id: pid, date: '2026-10-02',
      labor: [{ worker_name: 'Juan', hours: 8, rate_cents: 1800 }, { worker_name: 'Pedro', hours: 7.5, rate_cents: 1600 }],
      materials: [{ material_name: 'Cemento 25 kg', unit: 'saco', quantity: 5, unit_price_cents: 650 }],
      expenses: [{ category: 'Gasolina', concept: 'Gasolina', amount_cents: 6000 }],
    });
    const a = new SyncEngine(sb, 'user-1');
    await a.syncNow();
    expect(a.state.kind).toBe('idle');
    expect((a.state as any).pending).toBe(0);
    const totalA = await (async () => { const d = await projectData(pid); return sumTotals(d.labor, d.materials, d.expenses); })();

    useDB(B);
    const b = new SyncEngine(sb, 'user-1');
    await b.syncNow();
    const d = await projectData(pid);
    expect(sumTotals(d.labor, d.materials, d.expenses)).toEqual(totalA);
    expect(d.labor.find((l) => l.worker_name === 'Pedro')!.hours).toBe(7.5); // numeric vuelve como número
    expect((await listMaterials())[0].last_price_cents).toBe(650);
  });

  it('borrar un parte en un móvil lo borra en el otro, y el histórico de precios no cambia', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'Olivo', client_name: '', status: 'en_curso' });
    const r1 = await saveReport({ project_id: pid, date: '2026-10-01', labor: [], materials: [{ material_name: 'Cemento', unit: 'saco', quantity: 2, unit_price_cents: 650 }], expenses: [] });
    await saveReport({ project_id: pid, date: '2026-10-02', labor: [{ worker_name: 'Juan', hours: 8, rate_cents: 1800 }], materials: [], expenses: [] });
    const a = new SyncEngine(sb, 'u');
    await a.syncNow();

    useDB(B);
    const b = new SyncEngine(sb, 'u');
    await b.syncNow();
    expect((await projectData(pid)).reports).toHaveLength(2);
    // En B cambia el precio habitual del cemento y borra el parte del día 1
    const cem = (await listMaterials()).find((m) => m.name === 'Cemento')!;
    await saveMaterial({ id: cem.id, name: 'Cemento', last_price_cents: 720 });
    await deleteReport(r1);
    await b.syncNow();

    useDB(A);
    await a.syncNow();
    const d = await projectData(pid);
    expect(d.reports.map((r) => r.date)).toEqual(['2026-10-02']);
    expect((await listMaterials()).find((m) => m.name === 'Cemento')!.last_price_cents).toBe(720);
    // El parte borrado sigue guardado con su precio original (borrado lógico)
    const line = (await db.materialEntries.toArray())[0];
    expect(line.unit_price_cents).toBe(650);
  });

  it('sin conexión no se pierde nada: queda pendiente y se sube al volver', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'Local', client_name: '', status: 'en_curso' });
    const a = new SyncEngine(sb, 'u');
    sb.failNext = true;
    await a.syncNow();
    expect(a.state.kind).toBe('error');
    expect((a.state as any).pending).toBeGreaterThan(0);
    await a.syncNow();
    expect(a.state).toMatchObject({ kind: 'idle', pending: 0 });
    expect(sb.tables.get('projects').has(pid)).toBe(true);
  });

  it('una edición hecha durante la subida no se marca como subida', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'X', client_name: '', status: 'en_curso' });
    const a = new SyncEngine(sb, 'u');
    const orig = sb.from;
    sb.from = (name: string) => {
      const q = orig.call(sb, name);
      const up = q.upsert;
      q.upsert = async (rows: any[]) => { const r = await up(rows); if (name === 'projects') await db.projects.update(pid, { name: 'X editada' }); return r; };
      return q;
    };
    await a.push();
    expect((await db.projects.get(pid))!._dirty).toBe(1);
    sb.from = orig;
    await a.syncNow();
    expect(sb.tables.get('projects').get(pid).name).toBe('X editada');
  });

  it('un parte nuevo del mismo día se abre en lugar de duplicarse tras sincronizar', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'Y', client_name: '', status: 'en_curso' });
    await saveReport({ project_id: pid, date: '2026-10-03', labor: [{ worker_name: 'Ana', hours: 8, rate_cents: 1500 }], materials: [], expenses: [] });
    await new SyncEngine(sb, 'u').syncNow();
    useDB(B);
    await new SyncEngine(sb, 'u').syncNow();
    expect(await findReport(pid, '2026-10-03')).toBeTruthy();
  });
});
