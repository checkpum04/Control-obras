import Dexie, { type Table, type Transaction } from 'dexie';
import type {
  Attachment, Client, DailyReport, Expense, ExpenseConcept, LaborEntry, Material, MaterialEntry, Partida, PartidaTemplate,
  Project, Worker,
} from './types';

/** Tablas que se sincronizan con la nube, en orden de dependencias (padres antes que hijos). */
export const SYNC_TABLES = [
  'clients', 'projects', 'partidas', 'partidaTemplates', 'workers', 'materials', 'concepts', 'reports', 'labor', 'materialEntries', 'expenses', 'attachments',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Base de datos local (IndexedDB). Es la fuente de verdad en el móvil; sync.ts la copia a Supabase. */
export class ObraDB extends Dexie {
  clients!: Table<Client, string>;
  projects!: Table<Project, string>;
  partidas!: Table<Partida, string>;
  partidaTemplates!: Table<PartidaTemplate, string>;
  workers!: Table<Worker, string>;
  materials!: Table<Material, string>;
  concepts!: Table<ExpenseConcept, string>;
  reports!: Table<DailyReport, string>;
  labor!: Table<LaborEntry, string>;
  materialEntries!: Table<MaterialEntry, string>;
  expenses!: Table<Expense, string>;
  attachments!: Table<Attachment, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = 'app-obra') {
    super(name);
    this.version(1).stores({
      clients: 'id, name',
      projects: 'id, status, client_id, updated_at',
      workers: 'id, name',
      materials: 'id, name',
      concepts: 'id, name',
      reports: 'id, project_id, date, [project_id+date]',
      labor: 'id, report_id, project_id, worker_id',
      materialEntries: 'id, report_id, project_id, material_id',
      expenses: 'id, project_id, report_id, date',
      attachments: 'id, project_id, expense_id',
      meta: 'key',
    });
    // v2: partidas. Solo añade tablas e índices: los datos que ya había se conservan tal cual.
    this.version(2).stores({
      partidas: 'id, project_id',
      partidaTemplates: 'id, name',
      labor: 'id, report_id, project_id, worker_id, partida_id',
      materialEntries: 'id, report_id, project_id, material_id, partida_id',
      expenses: 'id, project_id, report_id, date, partida_id',
      attachments: 'id, project_id, expense_id, partida_id',
    });
    for (const t of SYNC_TABLES) trackChanges(this.table(t));
  }
}

/** Transacciones abiertas por la sincronización: sus escrituras no se marcan como pendientes. */
const syncTx = new WeakSet<object>();
export function markSyncTransaction(tx: Transaction | null | undefined) {
  if (tx) syncTx.add((tx as any).idbtrans ?? tx);
}
const fromSync = (tx: Transaction) => syncTx.has((tx as any).idbtrans ?? tx) || syncTx.has(tx);

const ver = () => Math.random().toString(36).slice(2, 10);
let onLocalChange: (() => void) | null = null;
export function setLocalChangeListener(fn: (() => void) | null) { onLocalChange = fn; }

/** Toda escritura local marca la fila como pendiente de subir y actualiza updated_at. */
function trackChanges(table: Table<any, string>) {
  table.hook('creating', function (_pk: any, obj: any, tx: any) {
    if (fromSync(tx)) return;
    obj._dirty = 1;
    obj._v = ver();
    if (!obj.updated_at) obj.updated_at = new Date().toISOString();
    if (!obj.created_at) obj.created_at = obj.updated_at;
    onLocalChange?.();
  });
  table.hook('updating', function (mods: any, _pk: any, _obj: any, tx: any) {
    if (fromSync(tx)) return undefined;
    onLocalChange?.();
    return { _dirty: 1, _v: ver(), ...(mods.updated_at ? {} : { updated_at: new Date().toISOString() }) };
  });
}

export let db = new ObraDB();
/** Solo para tests */
export function useDB(d: ObraDB) { db = d; }
