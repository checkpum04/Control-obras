import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  findReport, getProject, getReport, listConcepts, listMaterials, listWorkers, previousReport, saveReport, deleteReport,
} from '../data/repo';
import { lineCost } from '../lib/calc';
import { centsToInput, euros, fmtDate, hours as fmtHours, norm, numToInput, parseDecimal, parseMoney, todayISO, weekday } from '../lib/format';
import { navigate, back } from '../lib/router';
import { frequent } from '../lib/suggest';
import { AddWithSuggestions, Chips } from '../components/Autocomplete';
import { ConfirmButton, Icon, Stepper, TopBar, toast } from '../components/ui';
import { EXPENSE_CATEGORIES, UNITS, type ExpenseConcept, type Material, type Worker } from '../data/types';

interface LRow { key: string; id?: string; worker_id?: string | null; worker_name: string; hours: string; rate: string; habitual?: number | null; save_rate?: boolean }
interface MRow { key: string; id?: string; material_id?: string | null; material_name: string; unit: string; quantity: string; price: string }
interface ERow { key: string; id?: string; category: string; concept: string; amount: string; note: string; showNote?: boolean; files: File[] }

interface Draft { labor: LRow[]; materials: MRow[]; expenses: ERow[]; notes: string; savedAt: string }
const strip = <T extends { key: string }>({ key: _k, ...r }: T) => r;

let k = 0;
const key = () => `r${++k}`;
const DEFAULT_HOURS = '8';

export default function ReportEditor({ projectId: initialProject, reportId: editId, initialDate }: { projectId?: string; reportId?: string; initialDate?: string }) {
  const [projectId, setProjectId] = useState(initialProject || '');
  const [date, setDate] = useState(initialDate || todayISO());
  const [reportId, setReportId] = useState<string | undefined>(editId);
  const [labor, setLabor] = useState<LRow[]>([]);
  const [materials, setMaterials] = useState<MRow[]>([]);
  const [expenses, setExpenses] = useState<ERow[]>([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const focusNext = useRef<string | null>(null);
  const touched = useRef(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const project = useLiveQuery(() => (projectId ? getProject(projectId) : undefined), [projectId]);
  const workers = useLiveQuery(listWorkers) || [];
  const mats = useLiveQuery(listMaterials) || [];
  const concepts = useLiveQuery(listConcepts) || [];
  const prev = useLiveQuery(() => (projectId ? previousReport(projectId, date) : undefined), [projectId, date]);

  const fill = (r: NonNullable<Awaited<ReturnType<typeof getReport>>>) => {
    setReportId(r.report.id);
    setProjectId(r.report.project_id);
    setDate(r.report.date);
    setNotes(r.report.notes || '');
    setLabor(r.labor.map((l) => ({
      key: key(), id: l.id, worker_id: l.worker_id, worker_name: l.worker_name, hours: numToInput(l.hours), rate: centsToInput(l.rate_cents),
      habitual: l.worker_id ? undefined : null,
    })));
    setMaterials(r.materials.map((m) => ({
      key: key(), id: m.id, material_id: m.material_id, material_name: m.material_name, unit: m.unit,
      quantity: numToInput(m.quantity), price: centsToInput(m.unit_price_cents),
    })));
    setExpenses(r.expenses.map((e) => ({
      key: key(), id: e.id, category: e.category, concept: e.concept, amount: centsToInput(e.amount_cents), note: e.note || '', showNote: !!e.note, files: [],
    })));
  };

  // Editar un parte concreto
  useEffect(() => {
    if (!editId) return;
    getReport(editId).then((r) => r && fill(r));
  }, [editId]);

  // Parte nuevo: si ya existe uno para esa obra y fecha, se abre ese en lugar de crear otro.
  useEffect(() => {
    if (editId || !projectId) return;
    let cancelled = false;
    (async () => {
      const existing = await findReport(projectId, date);
      if (cancelled) return;
      if (existing && existing.id !== reportId) {
        const r = await getReport(existing.id);
        if (r && !cancelled) { fill(r); setInfo(`Ya había un parte del ${fmtDate(date)}. Lo tienes abierto para completarlo.`); }
      } else if (!existing && reportId) {
        // Cambió a una fecha sin parte: empezamos uno nuevo vacío.
        setReportId(undefined); setLabor([]); setMaterials([]); setExpenses([]); setNotes(''); setInfo('');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, editId]);

  // ───── Borrador: si el móvil cierra la app a mitad del parte, se puede recuperar.
  const draftKey = projectId ? `obra.draft:${reportId ? 'r:' + reportId : `n:${projectId}:${date}`}` : '';
  const snapshot = (): Draft => ({
    labor, materials, notes, savedAt: new Date().toISOString(),
    expenses: expenses.map(({ files: _f, ...e }) => ({ ...e, files: [] })),
  });
  useEffect(() => {
    if (!draftKey || !touched.current) return;
    const t = setTimeout(() => {
      try {
        if (labor.length + materials.length + expenses.length === 0 && !notes.trim()) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify(snapshot()));
      } catch { /* sin almacenamiento: seguimos sin borrador */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labor, materials, expenses, notes, draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (!raw) { setDraft(null); return; }
        const d = JSON.parse(raw) as Draft;
        const same = (x: Draft) => JSON.stringify([x.labor.map(strip), x.materials.map(strip), x.expenses.map(strip), x.notes]);
        if (same(d) === same(snapshot())) { localStorage.removeItem(draftKey); setDraft(null); } else setDraft(d);
      } catch { setDraft(null); }
    }, 300); // tras cargar el parte guardado, si lo hay
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const restoreDraft = () => {
    if (!draft) return;
    setLabor(draft.labor.map((r) => ({ ...r, key: key() })));
    setMaterials(draft.materials.map((r) => ({ ...r, key: key() })));
    setExpenses(draft.expenses.map((r) => ({ ...r, key: key(), files: [] })));
    setNotes(draft.notes);
    setDraft(null);
    touched.current = true;
    toast('Parte recuperado');
  };
  const discardDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* nada */ } setDraft(null); };

  // Enfocar el campo recién añadido (cantidad de material, precio de un trabajador nuevo…)
  useEffect(() => {
    if (!focusNext.current) return;
    const el = document.getElementById(focusNext.current) as HTMLInputElement | null;
    focusNext.current = null;
    el?.focus();
    el?.select?.();
  });

  // ───── Mano de obra
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const inLabor = new Set(labor.map((l) => l.worker_id).filter(Boolean) as string[]);
  const inLaborNames = new Set(labor.map((l) => norm(l.worker_name)));

  const addWorker = (w: Worker) => {
    if (inLabor.has(w.id)) return;
    const row = { key: key(), worker_id: w.id, worker_name: w.name, hours: DEFAULT_HOURS, rate: centsToInput(w.default_rate_cents), habitual: w.default_rate_cents };
    if (!w.default_rate_cents) focusNext.current = `rate-${row.key}`;
    setLabor((l) => [...l, row]);
  };
  const addNewWorker = (name: string) => {
    const existing = workers.find((w) => norm(w.name) === norm(name));
    if (existing) return addWorker(existing);
    const row = { key: key(), worker_id: null, worker_name: name, hours: DEFAULT_HOURS, rate: '', habitual: null, save_rate: true };
    focusNext.current = `rate-${row.key}`;
    setLabor((l) => [...l, row]);
  };
  const updL = (k: string, patch: Partial<LRow>) => setLabor((l) => l.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  // ───── Materiales
  const inMats = new Set(materials.map((m) => m.material_id).filter(Boolean) as string[]);
  const addMaterial = (m: Material) => {
    const row = { key: key(), material_id: m.id, material_name: m.name, unit: m.default_unit, quantity: '', price: centsToInput(m.last_price_cents) };
    focusNext.current = `qty-${row.key}`;
    setMaterials((l) => [...l, row]);
  };
  const addNewMaterial = (name: string) => {
    const existing = mats.find((m) => norm(m.name) === norm(name));
    if (existing) return addMaterial(existing);
    const row = { key: key(), material_id: null, material_name: name, unit: 'ud', quantity: '', price: '' };
    focusNext.current = `qty-${row.key}`;
    setMaterials((l) => [...l, row]);
  };
  const updM = (k: string, patch: Partial<MRow>) => setMaterials((l) => l.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  // ───── Otros gastos
  const addConcept = (c: ExpenseConcept) => {
    const row = { key: key(), category: c.category, concept: c.name, amount: centsToInput(c.last_amount_cents), note: '', files: [] };
    focusNext.current = `amount-${row.key}`;
    setExpenses((l) => [...l, row]);
  };
  const addNewConcept = (name: string) => {
    const existing = concepts.find((c) => norm(c.name) === norm(name));
    if (existing) return addConcept(existing);
    const cat = EXPENSE_CATEGORIES.find((c) => norm(c) === norm(name)) || 'Otros';
    const row = { key: key(), category: cat, concept: name, amount: '', note: '', files: [] };
    focusNext.current = `amount-${row.key}`;
    setExpenses((l) => [...l, row]);
  };
  const updE = (k: string, patch: Partial<ERow>) => setExpenses((l) => l.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  // ───── Copiar día anterior (sin ids: crea líneas nuevas, nunca toca el parte antiguo)
  const copyPrevLabor = () => {
    if (!prev) return;
    const add = prev.labor.filter((l) => !inLaborNames.has(norm(l.worker_name))).map((l) => ({
      key: key(), worker_id: l.worker_id, worker_name: l.worker_name, hours: numToInput(l.hours), rate: centsToInput(l.rate_cents),
      habitual: l.worker_id ? workerById.get(l.worker_id)?.default_rate_cents : null,
    }));
    setLabor((cur) => [...cur, ...add]);
    toast(add.length ? `Copiados ${add.length} trabajadores del ${fmtDate(prev.report.date)}` : 'Esos trabajadores ya están en el parte');
  };
  const copyPrevMaterials = () => {
    if (!prev) return;
    setMaterials((cur) => [...cur, ...prev.materials.map((m) => ({
      key: key(), material_id: m.material_id, material_name: m.material_name, unit: m.unit, quantity: numToInput(m.quantity),
      price: centsToInput(m.material_id ? mats.find((x) => x.id === m.material_id)?.last_price_cents ?? m.unit_price_cents : m.unit_price_cents),
    }))]);
  };
  const copyPrevExpenses = () => {
    if (!prev) return;
    setExpenses((cur) => [...cur, ...prev.expenses.map((e) => ({
      key: key(), category: e.category, concept: e.concept, amount: centsToInput(e.amount_cents), note: '', files: [],
    }))]);
  };

  // ───── Totales en vivo
  const lc = (r: LRow) => lineCost(parseDecimal(r.hours) || 0, parseMoney(r.rate) || 0);
  const mc = (r: MRow) => lineCost(parseDecimal(r.quantity) || 0, parseMoney(r.price) || 0);
  const laborTotal = labor.reduce((a, r) => a + lc(r), 0);
  const laborHours = labor.reduce((a, r) => a + (parseDecimal(r.hours) || 0), 0);
  const matTotal = materials.reduce((a, r) => a + mc(r), 0);
  const expTotal = expenses.reduce((a, r) => a + (parseMoney(r.amount) || 0), 0);
  const dayTotal = laborTotal + matTotal + expTotal;
  const empty = labor.length + materials.length + expenses.length === 0 && !notes.trim();

  const save = async () => {
    const errs: string[] = [];
    for (const r of labor) {
      const h = parseDecimal(r.hours);
      if (h == null || h < 0 || h > 24) errs.push(`Revisa las horas de ${r.worker_name}.`);
      if (parseMoney(r.rate) == null) errs.push(`Falta el precio/hora de ${r.worker_name}.`);
    }
    for (const r of materials) {
      if (!parseDecimal(r.quantity)) errs.push(`Falta la cantidad de ${r.material_name}.`);
      if (parseMoney(r.price) == null) errs.push(`Falta el precio de ${r.material_name}.`);
    }
    for (const r of expenses) if (parseMoney(r.amount) == null) errs.push(`Falta el importe de «${r.concept || r.category}».`);
    if (reportId) {
      const clash = await findReport(projectId, date);
      if (clash && clash.id !== reportId) errs.push(`Ya existe otro parte el ${fmtDate(date)} en esta obra.`);
    }
    setErrors(errs);
    if (errs.length) { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); return; }
    setSaving(true);
    try {
      await saveReport({
        id: reportId, project_id: projectId, date, notes,
        labor: labor.map((r) => ({
          id: r.id, worker_id: r.worker_id, worker_name: r.worker_name, hours: parseDecimal(r.hours) || 0, rate_cents: parseMoney(r.rate) || 0,
          save_rate: r.save_rate,
        })),
        materials: materials.map((r) => ({
          id: r.id, material_id: r.material_id, material_name: r.material_name, unit: r.unit,
          quantity: parseDecimal(r.quantity) || 0, unit_price_cents: parseMoney(r.price) || 0,
        })),
        expenses: expenses.map((r) => ({ id: r.id, category: r.category, concept: r.concept, amount_cents: parseMoney(r.amount) || 0, note: r.note, files: r.files })),
      });
      try { localStorage.removeItem(draftKey); } catch { /* nada */ }
      touched.current = false;
      toast(`Parte del ${fmtDate(date)} guardado · ${euros(dayTotal)}`);
      navigate(`/obra/${projectId}`, { replace: true });
    } catch (e) {
      setErrors([`No se pudo guardar: ${(e as Error).message}`]);
    } finally {
      setSaving(false);
    }
  };

  const freqWorkers = frequent(workers.filter((w) => !inLabor.has(w.id) && w.active !== false), new Set(), 6);
  const freqMats = frequent(mats.filter((m) => !inMats.has(m.id)), new Set(), 6);
  const freqConcepts = frequent(concepts, new Set(expenses.map((e) => norm(e.concept))), 6);
  const unusedCategories = EXPENSE_CATEGORIES.filter((c) => !concepts.some((x) => norm(x.name) === norm(c) || (x.use_count > 0 && x.category === c)) && !expenses.some((e) => e.category === c));

  const prevNames = prev?.labor.map((l) => l.worker_name.split(' ')[0]).join(', ');

  return (
    <div className="page report" onInputCapture={() => { touched.current = true; }} onClickCapture={() => { touched.current = true; }}>
      <TopBar
        title={reportId ? 'Parte diario' : 'Nuevo parte'}
        sub={project ? <button className="link" onClick={() => navigate('/elegir-obra')}>{project.name} <Icon name="chevron" size={14} /></button> : ''}
        backTo={projectId ? `/obra/${projectId}` : '/'}
      />

      <div className="date-row">
        <label className="field date-field">
          <span>Fecha</span>
          <input id="report-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <div className="date-human">
          <strong>{weekday(date)}</strong>
          <span className="num">{fmtDate(date)}</span>
          {date === todayISO() && <span className="pill pill-today">Hoy</span>}
        </div>
      </div>

      {info && <p className="notice notice-info">{info}</p>}

      {draft && (
        <div className="notice">
          <p><strong>Tienes un parte sin guardar</strong> de las {new Date(draft.savedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ({draft.labor.length} trabajadores, {draft.materials.length} materiales, {draft.expenses.length} gastos).</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={restoreDraft}>Recuperarlo</button>
            <button className="btn btn-small" onClick={discardDraft}>Descartar</button>
          </div>
        </div>
      )}

      {prev && prev.labor.length > 0 && labor.length === 0 && (
        <button className="btn btn-copy btn-block" onClick={copyPrevLabor}>
          <Icon name="copy" size={20} />
          <span>Copiar día anterior <small>{fmtDate(prev.report.date)} · {prevNames}</small></span>
        </button>
      )}

      {/* MANO DE OBRA */}
      <section className="block" aria-labelledby="h-labor">
        <div className="block-head">
          <h2 id="h-labor"><span className="swatch series-labor" />Mano de obra</h2>
          <span className="block-total num">{laborHours ? `${fmtHours(laborHours)} · ` : ''}{euros(laborTotal)}</span>
        </div>
        {labor.map((r) => {
          const rateC = parseMoney(r.rate);
          const habitual = r.habitual ?? (r.worker_id ? workerById.get(r.worker_id)?.default_rate_cents : null);
          const changed = r.worker_id && habitual != null && rateC != null && rateC !== habitual;
          return (
            <div className="line" key={r.key}>
              <div className="line-top">
                <strong className="line-name">{r.worker_name}</strong>
                <span className="line-cost num">{euros(lc(r))}</span>
                <button className="icon-btn small" onClick={() => setLabor((l) => l.filter((x) => x.key !== r.key))} aria-label={`Quitar ${r.worker_name}`}><Icon name="x" size={18} /></button>
              </div>
              <div className="line-fields">
                <div className="lf">
                  <Stepper id={`hours-${r.key}`} label={`horas de ${r.worker_name}`} value={r.hours} onChange={(v) => updL(r.key, { hours: v })} />
                  <span className="unit">h</span>
                </div>
                <span className="times">×</span>
                <div className="lf">
                  <input id={`rate-${r.key}`} className="money" inputMode="decimal" value={r.rate} placeholder="0" aria-label={`Precio por hora de ${r.worker_name}`}
                    onChange={(e) => updL(r.key, { rate: e.target.value })} onFocus={(e) => e.target.select()} />
                  <span className="unit">€/h</span>
                </div>
              </div>
              {changed && (
                <label className="check">
                  <input type="checkbox" checked={!!r.save_rate} onChange={(e) => updL(r.key, { save_rate: e.target.checked })} />
                  Guardar {euros(rateC!)} como precio habitual (ahora {euros(habitual!)})
                </label>
              )}
            </div>
          );
        })}
        <AddWithSuggestions<Worker>
          id="add-worker" items={workers} exclude={inLabor} placeholder="Añadir trabajador…"
          onPick={addWorker} onCreate={addNewWorker} meta={(w) => `${euros(w.default_rate_cents)}/h`}
        />
        <Chips label="Trabajadores frecuentes" items={freqWorkers} onPick={addWorker} />
      </section>

      {/* MATERIALES */}
      <section className="block" aria-labelledby="h-mat">
        <div className="block-head">
          <h2 id="h-mat"><span className="swatch series-materials" />Materiales</h2>
          <span className="block-total num">{euros(matTotal)}</span>
        </div>
        {materials.map((r) => (
          <div className="line" key={r.key}>
            <div className="line-top">
              <strong className="line-name">{r.material_name}</strong>
              <span className="line-cost num">{euros(mc(r))}</span>
              <button className="icon-btn small" onClick={() => setMaterials((l) => l.filter((x) => x.key !== r.key))} aria-label={`Quitar ${r.material_name}`}><Icon name="x" size={18} /></button>
            </div>
            <div className="line-fields">
              <div className="lf">
                <input id={`qty-${r.key}`} className="qty" inputMode="decimal" value={r.quantity} placeholder="Cant." aria-label={`Cantidad de ${r.material_name}`}
                  onChange={(e) => updM(r.key, { quantity: e.target.value })} onFocus={(e) => e.target.select()} />
                <select value={r.unit} onChange={(e) => updM(r.key, { unit: e.target.value })} aria-label="Unidad">
                  {[...new Set([...UNITS, r.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <span className="times">×</span>
              <div className="lf">
                <input id={`price-${r.key}`} className="money" inputMode="decimal" value={r.price} placeholder="0" aria-label={`Precio unitario de ${r.material_name}`}
                  onChange={(e) => updM(r.key, { price: e.target.value })} onFocus={(e) => e.target.select()} />
                <span className="unit">€/{r.unit}</span>
              </div>
            </div>
          </div>
        ))}
        <AddWithSuggestions<Material>
          id="add-material" items={mats} placeholder="Añadir material…"
          onPick={addMaterial} onCreate={addNewMaterial} meta={(m) => `${m.default_unit} · ${euros(m.last_price_cents)}`}
        />
        <Chips label="Materiales frecuentes" items={freqMats} onPick={addMaterial} />
        {prev && prev.materials.length > 0 && materials.length === 0 && (
          <button className="link copy-link" onClick={copyPrevMaterials}><Icon name="copy" size={16} /> Copiar materiales del {fmtDate(prev.report.date)}</button>
        )}
      </section>

      {/* OTROS GASTOS */}
      <section className="block" aria-labelledby="h-exp">
        <div className="block-head">
          <h2 id="h-exp"><span className="swatch series-other" />Otros gastos</h2>
          <span className="block-total num">{euros(expTotal)}</span>
        </div>
        {expenses.map((r) => (
          <div className="line" key={r.key}>
            <div className="line-top">
              <input className="line-name-input" value={r.concept} onChange={(e) => updE(r.key, { concept: e.target.value })} aria-label="Concepto" placeholder="Concepto" />
              <button className="icon-btn small" onClick={() => setExpenses((l) => l.filter((x) => x.key !== r.key))} aria-label={`Quitar ${r.concept}`}><Icon name="x" size={18} /></button>
            </div>
            <div className="line-fields">
              <select className="cat" value={r.category} onChange={(e) => updE(r.key, { category: e.target.value })} aria-label="Tipo de gasto">
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className="lf">
                <input id={`amount-${r.key}`} className="money" inputMode="decimal" value={r.amount} placeholder="0" aria-label={`Importe de ${r.concept}`}
                  onChange={(e) => updE(r.key, { amount: e.target.value })} onFocus={(e) => e.target.select()} />
                <span className="unit">€</span>
              </div>
            </div>
            <div className="line-extra">
              {r.showNote ? (
                <input className="note-input" value={r.note} placeholder="Nota" aria-label="Nota" onChange={(e) => updE(r.key, { note: e.target.value })} />
              ) : (
                <button className="link" onClick={() => updE(r.key, { showNote: true })}>+ Nota</button>
              )}
              <label className="link file-link">
                <Icon name="camera" size={16} /> {r.files.length ? `${r.files.length} ticket${r.files.length > 1 ? 's' : ''}` : 'Ticket'}
                <input type="file" accept="image/*,application/pdf" multiple hidden
                  onChange={(e) => updE(r.key, { files: [...r.files, ...Array.from(e.target.files || [])] })} />
              </label>
            </div>
          </div>
        ))}
        <AddWithSuggestions<ExpenseConcept>
          id="add-expense" items={concepts} placeholder="Añadir gasto…"
          onPick={addConcept} onCreate={addNewConcept} meta={(c) => (c.last_amount_cents != null ? euros(c.last_amount_cents) : c.category)}
        />
        <Chips label="Gastos frecuentes" items={freqConcepts} onPick={addConcept} />
        <div className="chips chips-quiet" aria-label="Tipos de gasto">
          {unusedCategories.map((c) => (
            <button type="button" key={c} className="chip chip-quiet" onClick={() => addNewConcept(c)}>{c}</button>
          ))}
        </div>
        {prev && prev.expenses.length > 0 && expenses.length === 0 && (
          <button className="link copy-link" onClick={copyPrevExpenses}><Icon name="copy" size={16} /> Copiar gastos del {fmtDate(prev.report.date)}</button>
        )}
      </section>

      <section className="block">
        <label className="field">
          <span>Notas del día</span>
          <textarea id="report-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué se hizo, incidencias…" />
        </label>
      </section>

      {errors.length > 0 && (
        <div className="error-box" role="alert">
          {errors.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}

      {reportId && (
        <ConfirmButton label="Borrar este parte" confirmLabel="Pulsa otra vez para borrar el parte"
          onConfirm={async () => { await deleteReport(reportId); toast('Parte borrado'); back(`/obra/${projectId}`); }} />
      )}

      <div className="savebar">
        <div className="savebar-total">
          <span>Total del día</span>
          <strong className="num">{euros(dayTotal)}</strong>
        </div>
        <button className="btn btn-primary" disabled={saving || empty || !projectId} onClick={save}>
          <Icon name="check" size={20} stroke={2.5} /> Guardar parte
        </button>
      </div>
    </div>
  );
}
