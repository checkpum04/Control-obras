import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { ObraDB, useDB, db } from './db';
import { SyncEngine } from './sync';
import {
  addPartidas, deletePartida, listPartidas, movePartida, partidaAnalysis, partidaData, projectData, saveExpense, savePartida, saveProject,
  saveReport, getReport,
} from './repo';
import { sumTotals, totalsByPartida } from '../lib/calc';
import { fakeSupabase } from './fakeSupabase.testutil';

let n = 0;
const fresh = () => { const d = new ObraDB(`p-${++n}`); useDB(d); return d; };

describe('partidas', () => {
  beforeEach(() => { fresh(); });

  it('un mismo parte reparte horas, materiales y gastos entre varias partidas', async () => {
    const pid = await saveProject({ name: 'Calle Mayor', client_name: '', status: 'en_curso' });
    await addPartidas(pid, [{ name: 'Albañilería' }, { name: 'Pladur', unit: 'm²' }]);
    const [alb, pla] = await listPartidas(pid);
    await saveReport({
      project_id: pid, date: '2026-10-09',
      labor: [
        { worker_name: 'Juan', hours: 4, rate_cents: 2000, partida_id: alb.id },
        { worker_name: 'Juan', hours: 4, rate_cents: 2000, partida_id: pla.id },
        { worker_name: 'Pedro', hours: 8, rate_cents: 1500, partida_id: pla.id },
      ],
      materials: [{ material_name: 'Placa Pladur', unit: 'ud', quantity: 15, unit_price_cents: 420, partida_id: pla.id }],
      expenses: [{ category: 'Transporte', concept: 'Transporte', amount_cents: 5000, partida_id: pla.id }],
    });
    const d = await projectData(pid);
    expect(d.reports).toHaveLength(1);
    expect(d.labor).toHaveLength(3);
    const t = totalsByPartida(d.labor, d.materials, d.expenses, new Set(d.partidas.map((p) => p.id)));
    expect(t.get(alb.id)!.totalCents).toBe(8000);
    expect(t.get(pla.id)).toEqual({ hours: 12, laborCents: 20000, materialsCents: 6300, expensesCents: 5000, totalCents: 31300 });
    // La obra sigue sumando lo mismo que antes
    expect(sumTotals(d.labor, d.materials, d.expenses).totalCents).toBe(39300);
    const pd = await partidaData(pid, pla.id);
    expect(pd.reports).toHaveLength(1);
    expect(pd.labor.map((l) => l.worker_name).sort()).toEqual(['Juan', 'Pedro']);
  });

  it('no repite nombres, se reordenan y al borrar una partida sus costes pasan a «Sin partida»', async () => {
    const pid = await saveProject({ name: 'Olivo', client_name: '', status: 'en_curso' });
    expect(await addPartidas(pid, [{ name: 'Pintura' }, { name: 'Solado' }, { name: 'pintura' }])).toBe(2);
    let [pin, sol] = await listPartidas(pid);
    await movePartida(pid, sol.id, -1);
    expect((await listPartidas(pid)).map((p) => p.name)).toEqual(['Solado', 'Pintura']);
    await saveExpense({ project_id: pid, date: '2026-10-09', category: 'Otros', concept: 'Rodillos', amount_cents: 2000, partida_id: pin.id });
    await deletePartida(pin.id);
    [sol] = await listPartidas(pid);
    expect(sol.name).toBe('Solado');
    const sin = await partidaData(pid, '');
    expect(sin.expenses.map((e) => e.concept)).toEqual(['Rodillos']);
  });

  it('compara la misma partida entre obras con el coste por unidad', async () => {
    for (const [name, qty, cost] of [['Obra A', 80, 240000], ['Obra B', 120, 336000]] as const) {
      const pid = await saveProject({ name, client_name: '', status: 'en_curso' });
      const id = await savePartida({ project_id: pid, name: 'Pladur', quantity: qty, unit: 'm²', budget_cents: 300000 });
      await saveExpense({ project_id: pid, date: '2026-10-01', category: 'Subcontratistas', concept: 'Pladur', amount_cents: cost, partida_id: id });
    }
    const g = (await partidaAnalysis()).find((x) => x.key === 'pladur')!;
    expect(g.rows.map((r) => r.totals.totalCents / r.partida.quantity!).sort()).toEqual([2800, 3000]);
  });

  it('los datos de antes de las partidas siguen ahí al actualizar la app', async () => {
    // Base de datos tal como la dejaba la versión anterior (v1, sin partidas)
    const name = `old-${++n}`;
    const old = new Dexie(name);
    old.version(1).stores({
      clients: 'id, name', projects: 'id, status, client_id, updated_at', workers: 'id, name', materials: 'id, name', concepts: 'id, name',
      reports: 'id, project_id, date, [project_id+date]', labor: 'id, report_id, project_id, worker_id',
      materialEntries: 'id, report_id, project_id, material_id', expenses: 'id, project_id, report_id, date', attachments: 'id, project_id, expense_id', meta: 'key',
    });
    const t = '2026-10-01T10:00:00.000Z';
    await old.table('projects').add({ id: 'p1', name: 'Vieja', status: 'en_curso', created_at: t, updated_at: t, _dirty: 0 });
    await old.table('reports').add({ id: 'r1', project_id: 'p1', date: '2026-10-01', created_at: t, updated_at: t, _dirty: 0 });
    await old.table('labor').add({ id: 'l1', report_id: 'r1', project_id: 'p1', worker_name: 'Juan', hours: 8, rate_cents: 1800, cost_cents: 14400, created_at: t, updated_at: t, _dirty: 0 });
    old.close();

    useDB(new ObraDB(name));
    const d = await projectData('p1');
    expect(d.partidas).toEqual([]);
    expect(sumTotals(d.labor, d.materials, d.expenses).totalCents).toBe(14400);
    expect((await partidaData('p1', '')).labor).toHaveLength(1);
    // Editar el parte antiguo sin tocar partidas no cambia nada
    const r = (await getReport('r1'))!;
    await saveReport({ id: 'r1', project_id: 'p1', date: r.report.date, labor: r.labor, materials: [], expenses: [] });
    expect((await db.labor.get('l1'))!.partida_id).toBeNull();
  });

  it('las partidas y sus líneas se copian al otro móvil', async () => {
    const sb = fakeSupabase();
    const A = fresh();
    const pid = await saveProject({ name: 'Casa', client_name: '', status: 'en_curso' });
    const pla = await savePartida({ project_id: pid, name: 'Pladur', quantity: 100, unit: 'm²', budget_cents: 400000 });
    await saveReport({ project_id: pid, date: '2026-10-09', labor: [{ worker_name: 'Juan', hours: 8, rate_cents: 2000, partida_id: pla }], materials: [], expenses: [] });
    await new SyncEngine(sb, 'u').syncNow();
    expect(sb.tables.get('partidas').get(pla).quantity).toBe(100);
    expect([...sb.tables.get('labor_entries').values()][0].partida_id).toBe(pla);

    fresh();
    await new SyncEngine(sb, 'u').syncNow();
    const p = (await listPartidas(pid))[0];
    expect(p).toMatchObject({ id: pla, name: 'Pladur', quantity: 100, budget_cents: 400000 });
    expect((await partidaData(pid, pla)).labor[0].cost_cents).toBe(16000);
    useDB(A);
  });
});
