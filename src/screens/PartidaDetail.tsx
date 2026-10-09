import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addAttachment, getProject, listAttachments, partidaData } from '../data/repo';
import { budgetStatus, sumTotals, unitCost } from '../lib/calc';
import { euros, eurosRound, fmtDate, hours as fmtHours, norm, number, pct, weekday } from '../lib/format';
import { navigate } from '../lib/router';
import { BudgetMeter, CostBreakdown, Empty, HealthPill, Icon, TopBar, toast } from '../components/ui';
import { PartidaForm } from '../components/PartidaForm';
import { NO_PARTIDA, STATUS_LABEL, type Attachment } from '../data/types';
import { AttachmentViewer, ExpenseSheet, MaterialsTab, Thumb, WorkersTab } from './ProjectDetail';

/** Detalle de una partida. partidaId 'sin' = lo apuntado sin partida. */
export default function PartidaDetail({ projectId, partidaId }: { projectId: string; partidaId: string }) {
  const pid = partidaId === 'sin' ? '' : partidaId;
  const project = useLiveQuery(() => getProject(projectId), [projectId]);
  const data = useLiveQuery(() => partidaData(projectId, pid), [projectId, pid]);
  const expenseIds = new Set(data?.expenses.map((e) => e.id));
  const files = useLiveQuery(async () => (await listAttachments(projectId)).filter((a) =>
    pid ? a.partida_id === pid || (!!a.expense_id && expenseIds.has(a.expense_id)) : false), [projectId, pid, data?.expenses.length]);
  const [edit, setEdit] = useState(false);
  const [addExp, setAddExp] = useState(false);
  const [view, setView] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);

  if (!project || !data) return <div className="page" />;
  const partida = pid ? data.partidas.find((p) => p.id === pid) : null;
  if (pid && !partida) {
    return (
      <div className="page">
        <TopBar title="Partida" backTo={`/obra/${projectId}/partidas`} />
        <Empty icon="alert" title="Esta partida no existe o se ha borrado" />
      </div>
    );
  }

  const t = sumTotals(data.labor, data.materials, data.expenses);
  const s = budgetStatus(partida?.budget_cents, t.totalCents);
  const u = unitCost(t.totalCents, partida?.quantity);
  const budgetU = partida?.budget_cents && partida.quantity ? Math.round(partida.budget_cents / partida.quantity) : null;
  const unit = partida?.unit || 'ud';

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) await addAttachment(projectId, f, f.type.startsWith('image/') ? 'foto' : 'documento', null, pid);
    setBusy(false);
    toast(list.length === 1 ? 'Archivo guardado' : `${list.length} archivos guardados`);
  };

  return (
    <div className="page">
      <TopBar
        title={partida?.name || NO_PARTIDA}
        sub={`${project.name}${partida ? ` · ${STATUS_LABEL[partida.status]}${partida.archived ? ' · archivada' : ''}` : ''}`}
        backTo={`/obra/${projectId}/partidas`}
        actions={partida && <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Editar partida"><Icon name="edit" /></button>}
      />

      {partida && !partida.archived && project.status !== 'terminada' && (
        <button className="cta cta-slim" onClick={() => navigate(`/parte/nuevo/${projectId}?partida=${pid}`)}>
          <Icon name="plus" size={22} stroke={2.5} /><span>Añadir parte de hoy en {partida.name}</span>
        </button>
      )}

      {!partida && (
        <p className="notice notice-info">Aquí está lo que se apuntó sin elegir partida (por ejemplo, los partes de antes de usar partidas). Para pasarlo a una partida, abre el parte, pulsa «Editar» y cambia la partida de cada línea.</p>
      )}

      {/* 1 · Resumen económico */}
      <section className="card summary">
        <div className="summary-top">
          <div>
            <p className="label">Coste actual</p>
            <p className="big num">{eurosRound(t.totalCents)}</p>
          </div>
          {s.consumed != null && (
            <div className="summary-pct">
              <p className={`big num health-text-${s.health}`}>{pct(s.consumed)}</p>
              <p className="label">del presupuesto</p>
            </div>
          )}
        </div>
        <BudgetMeter s={s} />
        <dl className="figs figs-3">
          <div><dt>Presupuesto</dt><dd className="num">{s.budgetCents ? eurosRound(s.budgetCents) : '—'}</dd></div>
          <div><dt>{(s.remainingCents ?? 0) < 0 ? 'Te pasas en' : 'Restante'}</dt><dd className={`num${(s.remainingCents ?? 0) < 0 ? ' neg' : ''}`}>{s.remainingCents != null ? eurosRound(Math.abs(s.remainingCents)) : '—'}</dd></div>
          <div><dt>Horas</dt><dd className="num">{fmtHours(t.hours)}</dd></div>
        </dl>
        {s.consumed != null && <HealthPill s={s} />}
        {partida && s.budgetCents == null && <p className="muted small">Pon un presupuesto a la partida en <button className="link" onClick={() => setEdit(true)}>Editar</button> para ver lo que queda.</p>}
      </section>

      <section className="card">
        <h3 className="card-title">Desglose</h3>
        <CostBreakdown t={t} />
      </section>

      {partida && (
        <section className="card info-list">
          {partida.quantity ? (
            <>
              <div><span>Cantidad ejecutada</span><strong className="num">{number(partida.quantity)} {unit}</strong></div>
              <div><span>Coste real por {unit}</span><strong className="num">{u != null ? euros(u) : '—'}</strong></div>
              {budgetU != null && <div><span>Presupuestado por {unit}</span><strong className="num">{euros(budgetU)}</strong></div>}
            </>
          ) : (
            <div><span>Coste por unidad</span><button className="link" onClick={() => setEdit(true)}>Añadir cantidad ejecutada (m², ud…)</button></div>
          )}
          {partida.start_date && <div><span>Inicio</span><strong className="num">{fmtDate(partida.start_date)}</strong></div>}
          {partida.end_date && <div><span>Fin</span><strong className="num">{fmtDate(partida.end_date)}</strong></div>}
          {partida.description && <div className="info-notes"><span>Descripción</span><p>{partida.description}</p></div>}
          <div><span>Otras obras</span><button className="link" onClick={() => navigate(`/partidas/${encodeURIComponent(norm(partida.name))}`)}>Comparar {partida.name} <Icon name="chevron" size={14} /></button></div>
        </section>
      )}

      {/* 2 · Partes */}
      <h3 className="section-title">Partes diarios <small className="muted">{data.reports.length}</small></h3>
      {data.reports.length === 0 ? <p className="muted">Todavía no hay partes con esta partida.</p> : (
        <ul className="rows">
          {data.reports.map((r) => {
            const d = sumTotals(data.labor.filter((l) => l.report_id === r.id), data.materials.filter((m) => m.report_id === r.id), data.expenses.filter((e) => e.report_id === r.id));
            return (
              <li key={r.id}>
                <button className="row-btn report-row" onClick={() => navigate(`/parte/${r.id}`)}>
                  <div className="report-date"><strong className="num">{fmtDate(r.date)}</strong><span className="muted">{weekday(r.date)}</span></div>
                  <div className="report-meta"><span className="num">{fmtHours(d.hours)}</span></div>
                  <strong className="report-total num">{eurosRound(d.totalCents)}</strong>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 3-5 · Trabajadores, horas y materiales */}
      <h3 className="section-title">Trabajadores</h3>
      <WorkersTab data={data} />
      <h3 className="section-title">Materiales</h3>
      <MaterialsTab data={data} />

      {/* 6 · Otros gastos */}
      <h3 className="section-title">Otros gastos</h3>
      {data.expenses.length === 0 ? <p className="muted">Sin otros gastos.</p> : (
        <ul className="rows">
          {data.expenses.map((e) => (
            <li key={e.id} className="expense-row">
              <div><strong>{e.concept}</strong><span className="muted">{fmtDate(e.date)} · {e.category}</span>{e.note && <span className="muted small">{e.note}</span>}</div>
              <strong className="num">{euros(e.amount_cents)}</strong>
            </li>
          ))}
          <li className="rows-total"><span>Total otros gastos</span><strong className="num">{euros(t.expensesCents)}</strong></li>
        </ul>
      )}
      {partida && <button className="btn btn-ghost" onClick={() => setAddExp(true)}><Icon name="plus" size={18} /> Añadir gasto a {partida.name}</button>}

      {/* 7 · Fotos y documentos */}
      {partida && (
        <>
          <h3 className="section-title">Fotos y documentos</h3>
          <label className="btn btn-ghost file-btn">
            <Icon name="camera" size={18} /> {busy ? 'Guardando…' : 'Añadir fotos o archivos'}
            <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
          {files && files.length > 0 && <div className="gallery">{files.map((a) => <Thumb key={a.id} a={a} onOpen={() => setView(a)} />)}</div>}
        </>
      )}

      {/* 8 · Notas */}
      {partida && (
        <section className="card info-list">
          <div className="info-notes"><span>Notas</span>
            {partida.notes ? <p>{partida.notes}</p> : <button className="link" onClick={() => setEdit(true)}>Añadir notas</button>}
          </div>
        </section>
      )}

      {partida && <PartidaForm open={edit} onClose={() => setEdit(false)} projectId={projectId} partida={partida}
        onDeleted={() => navigate(`/obra/${projectId}/partidas`, { replace: true })} />}
      <ExpenseSheet open={addExp} onClose={() => setAddExp(false)} projectId={projectId} partidas={data.partidas} partidaId={pid} />
      <AttachmentViewer a={view} onClose={() => setView(null)} />
    </div>
  );
}
