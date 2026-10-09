import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ObraDB, useDB, db } from './db';
import { SyncEngine } from './sync';
import { saveProject, saveReport, deleteReport, projectData, findReport, saveMaterial, listMaterials } from './repo';
import { sumTotals } from '../lib/calc';

import { fakeSupabase } from './fakeSupabase.testutil';

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

  it('dos personas apuntan sin conexión en la misma obra y día: se juntan en un solo parte', async () => {
    useDB(A);
    const pid = await saveProject({ name: 'Casa', client_name: '', status: 'en_curso' });
    const a = new SyncEngine(sb, 'u');
    await a.syncNow();
    useDB(B);
    const b = new SyncEngine(sb, 'u');
    await b.syncNow();
    // Los dos, sin conexión, crean el parte de hoy
    await saveReport({ project_id: pid, date: '2026-10-05', notes: 'Padre: llegó el pedido', labor: [{ worker_name: 'Juan', hours: 8, rate_cents: 1800 }], materials: [], expenses: [] });
    useDB(A);
    await saveReport({ project_id: pid, date: '2026-10-05', notes: 'Jose: falta yeso', labor: [], materials: [{ material_name: 'Yeso', unit: 'saco', quantity: 4, unit_price_cents: 720 }], expenses: [] });
    await a.syncNow();
    expect(a.state.kind).toBe('idle');
    useDB(B);
    await b.syncNow();
    expect(b.state).toMatchObject({ kind: 'idle', pending: 0 });
    useDB(A);
    await a.syncNow();
    for (const d of [A, B]) {
      useDB(d);
      const data = await projectData(pid);
      expect(data.reports).toHaveLength(1);
      expect(sumTotals(data.labor, data.materials, data.expenses).totalCents).toBe(14400 + 2880);
      expect(data.reports[0].notes).toContain('falta yeso');
      expect(data.reports[0].notes).toContain('llegó el pedido');
    }
  });
});
