import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import {
  addAttachment, deleteAttachment, deleteExpense, getProject, listAttachments, listConcepts, projectData, saveExpense,
} from '../data/repo';
import { budgetStatus, sumTotals, round2 } from '../lib/calc';
import { euros, eurosRound, fmtDate, hours as fmtHours, number, parseMoney, pct, todayISO, weekday } from '../lib/format';
import { navigate } from '../lib/router';
import { BudgetMeter, ConfirmButton, CostBreakdown, Empty, HealthPill, Icon, Sheet, TopBar, toast } from '../components/ui';
import { attachmentBlob } from '../data/cloud';
import { DailyChart, type DayPoint } from '../components/DailyChart';
import { AddWithSuggestions } from '../components/Autocomplete';
import { EXPENSE_CATEGORIES, STATUS_LABEL, type Attachment, type AttachmentKind, type ExpenseConcept } from '../data/types';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'partes', label: 'Partes' },
  { key: 'trabajadores', label: 'Trabajadores' },
  { key: 'materiales', label: 'Materiales' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'archivos', label: 'Fotos y docs' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function ProjectDetail({ id, tab = 'resumen' }: { id: string; tab?: string }) {
  const active = (TABS.some((t) => t.key === tab) ? tab : 'resumen') as Tab;
  const project = useLiveQuery(() => getProject(id), [id]);
  const client = useLiveQuery(async () => (project?.client_id ? db.clients.get(project.client_id) : undefined), [project?.client_id]);
  const data = useLiveQuery(() => projectData(id), [id]);

  if (project === undefined && data) {
    return (
      <div className="page">
        <TopBar title="Obra" backTo="/" />
        <Empty icon="alert" title="Esta obra no existe o se ha borrado" />
      </div>
    );
  }
  if (!project || !data) return <div className="page" />;

  const totals = sumTotals(data.labor, data.materials, data.expenses);
  const s = budgetStatus(project.budget_cents, totals.totalCents);
  const go = (t: Tab) => navigate(`/obra/${id}${t === 'resumen' ? '' : '/' + t}`, { replace: true });

  return (
    <div className="page">
      <TopBar
        title={project.name}
        sub={`${client?.name || 'Sin cliente'} · ${STATUS_LABEL[project.status]}`}
        backTo="/"
        actions={<>
          <button className="icon-btn" onClick={() => navigate(`/informe/${id}`)} aria-label="Informe"><Icon name="chart" /></button>
          <button className="icon-btn" onClick={() => navigate(`/obra/${id}/editar`)} aria-label="Editar obra"><Icon name="edit" /></button>
        </>}
      />

      {project.status !== 'terminada' && (
        <button className="cta cta-slim" onClick={() => navigate(`/parte/nuevo/${id}`)}>
          <Icon name="plus" size={22} stroke={2.5} /><span>Añadir parte de hoy</span>
        </button>
      )}

      <nav className="tabs" role="tablist" aria-label="Secciones de la obra">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={active === t.key} className={active === t.key ? 'on' : ''} onClick={() => go(t.key)}>{t.label}</button>
        ))}
      </nav>

      {active === 'resumen' && <Summary project={project} address={project.address} totals={totals} s={s} data={data} />}
      {active === 'partes' && <Reports data={data} projectId={id} />}
      {active === 'trabajadores' && <WorkersTab data={data} />}
      {active === 'materiales' && <MaterialsTab data={data} />}
      {active === 'gastos' && <ExpensesTab data={data} projectId={id} />}
      {active === 'archivos' && <FilesTab projectId={id} />}
    </div>
  );
}

// ───────── Resumen
function Summary({ project, address, totals, s, data }: {
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>; address?: string;
  totals: ReturnType<typeof sumTotals>; s: ReturnType<typeof budgetStatus>; data: Awaited<ReturnType<typeof projectData>>;
}) {
  const days = useMemo<DayPoint[]>(() => {
    const m = new Map<string, DayPoint>();
    const get = (d: string) => m.get(d) || (m.set(d, { date: d, labor: 0, materials: 0, other: 0 }), m.get(d)!);
    const rDate = new Map(data.reports.map((r) => [r.id, r.date]));
    for (const l of data.labor) get(rDate.get(l.report_id) || '').labor += l.cost_cents;
    for (const x of data.materials) get(rDate.get(x.report_id) || '').materials += x.cost_cents;
    for (const e of data.expenses) get(e.date).other += e.amount_cents;
    return [...m.values()].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [data]);

  return (
    <div className="stack-v">
      <section className="card summary">
        <div className="summary-top">
          <div>
            <p className="label">Gastado</p>
            <p className="big num">{eurosRound(totals.totalCents)}</p>
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
          <div><dt>Restante</dt><dd className={`num${(s.remainingCents ?? 0) < 0 ? ' neg' : ''}`}>{s.remainingCents != null ? eurosRound(s.remainingCents) : '—'}</dd></div>
          <div><dt>Beneficio estimado</dt><dd className={`num${(s.profitCents ?? 0) < 0 ? ' neg' : ''}`}>{s.profitCents != null ? eurosRound(s.profitCents) : '—'}</dd></div>
        </dl>
        <HealthPill s={s} />
        {s.budgetCents == null && <p className="muted small">Añade el presupuesto en <button className="link" onClick={() => navigate(`/obra/${project.id}/editar`)}>Editar obra</button> para ver el restante y el semáforo.</p>}
      </section>

      <section className="card">
        <h3 className="card-title">¿En qué se va el dinero?</h3>
        <CostBreakdown t={totals} />
      </section>

      {days.length > 0 && (
        <section className="card">
          <h3 className="card-title">Coste por día {days.length === 30 && <small className="muted">(últimos 30)</small>}</h3>
          <DailyChart days={days} />
        </section>
      )}

      <section className="card info-list">
        <div><span>Días trabajados</span><strong className="num">{data.reports.length}</strong></div>
        <div><span>Horas totales</span><strong className="num">{fmtHours(totals.hours)}</strong></div>
        {project.start_date && <div><span>Inicio</span><strong className="num">{fmtDate(project.start_date)}</strong></div>}
        {project.end_date && <div><span>Fin</span><strong className="num">{fmtDate(project.end_date)}</strong></div>}
        {address && <div><span>Dirección</span><strong>{address}</strong></div>}
        {project.notes && <div className="info-notes"><span>Notas</span><p>{project.notes}</p></div>}
      </section>
    </div>
  );
}

// ───────── Partes diarios
function Reports({ data, projectId }: { data: Awaited<ReturnType<typeof projectData>>; projectId: string }) {
  if (!data.reports.length) {
    return (
      <Empty icon="calendar" title="Sin partes todavía">
        <button className="btn btn-primary" onClick={() => navigate(`/parte/nuevo/${projectId}`)}>Añadir parte de hoy</button>
      </Empty>
    );
  }
  return (
    <ul className="rows">
      {data.reports.map((r) => {
        const L = data.labor.filter((l) => l.report_id === r.id);
        const M = data.materials.filter((m) => m.report_id === r.id);
        const E = data.expenses.filter((e) => e.report_id === r.id);
        const t = sumTotals(L, M, E);
        return (
          <li key={r.id}>
            <button className="row-btn report-row" onClick={() => navigate(`/parte/${r.id}`)}>
              <div className="report-date">
                <strong className="num">{fmtDate(r.date)}</strong>
                <span className="muted">{weekday(r.date)}</span>
              </div>
              <div className="report-meta">
                <span><span className="nw">{L.length} {L.length === 1 ? 'trabajador' : 'trabajadores'}</span> · <span className="num nw">{fmtHours(t.hours)}</span></span>
                <span className="muted"><span className="nw">Materiales <span className="num">{eurosRound(t.materialsCents)}</span></span>{t.expensesCents ? <> · <span className="nw">Otros <span className="num">{eurosRound(t.expensesCents)}</span></span></> : null}</span>
              </div>
              <strong className="report-total num">{eurosRound(t.totalCents)}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ───────── Trabajadores de la obra
function WorkersTab({ data }: { data: Awaited<ReturnType<typeof projectData>> }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; hours: number; cost: number; days: Set<string>; rates: Set<number>; last: number; lastDate: string }>();
    const rDate = new Map(data.reports.map((r) => [r.id, r.date]));
    for (const l of data.labor) {
      const k = l.worker_id || l.worker_name;
      const d = rDate.get(l.report_id) || '';
      const r = m.get(k) || { name: l.worker_name, hours: 0, cost: 0, days: new Set(), rates: new Set(), last: l.rate_cents, lastDate: '' };
      r.hours = round2(r.hours + l.hours); r.cost += l.cost_cents; r.days.add(d); r.rates.add(l.rate_cents);
      if (d >= r.lastDate) { r.lastDate = d; r.last = l.rate_cents; r.name = l.worker_name; }
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  }, [data]);
  if (!rows.length) return <Empty icon="user" title="Nadie ha trabajado aún en esta obra" />;
  const total = rows.reduce((a, r) => a + r.cost, 0), hrs = round2(rows.reduce((a, r) => a + r.hours, 0));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Trabajador</th><th className="r">Horas</th><th className="r">€/h</th><th className="r">Coste</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}<small className="muted block">{r.days.size} {r.days.size === 1 ? 'día' : 'días'}</small></td>
              <td className="r num">{number(r.hours)}</td>
              <td className="r num">{r.rates.size > 1 ? <>{euros(r.cost / r.hours)}<small className="muted block">media</small></> : euros(r.last)}</td>
              <td className="r num">{eurosRound(r.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th><th className="r num">{number(hrs)}</th><th /><th className="r num">{eurosRound(total)}</th></tr></tfoot>
      </table>
    </div>
  );
}

// ───────── Materiales de la obra
function MaterialsTab({ data }: { data: Awaited<ReturnType<typeof projectData>> }) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    for (const x of data.materials) {
      const k = `${x.material_id || x.material_name}|${x.unit}`;
      const r = m.get(k) || { name: x.material_name, unit: x.unit, qty: 0, cost: 0 };
      r.qty = round2(r.qty + x.quantity); r.cost += x.cost_cents;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  }, [data]);
  if (!rows.length) return <Empty icon="box" title="Sin materiales registrados" />;
  const total = rows.reduce((a, r) => a + r.cost, 0);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Material</th><th className="r">Cantidad</th><th className="r">Coste</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name + r.unit}>
              <td>{r.name}<small className="muted block">media {euros(r.cost / (r.qty || 1))}/{r.unit}</small></td>
              <td className="r num">{number(r.qty)} {r.unit}</td>
              <td className="r num">{eurosRound(r.cost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th><th /><th className="r num">{eurosRound(total)}</th></tr></tfoot>
      </table>
    </div>
  );
}

// ───────── Otros gastos
function ExpensesTab({ data, projectId }: { data: Awaited<ReturnType<typeof projectData>>; projectId: string }) {
  const [open, setOpen] = useState(false);
  const tickets = useLiveQuery(async () => {
    const all = await listAttachments(projectId);
    const m = new Map<string, Attachment[]>();
    for (const a of all) if (a.expense_id) m.set(a.expense_id, [...(m.get(a.expense_id) || []), a]);
    return m;
  }, [projectId]);
  const [view, setView] = useState<Attachment | null>(null);
  const total = data.expenses.reduce((a, e) => a + e.amount_cents, 0);
  return (
    <div className="stack-v">
      <button className="btn btn-ghost" onClick={() => setOpen(true)}><Icon name="plus" size={18} /> Añadir gasto</button>
      {data.expenses.length === 0 ? <Empty icon="receipt" title="Sin otros gastos" /> : (
        <ul className="rows">
          {data.expenses.map((e) => (
            <li key={e.id} className="expense-row">
              <div>
                <strong>{e.concept}</strong>
                <span className="muted">{fmtDate(e.date)} · {e.category}{e.report_id ? ' · en parte' : ''}</span>
                {e.note && <span className="muted small">{e.note}</span>}
                {tickets?.get(e.id)?.map((a) => (
                  <button key={a.id} className="link small" onClick={() => setView(a)}><Icon name="receipt" size={14} /> {a.name}</button>
                ))}
              </div>
              <strong className="num">{euros(e.amount_cents)}</strong>
              {!e.report_id && (
                <ConfirmButton className="icon-btn small" label={<Icon name="trash" size={18} />} confirmLabel="¿Borrar?"
                  onConfirm={async () => { await deleteExpense(e.id); toast('Gasto borrado'); }} />
              )}
            </li>
          ))}
          <li className="rows-total"><span>Total otros gastos</span><strong className="num">{euros(total)}</strong></li>
        </ul>
      )}
      <ExpenseSheet open={open} onClose={() => setOpen(false)} projectId={projectId} />
      <AttachmentViewer a={view} onClose={() => setView(null)} />
    </div>
  );
}

function ExpenseSheet({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const concepts = useLiveQuery(listConcepts) || [];
  const [f, setF] = useState({ concept: '', category: 'Otros', amount: '', date: todayISO(), note: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setF({ concept: '', category: 'Otros', amount: '', date: todayISO(), note: '' }); setFiles([]); setErr(''); } }, [open]);
  const pick = (c: ExpenseConcept) => setF((x) => ({ ...x, concept: c.name, category: c.category, amount: c.last_amount_cents != null ? String(c.last_amount_cents / 100).replace('.', ',') : x.amount }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseMoney(f.amount);
    if (!f.concept.trim()) return setErr('Escribe el concepto.');
    if (amount == null) return setErr('Escribe el importe.');
    await saveExpense({ project_id: projectId, date: f.date, category: f.category, concept: f.concept, amount_cents: amount, note: f.note, files });
    toast('Gasto añadido');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Nuevo gasto">
      <form className="form" onSubmit={submit}>
        {f.concept ? (
          <label className="field"><span>Concepto</span>
            <input id="exp-concept" value={f.concept} onChange={(e) => setF({ ...f, concept: e.target.value })} />
          </label>
        ) : (
          <div className="field"><span>Concepto</span>
            <AddWithSuggestions<ExpenseConcept> id="exp-concept-ac" items={concepts} placeholder="Contenedor, gasolina…" onPick={pick}
              onCreate={(name) => setF({ ...f, concept: name })} meta={(c) => (c.last_amount_cents != null ? euros(c.last_amount_cents) : c.category)} />
          </div>
        )}
        <div className="row2">
          <label className="field"><span>Importe (€)</span>
            <input id="exp-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
          </label>
          <label className="field"><span>Fecha</span>
            <input id="exp-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
        </div>
        <label className="field"><span>Tipo</span>
          <select id="exp-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Nota (opcional)</span>
          <input id="exp-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <label className="btn btn-ghost file-btn">
          <Icon name="camera" size={18} /> {files.length ? `${files.length} archivo(s) adjunto(s)` : 'Foto del ticket o factura'}
          <input type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" type="submit">Guardar gasto</button>
      </form>
    </Sheet>
  );
}

// ───────── Fotos y documentos
function FilesTab({ projectId }: { projectId: string }) {
  const files = useLiveQuery(() => listAttachments(projectId), [projectId]);
  const [kind, setKind] = useState<AttachmentKind>('foto');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<Attachment | null>(null);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    for (const f of Array.from(list)) await addAttachment(projectId, f, f.type.startsWith('image/') ? kind : 'documento');
    setBusy(false);
    toast(list.length === 1 ? 'Archivo guardado' : `${list.length} archivos guardados`);
  };
  return (
    <div className="stack-v">
      <div className="seg seg-full">
        {(['foto', 'ticket', 'documento'] as AttachmentKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'foto' ? 'Foto de obra' : k === 'ticket' ? 'Ticket / factura' : 'Documento'}
          </button>
        ))}
      </div>
      <label className="btn btn-primary btn-block file-btn">
        <Icon name="camera" size={20} /> {busy ? 'Guardando…' : 'Añadir fotos o archivos'}
        <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </label>
      {files && files.length === 0 && <Empty icon="camera" title="Sin fotos ni documentos" />}
      <div className="gallery">
        {files?.map((a) => <Thumb key={a.id} a={a} onOpen={() => setView(a)} />)}
      </div>
      <AttachmentViewer a={view} onClose={() => setView(null)} />
    </div>
  );
}

/** URL local del archivo; si solo está en la nube, se descarga la primera vez que se ve. */
function useObjectURL(a?: Attachment | null, enabled = true) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!a || !enabled) return;
    let u: string | undefined, cancel = false;
    attachmentBlob(a).then((b) => { if (b && !cancel) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { cancel = true; if (u) URL.revokeObjectURL(u); setUrl(undefined); };
  }, [a?.id, a?.blob, enabled]);
  return url;
}

function Thumb({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  const url = useObjectURL(a, a.mime.startsWith('image/'));
  return (
    <button className="thumb" onClick={onOpen}>
      {url ? <img src={url} alt={a.name} loading="lazy" /> : <span className="thumb-doc"><Icon name="file" size={28} stroke={1.5} /><small>{a.name}</small></span>}
      <span className={`thumb-kind kind-${a.kind}`}>{a.kind === 'foto' ? 'Obra' : a.kind === 'ticket' ? 'Ticket' : 'Doc'}</span>
    </button>
  );
}

function AttachmentViewer({ a, onClose }: { a: Attachment | null; onClose: () => void }) {
  const url = useObjectURL(a);
  return (
    <Sheet open={!!a} onClose={onClose} title={a?.name || ''}>
      {a && (
        <div className="viewer">
          {a.mime.startsWith('image/') && url ? <img src={url} alt={a.name} /> : (
            <p className="muted">{a.mime || 'Documento'} · {Math.round(a.size / 1024)} KB{url && <> · <a href={url} target="_blank" rel="noreferrer">Abrir</a></>}</p>
          )}
          <p className="muted small">Añadido el {fmtDate(a.created_at)}</p>
          <ConfirmButton label="Borrar archivo" confirmLabel="Pulsa otra vez para borrar"
            onConfirm={async () => { await deleteAttachment(a.id); toast('Archivo borrado'); onClose(); }} />
        </div>
      )}
    </Sheet>
  );
}
