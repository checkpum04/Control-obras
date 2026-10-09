import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addPartidas, deleteProject, getProject, listClients, saveProject, type PartidaSeed } from '../data/repo';
import { PartidaPicker } from '../components/PartidaPicker';
import { db } from '../data/db';
import { centsToInput, parseMoney, todayISO } from '../lib/format';
import { navigate } from '../lib/router';
import { ConfirmButton, TopBar, toast } from '../components/ui';
import { STATUS_LABEL, type ProjectStatus } from '../data/types';

export default function ProjectForm({ id }: { id?: string }) {
  const clients = useLiveQuery(listClients) || [];
  const [f, setF] = useState({
    name: '', client_name: '', address: '', start_date: todayISO(), end_date: '',
    status: 'en_curso' as ProjectStatus, budget: '', notes: '',
  });
  const [error, setError] = useState('');
  const [partidas, setPartidas] = useState<PartidaSeed[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const p = await getProject(id);
      if (!p) return;
      const c = p.client_id ? await db.clients.get(p.client_id) : undefined;
      setF({
        name: p.name, client_name: c?.name || '', address: p.address || '', start_date: p.start_date || '',
        end_date: p.end_date || '', status: p.status, budget: centsToInput(p.budget_cents), notes: p.notes || '',
      });
    })();
  }, [id]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Ponle un nombre a la obra.'); return; }
    const budget = parseMoney(f.budget);
    if (f.budget.trim() && budget == null) { setError('El presupuesto no es un número válido. Ejemplo: 45000 o 45.000,00'); return; }
    const pid = await saveProject({
      id, name: f.name, client_name: f.client_name, address: f.address, start_date: f.start_date || null,
      end_date: f.end_date || null, status: f.status, budget_cents: budget, notes: f.notes,
    });
    if (!id && partidas.length) await addPartidas(pid, partidas);
    toast(id ? 'Obra guardada' : 'Obra creada');
    navigate(`/obra/${pid}`, { replace: true });
  };

  return (
    <div className="page">
      <TopBar title={id ? 'Editar obra' : 'Nueva obra'} backTo={id ? `/obra/${id}` : '/'} />
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Nombre de la obra</span>
          <input id="obra-name" value={f.name} onChange={set('name')} placeholder="Reforma casa Martínez" autoFocus={!id} />
        </label>
        <label className="field">
          <span>Cliente</span>
          <input id="obra-client" value={f.client_name} onChange={set('client_name')} list="clients-list" placeholder="Nombre del cliente" />
          <datalist id="clients-list">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <label className="field">
          <span>Dirección</span>
          <input id="obra-address" value={f.address} onChange={set('address')} placeholder="Calle, número, localidad" />
        </label>
        <div className="row2">
          <label className="field">
            <span>Fecha de inicio</span>
            <input id="obra-start" type="date" value={f.start_date} onChange={set('start_date')} />
          </label>
          <label className="field">
            <span>Presupuesto (€)</span>
            <input id="obra-budget" inputMode="decimal" value={f.budget} onChange={set('budget')} placeholder="45.000" />
          </label>
        </div>
        <fieldset className="field">
          <legend>Estado</legend>
          <div className="seg seg-full">
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <button type="button" key={s} className={f.status === s ? 'on' : ''} aria-pressed={f.status === s}
                onClick={() => setF({ ...f, status: s, end_date: s === 'terminada' && !f.end_date ? todayISO() : f.end_date })}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>
        {f.status === 'terminada' && (
          <label className="field">
            <span>Fecha de fin</span>
            <input id="obra-end" type="date" value={f.end_date} onChange={set('end_date')} />
          </label>
        )}
        <label className="field">
          <span>Notas</span>
          <textarea id="obra-notes" rows={3} value={f.notes} onChange={set('notes')} placeholder="Llaves, horarios, contacto…" />
        </label>
        {!id && (
          <fieldset className="field">
            <legend>Partidas <small className="muted">(opcional, las puedes cambiar luego)</small></legend>
            <PartidaPicker value={partidas} onChange={setPartidas} />
          </fieldset>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit">{id ? 'Guardar cambios' : 'Crear obra'}</button>
        {id && (
          <ConfirmButton label="Borrar obra" confirmLabel="Pulsa otra vez para borrar la obra"
            onConfirm={async () => { await deleteProject(id); toast('Obra borrada'); navigate('/', { replace: true }); }} />
        )}
      </form>
    </div>
  );
}
