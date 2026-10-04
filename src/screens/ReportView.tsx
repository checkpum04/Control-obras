import { useLiveQuery } from 'dexie-react-hooks';
import { getProject, getReport } from '../data/repo';
import { sumTotals } from '../lib/calc';
import { euros, fmtDate, hours as fmtHours, number, weekday } from '../lib/format';
import { navigate } from '../lib/router';
import { Empty, Icon, TopBar } from '../components/ui';

export default function ReportView({ id }: { id: string }) {
  const r = useLiveQuery(async () => (await getReport(id)) ?? null, [id]);
  const project = useLiveQuery(async () => (r ? getProject(r.report.project_id) : undefined), [r?.report.project_id]);
  if (r === undefined) return <div className="page" />;
  if (!r) return <div className="page"><TopBar title="Parte" backTo="/" /><Empty icon="alert" title="Este parte no existe o se ha borrado" /></div>;
  const t = sumTotals(r.labor, r.materials, r.expenses);
  const pid = r.report.project_id;

  return (
    <div className="page">
      <TopBar
        title={<span className="num">{fmtDate(r.report.date)}</span>}
        sub={`${weekday(r.report.date)} · ${project?.name || ''}`}
        backTo={`/obra/${pid}/partes`}
        actions={<button className="icon-btn" onClick={() => navigate(`/parte/${id}/editar`)} aria-label="Editar parte"><Icon name="edit" /></button>}
      />

      <section className="card day-total">
        <p className="label">Coste del día</p>
        <p className="big num">{euros(t.totalCents)}</p>
        <p className="muted num">{r.labor.length} trabajadores · {fmtHours(t.hours)}</p>
      </section>

      <section className="block">
        <div className="block-head"><h2><span className="swatch series-labor" />Mano de obra</h2><span className="block-total num">{euros(t.laborCents)}</span></div>
        {r.labor.length === 0 ? <p className="muted">Sin trabajadores este día.</p> : (
          <ul className="detail-list">
            {r.labor.map((l) => (
              <li key={l.id}><span>{l.worker_name}</span><span className="muted num">{number(l.hours)} h × {euros(l.rate_cents)}</span><strong className="num">{euros(l.cost_cents)}</strong></li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <div className="block-head"><h2><span className="swatch series-materials" />Materiales</h2><span className="block-total num">{euros(t.materialsCents)}</span></div>
        {r.materials.length === 0 ? <p className="muted">Sin materiales este día.</p> : (
          <ul className="detail-list">
            {r.materials.map((m) => (
              <li key={m.id}><span>{m.material_name}</span><span className="muted num">{number(m.quantity)} {m.unit} × {euros(m.unit_price_cents)}</span><strong className="num">{euros(m.cost_cents)}</strong></li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <div className="block-head"><h2><span className="swatch series-other" />Otros gastos</h2><span className="block-total num">{euros(t.expensesCents)}</span></div>
        {r.expenses.length === 0 ? <p className="muted">Sin otros gastos este día.</p> : (
          <ul className="detail-list">
            {r.expenses.map((e) => (
              <li key={e.id}><span>{e.concept}</span><span className="muted">{e.category}{e.note ? ` · ${e.note}` : ''}</span><strong className="num">{euros(e.amount_cents)}</strong></li>
            ))}
          </ul>
        )}
      </section>

      {r.report.notes && (
        <section className="block"><h2 className="label">Notas</h2><p>{r.report.notes}</p></section>
      )}

      <button className="btn btn-ghost btn-block" onClick={() => navigate(`/parte/${id}/editar`)}><Icon name="edit" size={18} /> Editar parte</button>
    </div>
  );
}
