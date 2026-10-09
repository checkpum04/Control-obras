import { useEffect, useState } from 'react';
import { deletePartida, savePartida } from '../data/repo';
import { centsToInput, numToInput, parseDecimal, parseMoney, todayISO } from '../lib/format';
import { STATUS_LABEL, UNITS, UNIT_LABEL, type Partida, type ProjectStatus } from '../data/types';
import { ConfirmButton, Sheet, toast } from './ui';

const EMPTY = { name: '', description: '', budget: '', status: 'pendiente' as ProjectStatus, start_date: '', end_date: '', quantity: '', unit: '', notes: '' };

/** Hoja para crear o editar una partida. */
export function PartidaForm({ open, onClose, projectId, partida, onDeleted }: {
  open: boolean; onClose: () => void; projectId: string; partida?: Partida | null; onDeleted?: () => void;
}) {
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(partida ? {
      name: partida.name, description: partida.description || '', budget: centsToInput(partida.budget_cents), status: partida.status,
      start_date: partida.start_date || '', end_date: partida.end_date || '', quantity: numToInput(partida.quantity),
      unit: partida.unit || '', notes: partida.notes || '',
    } : EMPTY);
  }, [open, partida]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Ponle un nombre a la partida.');
    const budget = parseMoney(f.budget);
    if (f.budget.trim() && budget == null) return setErr('El presupuesto no es un número válido.');
    const qty = parseDecimal(f.quantity);
    if (f.quantity.trim() && (qty == null || qty < 0)) return setErr('La cantidad ejecutada no es un número válido.');
    await savePartida({
      id: partida?.id, project_id: projectId, name: f.name, description: f.description, budget_cents: budget, status: f.status,
      start_date: f.start_date || null, end_date: f.end_date || null, quantity: qty, unit: f.unit || null, notes: f.notes,
      archived: partida?.archived,
    });
    toast(partida ? 'Partida guardada' : 'Partida creada');
    onClose();
  };

  const archive = async () => {
    if (!partida) return;
    await savePartida({ ...partida, archived: !partida.archived });
    toast(partida.archived ? 'Partida recuperada' : 'Partida archivada');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={partida ? 'Editar partida' : 'Nueva partida'}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nombre</span>
          <input id="partida-name" value={f.name} onChange={set('name')} placeholder="Pladur, Pintura…" autoFocus={!partida} />
        </label>
        <label className="field"><span>Descripción (opcional)</span>
          <input id="partida-desc" value={f.description} onChange={set('description')} placeholder="Tabiques y techos de la planta 1" />
        </label>
        <div className="row2">
          <label className="field"><span>Presupuesto (€)</span>
            <input id="partida-budget" inputMode="decimal" value={f.budget} onChange={set('budget')} placeholder="Opcional" />
          </label>
          <div className="field"><span>Cantidad ejecutada</span>
            <div className="qty-unit">
              <input id="partida-qty" inputMode="decimal" value={f.quantity} onChange={set('quantity')} placeholder="120" aria-label="Cantidad ejecutada" />
              <select id="partida-unit" value={f.unit} onChange={set('unit')} aria-label="Unidad">
                <option value="">—</option>
                {[...new Set([...UNITS.filter((u) => u !== 'h'), ...(f.unit ? [f.unit] : [])])].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
        {f.unit && <p className="muted small">Con la cantidad en {UNIT_LABEL[f.unit] || f.unit} verás el coste real por {f.unit}.</p>}
        <fieldset className="field">
          <legend>Estado</legend>
          <div className="seg seg-full">
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <button type="button" key={s} className={f.status === s ? 'on' : ''} aria-pressed={f.status === s}
                onClick={() => setF({
                  ...f, status: s,
                  start_date: s !== 'pendiente' && !f.start_date ? todayISO() : f.start_date,
                  end_date: s === 'terminada' && !f.end_date ? todayISO() : f.end_date,
                })}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row2">
          <label className="field"><span>Inicio</span><input id="partida-start" type="date" value={f.start_date} onChange={set('start_date')} /></label>
          <label className="field"><span>Fin</span><input id="partida-end" type="date" value={f.end_date} onChange={set('end_date')} /></label>
        </div>
        <label className="field"><span>Notas</span>
          <textarea id="partida-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Medidas, acuerdos con el cliente…" />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" type="submit">{partida ? 'Guardar cambios' : 'Crear partida'}</button>
        {partida && (
          <>
            <button type="button" className="btn btn-ghost btn-block" onClick={archive}>
              {partida.archived ? 'Sacar del archivo' : 'Archivar (deja de salir en los partes)'}
            </button>
            <ConfirmButton label="Borrar partida" confirmLabel="Pulsa otra vez: sus costes pasan a «Sin partida»"
              onConfirm={async () => { await deletePartida(partida.id); toast('Partida borrada'); onClose(); onDeleted?.(); }} />
          </>
        )}
      </form>
    </Sheet>
  );
}
