// Única puerta de entrada a los datos. Las pantallas solo llaman a estas funciones,
// así que pasar a Supabase en la v2 consiste en reescribir este archivo.
import { db, SYNC_TABLES } from './db';
import { lineCost, sumTotals, totalsByPartida, EMPTY_TOTALS, type Totals } from '../lib/calc';
import { norm } from '../lib/format';
import type {
  Attachment, AttachmentKind, Client, DailyReport, Expense, ExpenseConcept, LaborEntry, Material, MaterialEntry,
  Partida, PartidaTemplate, Project, ProjectStatus, Worker,
} from './types';
import { SUGGESTED_PARTIDAS } from './types';

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
const now = () => new Date().toISOString();
const alive = <T extends { deleted_at?: string | null }>(r: T) => !r.deleted_at;
const stamp = () => { const t = now(); return { created_at: t, updated_at: t }; };

// ───────────────────────── Obras y clientes

export interface ProjectInput {
  id?: string;
  name: string;
  client_name: string;
  address?: string;
  start_date?: string | null;
  end_date?: string | null;
  status: ProjectStatus;
  budget_cents?: number | null;
  notes?: string;
}

export async function listProjects(): Promise<Project[]> {
  return (await db.projects.toArray()).filter(alive);
}

export async function getProject(id: string) {
  const p = await db.projects.get(id);
  return p && alive(p) ? p : undefined;
}

export async function listClients(): Promise<Client[]> {
  return (await db.clients.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function clientMap(): Promise<Map<string, Client>> {
  return new Map((await db.clients.toArray()).map((c) => [c.id, c]));
}

async function ensureClient(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const existing = (await db.clients.toArray()).find((c) => alive(c) && norm(c.name) === norm(n));
  if (existing) return existing.id;
  const id = uid();
  await db.clients.add({ id, name: n, ...stamp() });
  return id;
}

export async function saveProject(input: ProjectInput): Promise<string> {
  return db.transaction('rw', db.projects, db.clients, async () => {
    const client_id = await ensureClient(input.client_name);
    const data = {
      name: input.name.trim(),
      client_id,
      address: input.address?.trim() || '',
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      status: input.status,
      budget_cents: input.budget_cents ?? null,
      notes: input.notes?.trim() || '',
    };
    if (input.id) {
      await db.projects.update(input.id, { ...data, updated_at: now() });
      return input.id;
    }
    const id = uid();
    await db.projects.add({ id, ...data, ...stamp() });
    return id;
  });
}

export async function deleteProject(id: string) {
  await db.projects.update(id, { deleted_at: now() });
}

// ───────────────────────── Totales

export interface ProjectData {
  /** Partidas de la obra (también las archivadas), en su orden */
  partidas: Partida[];
  reports: DailyReport[];
  labor: LaborEntry[];
  materials: MaterialEntry[];
  expenses: Expense[];
}

export async function projectData(projectId: string): Promise<ProjectData> {
  const [partidas, reports, labor, materials, expenses] = await Promise.all([
    listPartidas(projectId),
    db.reports.where('project_id').equals(projectId).toArray(),
    db.labor.where('project_id').equals(projectId).toArray(),
    db.materialEntries.where('project_id').equals(projectId).toArray(),
    db.expenses.where('project_id').equals(projectId).toArray(),
  ]);
  const liveReports = new Set(reports.filter(alive).map((r) => r.id));
  // Una línea cuenta si no está borrada y su parte (si tiene) tampoco.
  const inLiveReport = (r: { report_id?: string | null }) => !r.report_id || liveReports.has(r.report_id);
  return {
    partidas,
    reports: reports.filter(alive).sort((a, b) => b.date.localeCompare(a.date)),
    labor: labor.filter((l) => alive(l) && inLiveReport(l)),
    materials: materials.filter((m) => alive(m) && inLiveReport(m)),
    expenses: expenses.filter((e) => alive(e) && inLiveReport(e)).sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Totales de todas las obras, para el panel de inicio. */
export async function allTotals(): Promise<Map<string, Totals & { lastDate?: string }>> {
  const [reports, labor, materials, expenses] = await Promise.all([
    db.reports.toArray(), db.labor.toArray(), db.materialEntries.toArray(), db.expenses.toArray(),
  ]);
  const liveReports = new Map(reports.filter(alive).map((r) => [r.id, r]));
  const ok = (r: { deleted_at?: string | null; report_id?: string | null }) =>
    alive(r) && (!r.report_id || liveReports.has(r.report_id));
  const group = <T extends { project_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.project_id, [...(m.get(r.project_id) || []), r]);
    return m;
  };
  const L = group(labor.filter(ok)), M = group(materials.filter(ok)), E = group(expenses.filter(ok));
  const out = new Map<string, Totals & { lastDate?: string }>();
  const ids = new Set([...L.keys(), ...M.keys(), ...E.keys()]);
  for (const id of ids) out.set(id, sumTotals(L.get(id) || [], M.get(id) || [], E.get(id) || []));
  for (const r of liveReports.values()) {
    const t = out.get(r.project_id);
    if (t && (!t.lastDate || r.date > t.lastDate)) t.lastDate = r.date;
  }
  return out;
}

// ───────────────────────── Partidas

export interface PartidaInput {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  budget_cents?: number | null;
  status?: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
  quantity?: number | null;
  unit?: string | null;
  archived?: boolean;
}
export interface PartidaSeed { name: string; unit?: string | null; description?: string }

const byOrder = (a: Partida, b: Partida) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at);

/** Partidas de una obra en su orden (incluidas las archivadas, que llevan archived = true). */
export async function listPartidas(projectId: string): Promise<Partida[]> {
  return (await db.partidas.where('project_id').equals(projectId).toArray()).filter(alive).sort(byOrder);
}

export async function getPartida(id: string) {
  const p = await db.partidas.get(id);
  return p && alive(p) ? p : undefined;
}

export async function savePartida(input: PartidaInput): Promise<string> {
  const data = {
    name: input.name.trim(),
    description: input.description?.trim() || '',
    budget_cents: input.budget_cents ?? null,
    status: input.status || 'pendiente',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    notes: input.notes?.trim() || '',
    quantity: input.quantity ?? null,
    unit: input.unit || null,
    archived: !!input.archived,
  };
  if (input.id) {
    await db.partidas.update(input.id, { ...data, updated_at: now() });
    return input.id;
  }
  const id = uid();
  const last = (await listPartidas(input.project_id)).at(-1);
  await db.partidas.add({ id, project_id: input.project_id, ...data, sort_order: (last?.sort_order ?? -1) + 1, ...stamp() });
  return id;
}

/** Añade varias partidas de golpe (plantilla, habituales, copiar de otra obra). No repite nombres. */
export async function addPartidas(projectId: string, items: PartidaSeed[]): Promise<number> {
  return db.transaction('rw', db.partidas, async () => {
    const existing = await listPartidas(projectId);
    const seen = new Set(existing.map((p) => norm(p.name)));
    let order = (existing.at(-1)?.sort_order ?? -1) + 1;
    let added = 0;
    const t = now();
    for (const it of items) {
      const name = it.name.trim();
      if (!name || seen.has(norm(name))) continue;
      seen.add(norm(name));
      await db.partidas.add({
        id: uid(), project_id: projectId, name, description: it.description || '', status: 'pendiente', unit: it.unit || null,
        quantity: null, budget_cents: null, notes: '', sort_order: order++, archived: false, created_at: incr(t, added), updated_at: t,
      });
      added++;
    }
    return added;
  });
}

/** Sube (-1) o baja (+1) una partida en la lista. */
export async function movePartida(projectId: string, id: string, dir: -1 | 1) {
  await db.transaction('rw', db.partidas, async () => {
    const list = await listPartidas(projectId);
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, p] of list.entries()) if (p.sort_order !== k) await db.partidas.update(p.id, { sort_order: k });
  });
}

/** Borra la partida. Sus horas, materiales y gastos NO se borran: pasan a «Sin partida». */
export async function deletePartida(id: string) {
  const t = now();
  await db.transaction('rw', [db.partidas, db.labor, db.materialEntries, db.expenses, db.attachments], async () => {
    await db.partidas.update(id, { deleted_at: t });
    const free = { partida_id: null, updated_at: t };
    await db.labor.where('partida_id').equals(id).modify(free);
    await db.materialEntries.where('partida_id').equals(id).modify(free);
    await db.expenses.where('partida_id').equals(id).modify(free);
    await db.attachments.where('partida_id').equals(id).modify(free);
  });
}

/** Partidas usadas en otras obras, las más usadas primero; si aún no hay, las típicas de reforma. */
export async function habitualPartidas(): Promise<(PartidaSeed & { count: number })[]> {
  const liveProjects = new Set((await listProjects()).map((p) => p.id));
  const all = (await db.partidas.toArray()).filter((p) => alive(p) && liveProjects.has(p.project_id));
  const m = new Map<string, PartidaSeed & { count: number; last: string }>();
  for (const p of all) {
    const k = norm(p.name);
    const r = m.get(k) || { name: p.name, unit: p.unit, count: 0, last: '' };
    r.count++;
    if (p.created_at > r.last) { r.last = p.created_at; r.name = p.name; r.unit = p.unit || r.unit; }
    m.set(k, r);
  }
  for (const s of SUGGESTED_PARTIDAS) if (!m.has(norm(s.name))) m.set(norm(s.name), { ...s, count: 0, last: '' });
  return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).map(({ last: _l, ...r }) => r);
}

/** Obras que ya tienen partidas, para «Copiar de otra obra». */
export async function projectsWithPartidas(exceptId?: string) {
  const [projects, partidas] = await Promise.all([listProjects(), db.partidas.toArray()]);
  const by = new Map<string, Partida[]>();
  for (const p of partidas) if (alive(p)) by.set(p.project_id, [...(by.get(p.project_id) || []), p]);
  return projects
    .filter((p) => p.id !== exceptId && by.has(p.id))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((project) => ({ project, partidas: by.get(project.id)!.sort(byOrder) }));
}

export async function listTemplates(): Promise<PartidaTemplate[]> {
  return (await db.partidaTemplates.toArray()).filter(alive).sort((a, b) => b.use_count - a.use_count || a.name.localeCompare(b.name, 'es'));
}

/** Guarda una plantilla. Si ya hay una con ese nombre, la sustituye. */
export async function saveTemplate(name: string, items: PartidaSeed[]) {
  const n = name.trim();
  const clean = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), unit: i.unit || null }));
  const existing = (await listTemplates()).find((t) => norm(t.name) === norm(n));
  if (existing) await db.partidaTemplates.update(existing.id, { items: clean, updated_at: now() });
  else await db.partidaTemplates.add({ id: uid(), name: n, items: clean, use_count: 0, ...stamp() });
}

export async function deleteTemplate(id: string) {
  await db.partidaTemplates.update(id, { deleted_at: now() });
}

export async function templateUsed(id: string) {
  const t = await db.partidaTemplates.get(id);
  if (t) await db.partidaTemplates.update(id, { use_count: (t.use_count || 0) + 1 });
}

/** Una partida con sus líneas (para su pantalla de detalle). id '' = lo que no tiene partida. */
export async function partidaData(projectId: string, partidaId: string) {
  const d = await projectData(projectId);
  const known = new Set(d.partidas.map((p) => p.id));
  const mine = (r: { partida_id?: string | null }) =>
    partidaId ? r.partida_id === partidaId : !r.partida_id || !known.has(r.partida_id);
  const labor = d.labor.filter(mine), materials = d.materials.filter(mine), expenses = d.expenses.filter(mine);
  const used = new Set([...labor, ...materials].map((l) => l.report_id).concat(expenses.map((e) => e.report_id || '')));
  return { ...d, labor, materials, expenses, reports: d.reports.filter((r) => used.has(r.id)) };
}

export interface PartidaStat { partida: Partida; project: Project; totals: Totals }
export interface PartidaGroup { key: string; name: string; rows: PartidaStat[] }

/** Todas las partidas de todas las obras agrupadas por nombre, para comparar costes entre obras. */
export async function partidaAnalysis(): Promise<PartidaGroup[]> {
  const [projects, partidas, reports, labor, materials, expenses] = await Promise.all([
    listProjects(), db.partidas.toArray(), db.reports.toArray(), db.labor.toArray(), db.materialEntries.toArray(), db.expenses.toArray(),
  ]);
  const pById = new Map(projects.map((p) => [p.id, p]));
  const liveReports = new Set(reports.filter(alive).map((r) => r.id));
  const ok = (r: { deleted_at?: string | null; report_id?: string | null }) => alive(r) && (!r.report_id || liveReports.has(r.report_id));
  const live = partidas.filter((p) => alive(p) && pById.has(p.project_id));
  const totals = totalsByPartida(labor.filter(ok), materials.filter(ok), expenses.filter(ok), new Set(live.map((p) => p.id)));
  const groups = new Map<string, PartidaGroup>();
  for (const p of live) {
    const k = norm(p.name);
    const g = groups.get(k) || { key: k, name: p.name, rows: [] };
    g.rows.push({ partida: p, project: pById.get(p.project_id)!, totals: totals.get(p.id) || EMPTY_TOTALS });
    groups.set(k, g);
  }
  return [...groups.values()];
}

// ───────────────────────── Catálogo (aprende de lo que se introduce)

export async function listWorkers() { return (await db.workers.toArray()).filter(alive); }
export async function listMaterials() { return (await db.materials.toArray()).filter(alive); }
export async function listConcepts() { return (await db.concepts.toArray()).filter(alive); }

export async function saveWorker(w: Partial<Worker> & { name: string }) {
  if (w.id) return db.workers.update(w.id, { ...w, updated_at: now() });
  return db.workers.add({ id: uid(), default_rate_cents: 0, active: true, use_count: 0, ...w, ...stamp() } as Worker);
}
export async function saveMaterial(m: Partial<Material> & { name: string }) {
  if (m.id) return db.materials.update(m.id, { ...m, updated_at: now() });
  return db.materials.add({ id: uid(), default_unit: 'ud', last_price_cents: 0, use_count: 0, ...m, ...stamp() } as Material);
}
export async function saveConcept(c: Partial<ExpenseConcept> & { name: string }) {
  if (c.id) return db.concepts.update(c.id, { ...c, updated_at: now() });
  return db.concepts.add({ id: uid(), category: 'Otros', use_count: 0, ...c, ...stamp() } as ExpenseConcept);
}
export async function deleteCatalogItem(kind: 'workers' | 'materials' | 'concepts', id: string) {
  await db[kind].update(id, { deleted_at: now() });
}

// ───────────────────────── Partes diarios

export interface LaborLine { id?: string; partida_id?: string | null; worker_id?: string | null; worker_name: string; hours: number; rate_cents: number; save_rate?: boolean }
export interface MaterialLine { id?: string; partida_id?: string | null; material_id?: string | null; material_name: string; unit: string; quantity: number; unit_price_cents: number }
export interface ExpenseLine { id?: string; partida_id?: string | null; category: string; concept: string; amount_cents: number; note?: string; files?: File[] }

export interface ReportInput {
  id?: string;
  project_id: string;
  date: string;
  notes?: string;
  labor: LaborLine[];
  materials: MaterialLine[];
  expenses: ExpenseLine[];
}

export async function findReport(projectId: string, date: string) {
  const r = await db.reports.where('[project_id+date]').equals([projectId, date]).toArray();
  return r.find(alive);
}

export async function getReport(id: string) {
  const report = await db.reports.get(id);
  if (!report || !alive(report)) return undefined;
  const [labor, materials, expenses] = await Promise.all([
    db.labor.where('report_id').equals(id).toArray(),
    db.materialEntries.where('report_id').equals(id).toArray(),
    db.expenses.where('report_id').equals(id).toArray(),
  ]);
  const byCreated = <T extends { created_at: string }>(a: T, b: T) => a.created_at.localeCompare(b.created_at);
  return {
    report,
    labor: labor.filter(alive).sort(byCreated),
    materials: materials.filter(alive).sort(byCreated),
    expenses: expenses.filter(alive).sort(byCreated),
  };
}

/** El último parte de la obra anterior a esa fecha (para "Copiar día anterior"). */
export async function previousReport(projectId: string, beforeDate: string) {
  const reports = (await db.reports.where('project_id').equals(projectId).toArray())
    .filter((r) => alive(r) && r.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date));
  return reports[0] ? getReport(reports[0].id) : undefined;
}

async function findByName<T extends { name: string; deleted_at?: string | null }>(rows: T[], name: string) {
  return rows.find((r) => alive(r) && norm(r.name) === norm(name));
}

/**
 * Guarda el parte completo en una transacción. Las líneas guardan su propio precio
 * (histórico intocable) y el catálogo aprende: crea trabajadores/materiales/conceptos nuevos,
 * suma usos y recuerda el último precio de cada material.
 */
export async function saveReport(input: ReportInput): Promise<string> {
  const t = now();
  const pendingFiles: { expenseId: string; partidaId: string | null; files: File[] }[] = [];
  const reportId = await db.transaction(
    'rw',
    [db.reports, db.labor, db.materialEntries, db.expenses, db.workers, db.materials, db.concepts, db.attachments],
    async () => {
      let id = input.id;
      if (!id) {
        const clash = await findReport(input.project_id, input.date);
        id = clash?.id;
      }
      if (id) {
        await db.reports.update(id, { date: input.date, notes: input.notes || '', updated_at: t });
      } else {
        id = uid();
        await db.reports.add({ id, project_id: input.project_id, date: input.date, notes: input.notes || '', created_at: t, updated_at: t });
      }
      const rid = id;

      // ── Mano de obra
      const workers = await db.workers.toArray();
      const keepLabor = new Set<string>();
      for (const [i, l] of input.labor.entries()) {
        if (!l.worker_name.trim()) continue;
        let w = l.worker_id ? workers.find((x) => x.id === l.worker_id) : await findByName(workers, l.worker_name);
        if (!w) {
          w = { id: uid(), name: l.worker_name.trim(), default_rate_cents: l.rate_cents, active: true, use_count: 0, created_at: t, updated_at: t };
          await db.workers.add(w);
          workers.push(w);
        }
        await db.workers.update(w.id, {
          use_count: (w.use_count || 0) + 1, last_used_at: t, updated_at: t,
          ...(l.save_rate ? { default_rate_cents: l.rate_cents } : {}),
        });
        const row = {
          report_id: rid, project_id: input.project_id, partida_id: l.partida_id ?? null, worker_id: w.id, worker_name: l.worker_name.trim(),
          hours: l.hours, rate_cents: l.rate_cents, cost_cents: lineCost(l.hours, l.rate_cents), updated_at: t,
        };
        const lid = l.id || uid();
        if (l.id) await db.labor.update(l.id, row);
        else await db.labor.add({ id: lid, ...row, created_at: incr(t, i) });
        keepLabor.add(lid);
      }

      // ── Materiales
      const mats = await db.materials.toArray();
      const keepMat = new Set<string>();
      for (const [i, m] of input.materials.entries()) {
        if (!m.material_name.trim()) continue;
        let cat = m.material_id ? mats.find((x) => x.id === m.material_id) : await findByName(mats, m.material_name);
        if (!cat) {
          cat = { id: uid(), name: m.material_name.trim(), default_unit: m.unit, last_price_cents: m.unit_price_cents, use_count: 0, created_at: t, updated_at: t };
          await db.materials.add(cat);
          mats.push(cat);
        }
        // El catálogo recuerda el último precio y unidad usados; las líneas antiguas no se tocan.
        await db.materials.update(cat.id, {
          use_count: (cat.use_count || 0) + 1, last_used_at: t, updated_at: t,
          last_price_cents: m.unit_price_cents, default_unit: m.unit,
        });
        const row = {
          report_id: rid, project_id: input.project_id, partida_id: m.partida_id ?? null, material_id: cat.id, material_name: m.material_name.trim(),
          unit: m.unit, quantity: m.quantity, unit_price_cents: m.unit_price_cents,
          cost_cents: lineCost(m.quantity, m.unit_price_cents), updated_at: t,
        };
        const mid = m.id || uid();
        if (m.id) await db.materialEntries.update(m.id, row);
        else await db.materialEntries.add({ id: mid, ...row, created_at: incr(t, i) });
        keepMat.add(mid);
      }

      // ── Otros gastos
      const concepts = await db.concepts.toArray();
      const keepExp = new Set<string>();
      for (const [i, e] of input.expenses.entries()) {
        const concept = e.concept.trim() || e.category;
        if (!concept) continue;
        let c = await findByName(concepts, concept);
        if (!c) {
          c = { id: uid(), name: concept, category: e.category, use_count: 0, created_at: t, updated_at: t };
          await db.concepts.add(c);
          concepts.push(c);
        }
        await db.concepts.update(c.id, { use_count: (c.use_count || 0) + 1, last_used_at: t, updated_at: t, last_amount_cents: e.amount_cents, category: e.category });
        const row = {
          project_id: input.project_id, report_id: rid, partida_id: e.partida_id ?? null, date: input.date, category: e.category,
          concept, amount_cents: e.amount_cents, note: e.note || '', updated_at: t,
        };
        const eid = e.id || uid();
        if (e.id) await db.expenses.update(e.id, row);
        else await db.expenses.add({ id: eid, ...row, created_at: incr(t, i) });
        keepExp.add(eid);
        if (e.files?.length) pendingFiles.push({ expenseId: eid, partidaId: e.partida_id ?? null, files: e.files });
      }

      // Líneas quitadas del parte: borrado lógico, nunca físico.
      const del = { deleted_at: t };
      await db.labor.where('report_id').equals(rid).filter((r) => alive(r) && !keepLabor.has(r.id)).modify(del);
      await db.materialEntries.where('report_id').equals(rid).filter((r) => alive(r) && !keepMat.has(r.id)).modify(del);
      await db.expenses.where('report_id').equals(rid).filter((r) => alive(r) && !keepExp.has(r.id)).modify(del);
      return rid;
    },
  );
  // Las fotos se comprimen fuera de la transacción (usa canvas, que es asíncrono).
  for (const p of pendingFiles) for (const f of p.files) await addAttachment(input.project_id, f, 'ticket', p.expenseId, p.partidaId);
  return reportId;
}

/** Mantiene el orden en que se añadieron las líneas aunque se guarden en el mismo milisegundo. */
const incr = (iso: string, i: number) => new Date(new Date(iso).getTime() + i).toISOString();

export async function deleteReport(id: string) {
  await db.reports.update(id, { deleted_at: now() });
}

// ───────────────────────── Gastos sueltos

export async function saveExpense(e: ExpenseLine & { project_id: string; date: string }) {
  const t = now();
  const concept = e.concept.trim() || e.category;
  const existing = (await db.concepts.toArray()).find((c) => alive(c) && norm(c.name) === norm(concept));
  if (existing) await db.concepts.update(existing.id, { use_count: existing.use_count + 1, last_used_at: t, last_amount_cents: e.amount_cents, category: e.category });
  else await db.concepts.add({ id: uid(), name: concept, category: e.category, use_count: 1, last_used_at: t, last_amount_cents: e.amount_cents, created_at: t, updated_at: t });
  const row = { project_id: e.project_id, partida_id: e.partida_id ?? null, date: e.date, category: e.category, concept, amount_cents: e.amount_cents, note: e.note || '', updated_at: t };
  const id = e.id || uid();
  if (e.id) await db.expenses.update(e.id, row);
  else await db.expenses.add({ id, report_id: null, ...row, created_at: t });
  for (const f of e.files || []) await addAttachment(e.project_id, f, 'ticket', id, e.partida_id);
  return id;
}

export async function deleteExpense(id: string) {
  await db.expenses.update(id, { deleted_at: now() });
}

// ───────────────────────── Fotos y documentos

export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function addAttachment(projectId: string, file: File, kind: AttachmentKind, expenseId?: string | null, partidaId?: string | null) {
  const blob = await compressImage(file);
  const a: Attachment = {
    id: uid(), project_id: projectId, expense_id: expenseId ?? null, partida_id: partidaId ?? null, kind,
    name: file.name || 'foto.jpg', mime: blob.type || file.type, size: blob.size, blob, ...stamp(),
  };
  await db.attachments.add(a);
  return a.id;
}

export async function listAttachments(projectId: string) {
  return (await db.attachments.where('project_id').equals(projectId).toArray())
    .filter(alive)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function attachmentsForExpense(expenseId: string) {
  return (await db.attachments.where('expense_id').equals(expenseId).toArray()).filter(alive);
}

export async function deleteAttachment(id: string) {
  await db.attachments.update(id, { deleted_at: now() });
}

// ───────────────────────── Búsqueda general

export type SearchHit =
  | { type: 'obra'; id: string; title: string; sub: string }
  | { type: 'parte'; id: string; projectId: string; title: string; sub: string }
  | { type: 'trabajador'; id: string; title: string; sub: string; projectIds: string[] }
  | { type: 'material'; id: string; title: string; sub: string; projectIds: string[] }
  | { type: 'gasto'; id: string; projectId: string; title: string; sub: string };

export async function search(q: string): Promise<SearchHit[]> {
  const n = norm(q);
  if (n.length < 2) return [];
  const has = (...s: (string | undefined | null)[]) => s.some((x) => x && norm(x).includes(n));
  const [projects, clients, workers, materials, labor, matEntries, expenses, reports] = await Promise.all([
    listProjects(), clientMap(), listWorkers(), listMaterials(),
    db.labor.toArray(), db.materialEntries.toArray(), db.expenses.toArray(), db.reports.toArray(),
  ]);
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  const liveReports = new Map(reports.filter((r) => alive(r) && pName.has(r.project_id)).map((r) => [r.id, r]));
  const hits: SearchHit[] = [];

  for (const p of projects) {
    const client = p.client_id ? clients.get(p.client_id)?.name : '';
    if (has(p.name, client, p.address, p.notes)) hits.push({ type: 'obra', id: p.id, title: p.name, sub: [client, p.address].filter(Boolean).join(' · ') });
  }
  for (const w of workers) {
    if (!has(w.name)) continue;
    const ids = [...new Set(labor.filter((l) => alive(l) && l.worker_id === w.id && liveReports.has(l.report_id)).map((l) => l.project_id))];
    hits.push({ type: 'trabajador', id: w.id, title: w.name, sub: ids.length ? ids.map((i) => pName.get(i)).join(', ') : 'Sin partes todavía', projectIds: ids });
  }
  for (const m of materials) {
    if (!has(m.name)) continue;
    const ids = [...new Set(matEntries.filter((l) => alive(l) && l.material_id === m.id && liveReports.has(l.report_id)).map((l) => l.project_id))];
    hits.push({ type: 'material', id: m.id, title: m.name, sub: ids.length ? ids.map((i) => pName.get(i)).join(', ') : 'Sin usar todavía', projectIds: ids });
  }
  for (const e of expenses) {
    if (!alive(e) || !pName.has(e.project_id) || (e.report_id && !liveReports.has(e.report_id))) continue;
    if (has(e.concept, e.category, e.note)) hits.push({ type: 'gasto', id: e.id, projectId: e.project_id, title: e.concept, sub: `${pName.get(e.project_id)} · ${e.date}` });
  }
  // Partes: por fecha (12/10 o 2026-10-12), notas o nombres de trabajadores
  const dateQ = q.trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  for (const r of liveReports.values()) {
    const [y, m, d] = r.date.split('-');
    const dateHit = dateQ && +dateQ[1] === +d && +dateQ[2] === +m && (!dateQ[3] || dateQ[3].endsWith(y.slice(-dateQ[3].length)));
    const names = labor.filter((l) => alive(l) && l.report_id === r.id).map((l) => l.worker_name);
    if (dateHit || has(r.notes) || r.date.includes(q.trim())) {
      hits.push({ type: 'parte', id: r.id, projectId: r.project_id, title: `${d}/${m}/${y}`, sub: `${pName.get(r.project_id)} · ${names.join(', ') || 'sin trabajadores'}` });
    }
  }
  return hits;
}

// ───────────────────────── Copia de seguridad

const TABLES = SYNC_TABLES;

const blobToDataURL = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

export async function exportBackup(includeFiles = true): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await (db as any)[t].toArray();
    out[t] = t === 'attachments'
      ? includeFiles ? await Promise.all(rows.map(async (a: Attachment) => ({ ...a, blob: a.blob ? await blobToDataURL(a.blob) : null }))) : []
      : rows;
  }
  return JSON.stringify({ app: 'app-obra', version: 1, exported_at: now(), data: out });
}

export async function importBackup(json: string) {
  const parsed = JSON.parse(json);
  if (parsed.app !== 'app-obra' || !parsed.data) throw new Error('El archivo no es una copia de seguridad de esta app.');
  const data = parsed.data as Record<string, any[]>;
  if (data.attachments) {
    data.attachments = await Promise.all(data.attachments.map(async (a) => ({ ...a, blob: a.blob ? await (await fetch(a.blob)).blob() : undefined })));
  }
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const t of TABLES) {
      await (db as any)[t].clear();
      if (data[t]?.length) await (db as any)[t].bulkAdd(data[t].map(({ _dirty, _v, ...r }: any) => r));
    }
  });
}

export async function isEmpty() {
  return (await db.projects.count()) === 0;
}

export async function hasExamples() {
  return (await db.projects.filter((p) => !!p.example && alive(p)).count()) > 0;
}

/** Borra físicamente los datos de ejemplo y lo que se haya apuntado dentro de las obras de ejemplo. */
export async function clearExamples() {
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    const exampleProjects = new Set((await db.projects.toArray()).filter((p) => p.example).map((p) => p.id));
    for (const t of TABLES) {
      await (db as any)[t].filter((r: any) => !!r.example || (r.project_id && exampleProjects.has(r.project_id))).delete();
    }
  });
}
