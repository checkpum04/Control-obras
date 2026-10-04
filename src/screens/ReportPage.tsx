import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { getProject, projectData } from '../data/repo';
import { budgetStatus, round2, sumTotals } from '../lib/calc';
import { addDays, euros, fmtDate, hours as fmtHours, number, pct, todayISO } from '../lib/format';
import { Icon, TopBar, toast } from '../components/ui';
import { STATUS_LABEL } from '../data/types';

const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();

function monthRange(offset: number): [string, string] {
  const d = new Date();
  const a = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const b = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return [todayISO(a), todayISO(b)];
}

export default function ReportPage({ id }: { id: string }) {
  const project = useLiveQuery(() => getProject(id), [id]);
  const client = useLiveQuery(async () => (project?.client_id ? db.clients.get(project.client_id) : undefined), [project?.client_id]);
  const data = useLiveQuery(() => projectData(id), [id]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const firstDate = data?.reports.at(-1)?.date || project?.start_date || todayISO();
  const f = from || firstDate;
  const t = to || todayISO();

  const r = useMemo(() => {
    if (!data) return null;
    const reports = data.reports.filter((x) => x.date >= f && x.date <= t).sort((a, b) => a.date.localeCompare(b.date));
    const ids = new Set(reports.map((x) => x.id));
    const labor = data.labor.filter((l) => ids.has(l.report_id));
    const materials = data.materials.filter((m) => ids.has(m.report_id));
    const expenses = data.expenses.filter((e) => e.date >= f && e.date <= t).sort((a, b) => a.date.localeCompare(b.date));
    const workers = new Map<string, { name: string; hours: number; cost: number }>();
    for (const l of labor) {
      const k = l.worker_id || l.worker_name;
      const w = workers.get(k) || { name: l.worker_name, hours: 0, cost: 0 };
      w.hours = round2(w.hours + l.hours); w.cost += l.cost_cents; workers.set(k, w);
    }
    const mats = new Map<string, { name: string; unit: string; qty: number; cost: number }>();
    for (const m of materials) {
      const k = `${m.material_id || m.material_name}|${m.unit}`;
      const x = mats.get(k) || { name: m.material_name, unit: m.unit, qty: 0, cost: 0 };
      x.qty = round2(x.qty + m.quantity); x.cost += m.cost_cents; mats.set(k, x);
    }
    const daily = reports.map((rep) => {
      const L = labor.filter((l) => l.report_id === rep.id), M = materials.filter((m) => m.report_id === rep.id), E = expenses.filter((e) => e.report_id === rep.id);
      return { date: rep.date, workers: L.length, ...sumTotals(L, M, E) };
    });
    return {
      reports, period: sumTotals(labor, materials, expenses), all: sumTotals(data.labor, data.materials, data.expenses),
      workers: [...workers.values()].sort((a, b) => b.cost - a.cost), mats: [...mats.values()].sort((a, b) => b.cost - a.cost), expenses, daily,
    };
  }, [data, f, t]);

  if (!project || !r) return <div className="page" />;
  const s = budgetStatus(project.budget_cents, r.all.totalCents);
  const whole = f <= firstDate && t >= todayISO();

  const table = (): string[][] => {
    const rows: string[][] = [
      ['Informe de obra', project.name],
      ['Cliente', client?.name || ''],
      ['Dirección', project.address || ''],
      ['Periodo', `${fmtDate(f)} a ${fmtDate(t)}`],
      [],
      ['RESUMEN DEL PERIODO', ''],
      ['Horas trabajadas', number(r.period.hours)],
      ['Mano de obra', money(r.period.laborCents)],
      ['Materiales', money(r.period.materialsCents)],
      ['Otros gastos', money(r.period.expensesCents)],
      ['Coste del periodo', money(r.period.totalCents)],
      [],
      ['SITUACIÓN DE LA OBRA', ''],
      ['Presupuesto', s.budgetCents ? money(s.budgetCents) : ''],
      ['Coste acumulado total', money(r.all.totalCents)],
      ['Restante', s.remainingCents != null ? money(s.remainingCents) : ''],
      ['Presupuesto consumido', s.consumed != null ? pct(s.consumed) : ''],
      [],
      ['TRABAJADORES', 'Horas', 'Coste'],
      ...r.workers.map((w) => [w.name, number(w.hours), money(w.cost)]),
      [],
      ['MATERIALES', 'Cantidad', 'Unidad', 'Coste'],
      ...r.mats.map((m) => [m.name, number(m.qty), m.unit, money(m.cost)]),
      [],
      ['OTROS GASTOS', 'Fecha', 'Tipo', 'Importe', 'Nota'],
      ...r.expenses.map((e) => [e.concept, fmtDate(e.date), e.category, money(e.amount_cents), e.note || '']),
      [],
      ['PARTES DIARIOS', 'Trabajadores', 'Horas', 'Mano de obra', 'Materiales', 'Otros', 'Total'],
      ...r.daily.map((d) => [fmtDate(d.date), String(d.workers), number(d.hours), money(d.laborCents), money(d.materialsCents), money(d.expensesCents), money(d.totalCents)]),
    ];
    return rows;
  };

  const copyExcel = async () => {
    const tsv = table().map((row) => row.join('\t')).join('\n');
    try { await navigator.clipboard.writeText(tsv); toast('Copiado. Pégalo en Excel.'); }
    catch { toast('No se pudo copiar en este navegador'); }
  };
  const downloadCSV = () => {
    const csv = '﻿' + table().map((row) => row.map((c) => /[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Informe ${project.name} ${f} a ${t}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const presets: [string, [string, string]][] = [
    ['Toda la obra', [firstDate, todayISO()]],
    ['Este mes', monthRange(0)],
    ['Mes pasado', monthRange(-1)],
    ['Últimos 7 días', [addDays(todayISO(), -6), todayISO()]],
  ];

  return (
    <div className="page informe">
      <TopBar title="Informe" sub={project.name} backTo={`/obra/${id}`} />

      <section className="card no-print">
        <div className="chips">
          {presets.map(([label, [a, b]]) => (
            <button key={label} className={`chip${f === a && t === b ? ' on' : ''}`} onClick={() => { setFrom(a); setTo(b); }}>{label}</button>
          ))}
        </div>
        <div className="row2">
          <label className="field"><span>Desde</span><input id="inf-from" type="date" value={f} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Hasta</span><input id="inf-to" type="date" value={t} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={copyExcel}><Icon name="copy" size={18} /> Copiar para Excel</button>
          {!inFrame && <button className="btn btn-ghost" onClick={downloadCSV}><Icon name="download" size={18} /> Descargar Excel (CSV)</button>}
          {!inFrame && <button className="btn btn-ghost" onClick={() => window.print()}><Icon name="file" size={18} /> Imprimir o guardar PDF</button>}
        </div>
      </section>

      <article className="doc">
        <header className="doc-head">
          <p className="eyebrow">Informe de obra</p>
          <h2>{project.name}</h2>
          <dl className="doc-meta">
            <div><dt>Cliente</dt><dd>{client?.name || '—'}</dd></div>
            {project.address && <div><dt>Dirección</dt><dd>{project.address}</dd></div>}
            <div><dt>Estado</dt><dd>{STATUS_LABEL[project.status]}</dd></div>
            <div><dt>Periodo</dt><dd className="num">{fmtDate(f)} a {fmtDate(t)}</dd></div>
            {project.start_date && <div><dt>Inicio de obra</dt><dd className="num">{fmtDate(project.start_date)}</dd></div>}
          </dl>
        </header>

        <h3>Resumen económico {whole ? '' : 'del periodo'}</h3>
        <table className="table kv">
          <tbody>
            <tr><td>Horas trabajadas</td><td className="r num">{fmtHours(r.period.hours)}</td></tr>
            <tr><td>Mano de obra</td><td className="r num">{euros(r.period.laborCents)}</td></tr>
            <tr><td>Materiales</td><td className="r num">{euros(r.period.materialsCents)}</td></tr>
            <tr><td>Otros gastos</td><td className="r num">{euros(r.period.expensesCents)}</td></tr>
            <tr className="strong"><td>Coste {whole ? 'total' : 'del periodo'}</td><td className="r num">{euros(r.period.totalCents)}</td></tr>
          </tbody>
        </table>

        <h3>Situación de la obra a día de hoy</h3>
        <table className="table kv">
          <tbody>
            <tr><td>Presupuesto</td><td className="r num">{s.budgetCents ? euros(s.budgetCents) : '—'}</td></tr>
            <tr><td>Coste acumulado</td><td className="r num">{euros(r.all.totalCents)}</td></tr>
            <tr><td>Restante / beneficio estimado</td><td className={`r num${(s.remainingCents ?? 0) < 0 ? ' neg' : ''}`}>{s.remainingCents != null ? euros(s.remainingCents) : '—'}</td></tr>
            <tr><td>Presupuesto consumido</td><td className="r num">{pct(s.consumed)}</td></tr>
          </tbody>
        </table>

        <h3>Trabajadores</h3>
        {r.workers.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Nombre</th><th className="r">Horas</th><th className="r">Coste</th></tr></thead>
            <tbody>{r.workers.map((w) => <tr key={w.name}><td>{w.name}</td><td className="r num">{number(w.hours)}</td><td className="r num">{euros(w.cost)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Sin horas en este periodo.</p>}

        <h3>Materiales utilizados</h3>
        {r.mats.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Material</th><th className="r">Cantidad</th><th className="r">Coste</th></tr></thead>
            <tbody>{r.mats.map((m) => <tr key={m.name + m.unit}><td>{m.name}</td><td className="r num">{number(m.qty)} {m.unit}</td><td className="r num">{euros(m.cost)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Sin materiales en este periodo.</p>}

        <h3>Otros gastos</h3>
        {r.expenses.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fecha</th><th>Concepto</th><th className="r">Importe</th></tr></thead>
            <tbody>{r.expenses.map((e) => <tr key={e.id}><td className="num">{fmtDate(e.date)}</td><td>{e.concept}<small className="muted block">{e.category}{e.note ? ` · ${e.note}` : ''}</small></td><td className="r num">{euros(e.amount_cents)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Sin otros gastos en este periodo.</p>}

        <h3>Partes diarios</h3>
        {r.daily.length ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fecha</th><th className="r">Horas</th><th className="r">Materiales</th><th className="r">Total</th></tr></thead>
            <tbody>{r.daily.map((d) => <tr key={d.date}><td className="num">{fmtDate(d.date)}<small className="muted block">{d.workers} trab.</small></td><td className="r num">{number(d.hours)}</td><td className="r num">{euros(d.materialsCents)}</td><td className="r num">{euros(d.totalCents)}</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Sin partes en este periodo.</p>}
      </article>
    </div>
  );
}

const money = (c: number) => (c / 100).toFixed(2).replace('.', ',');
