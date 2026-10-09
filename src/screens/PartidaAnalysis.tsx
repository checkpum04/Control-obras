import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { partidaAnalysis, type PartidaGroup } from '../data/repo';
import { round2, sumTotals, unitCost, type Totals } from '../lib/calc';
import { euros, eurosRound, hours as fmtHours, number, pct } from '../lib/format';
import { navigate } from '../lib/router';
import { CostBreakdown, Empty, Icon, TopBar } from '../components/ui';

interface Stats {
  totals: Totals;
  /** Presupuesto − coste, sumando solo las partidas que tienen presupuesto. null si ninguna lo tiene. */
  margin: number | null;
  budget: number;
  /** Coste medio por unidad (la unidad más usada), ponderado por cantidad */
  unit: string | null;
  avgUnit: number | null;
  minUnit: number | null;
  maxUnit: number | null;
}

function stats(g: PartidaGroup): Stats {
  const totals = g.rows.reduce<Totals>((a, r) => ({
    hours: round2(a.hours + r.totals.hours), laborCents: a.laborCents + r.totals.laborCents, materialsCents: a.materialsCents + r.totals.materialsCents,
    expensesCents: a.expensesCents + r.totals.expensesCents, totalCents: a.totalCents + r.totals.totalCents,
  }), sumTotals([], [], []));
  const withBudget = g.rows.filter((r) => r.partida.budget_cents);
  const budget = withBudget.reduce((a, r) => a + (r.partida.budget_cents || 0), 0);
  const margin = withBudget.length ? budget - withBudget.reduce((a, r) => a + r.totals.totalCents, 0) : null;
  const units = new Map<string, number>();
  for (const r of g.rows) if (r.partida.quantity && r.partida.unit) units.set(r.partida.unit, (units.get(r.partida.unit) || 0) + 1);
  const unit = [...units.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const measured = g.rows.filter((r) => unit && r.partida.unit === unit && r.partida.quantity && r.totals.totalCents > 0);
  const qty = measured.reduce((a, r) => a + (r.partida.quantity || 0), 0);
  const per = measured.map((r) => unitCost(r.totals.totalCents, r.partida.quantity)!);
  return {
    totals, margin, budget, unit,
    avgUnit: qty ? Math.round(measured.reduce((a, r) => a + r.totals.totalCents, 0) / qty) : null,
    minUnit: per.length ? Math.min(...per) : null, maxUnit: per.length ? Math.max(...per) : null,
  };
}

type Sort = 'coste' | 'perdidas' | 'nombre';

/** Todas las partidas comparadas: cuánto cuesta cada tipo de trabajo y cuáles hacen perder dinero. */
export default function PartidaAnalysis() {
  const groups = useLiveQuery(partidaAnalysis);
  const [sort, setSort] = useState<Sort>('coste');
  if (!groups) return <div className="page" />;
  const rows = groups.map((g) => ({ g, s: stats(g) })).filter((r) => r.s.totals.totalCents > 0 || r.s.budget > 0);
  rows.sort((a, b) => sort === 'nombre' ? a.g.name.localeCompare(b.g.name, 'es')
    : sort === 'perdidas' ? (a.s.margin ?? Infinity) - (b.s.margin ?? Infinity) || b.s.totals.totalCents - a.s.totals.totalCents
      : b.s.totals.totalCents - a.s.totals.totalCents);

  return (
    <div className="page">
      <TopBar title="Análisis por partidas" sub="Lo que te cuesta cada tipo de trabajo" backTo="/" />
      {rows.length === 0 ? (
        <Empty icon="chart" title="Aún no hay partidas con costes">
          <p>Crea partidas en tus obras (pestaña «Partidas») y elige la partida al hacer los partes. Aquí podrás comparar, por ejemplo, cuánto te cuesta el pladur en cada obra.</p>
        </Empty>
      ) : (
        <>
          <div className="seg" role="tablist" aria-label="Ordenar">
            {([['coste', 'Más coste'], ['perdidas', 'Pierden más'], ['nombre', 'A-Z']] as [Sort, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>
            ))}
          </div>
          <ul className="rows">
            {rows.map(({ g, s }) => (
              <li key={g.key}>
                <button className="row-btn partida-row" onClick={() => navigate(`/partidas/${encodeURIComponent(g.key)}`)}>
                  <div>
                    <strong>{g.name}</strong>
                    <span className="muted">
                      {g.rows.length} {g.rows.length === 1 ? 'obra' : 'obras'} · {fmtHours(s.totals.hours)}
                      {s.avgUnit != null && <> · media <span className="num">{euros(s.avgUnit)}/{s.unit}</span></>}
                    </span>
                    {s.margin != null && <Margin cents={s.margin} />}
                  </div>
                  <strong className="num">{eurosRound(s.totals.totalCents)}</strong>
                  <Icon name="chevron" size={18} />
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small center">Ganas o pierdes = presupuesto de la partida − coste real (solo partidas con presupuesto).</p>
        </>
      )}
    </div>
  );
}

function Margin({ cents }: { cents: number }) {
  return cents >= 0
    ? <span className="small health-text-ok">Ganas <span className="num">{eurosRound(cents)}</span> sobre presupuesto</span>
    : <span className="small health-text-danger">Pierdes <span className="num">{eurosRound(-cents)}</span> sobre presupuesto</span>;
}

/** Una partida (por nombre) en todas las obras. */
export function PartidaCompare({ k }: { k: string }) {
  const groups = useLiveQuery(partidaAnalysis);
  if (!groups) return <div className="page" />;
  const g = groups.find((x) => x.key === k);
  if (!g) return <div className="page"><TopBar title="Partida" backTo="/partidas" /><Empty icon="alert" title="No hay partidas con ese nombre" /></div>;
  const s = stats(g);
  const rows = [...g.rows].sort((a, b) => (b.project.start_date || b.project.created_at).localeCompare(a.project.start_date || a.project.created_at));

  return (
    <div className="page">
      <TopBar title={g.name} sub={`En ${g.rows.length} ${g.rows.length === 1 ? 'obra' : 'obras'}`} backTo="/partidas" />
      <section className="card summary">
        <div className="summary-top">
          <div><p className="label">Coste total</p><p className="big num">{eurosRound(s.totals.totalCents)}</p></div>
          {s.avgUnit != null && <div className="summary-pct"><p className="big num">{euros(s.avgUnit)}</p><p className="label">media por {s.unit}</p></div>}
        </div>
        <dl className="figs figs-3">
          <div><dt>Horas</dt><dd className="num">{number(s.totals.hours)}</dd></div>
          <div><dt>Más barata</dt><dd className="num">{s.minUnit != null ? `${euros(s.minUnit)}/${s.unit}` : '—'}</dd></div>
          <div><dt>Más cara</dt><dd className="num">{s.maxUnit != null ? `${euros(s.maxUnit)}/${s.unit}` : '—'}</dd></div>
        </dl>
        {s.margin != null && <Margin cents={s.margin} />}
        {s.avgUnit == null && <p className="muted small">Añade la cantidad ejecutada (m², ud…) en cada partida para comparar el coste por unidad.</p>}
      </section>
      <section className="card"><h3 className="card-title">Desglose</h3><CostBreakdown t={s.totals} /></section>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Obra</th><th className="r">Cantidad</th><th className="r">Coste</th><th className="r">€/ud</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const u = unitCost(r.totals.totalCents, r.partida.quantity);
              const b = r.partida.budget_cents;
              return (
                <tr key={r.partida.id} className="clickable" onClick={() => navigate(`/obra/${r.project.id}/partida/${r.partida.id}`)}>
                  <td>{r.project.name}
                    <small className="muted block">{fmtHours(r.totals.hours)}{b ? <> · presup. {eurosRound(b)} ({pct(r.totals.totalCents / b)})</> : null}</small>
                  </td>
                  <td className="r num">{r.partida.quantity ? `${number(r.partida.quantity)} ${r.partida.unit || ''}` : '—'}</td>
                  <td className="r num">{eurosRound(r.totals.totalCents)}</td>
                  <td className="r num">{u != null ? euros(u) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
