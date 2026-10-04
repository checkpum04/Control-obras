import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteCatalogItem, listConcepts, listMaterials, listWorkers, saveConcept, saveMaterial, saveWorker } from '../data/repo';
import { centsToInput, euros, norm, parseMoney } from '../lib/format';
import { navigate } from '../lib/router';
import { ConfirmButton, Empty, Icon, Sheet, TopBar, toast } from '../components/ui';
import { EXPENSE_CATEGORIES, UNITS, UNIT_LABEL } from '../data/types';

type Kind = 'trabajadores' | 'materiales' | 'gastos';
const TABS: { key: Kind; label: string }[] = [
  { key: 'trabajadores', label: 'Trabajadores' },
  { key: 'materiales', label: 'Materiales' },
  { key: 'gastos', label: 'Gastos frecuentes' },
];

interface Item { id: string; name: string; price: number | null | undefined; extra: string; active?: boolean; use_count: number }

export default function Catalog({ tab = 'trabajadores' }: { tab?: string }) {
  const kind = (TABS.some((t) => t.key === tab) ? tab : 'trabajadores') as Kind;
  const [filter, setFilter] = useState('');
  const [edit, setEdit] = useState<Item | 'new' | null>(null);

  const items = useLiveQuery(async (): Promise<Item[]> => {
    if (kind === 'trabajadores') return (await listWorkers()).map((w) => ({ id: w.id, name: w.name, price: w.default_rate_cents, extra: '€/h', active: w.active, use_count: w.use_count }));
    if (kind === 'materiales') return (await listMaterials()).map((m) => ({ id: m.id, name: m.name, price: m.last_price_cents, extra: m.default_unit, use_count: m.use_count }));
    return (await listConcepts()).map((c) => ({ id: c.id, name: c.name, price: c.last_amount_cents, extra: c.category, use_count: c.use_count }));
  }, [kind]);

  const list = (items || [])
    .filter((i) => !filter || norm(i.name).includes(norm(filter)))
    .sort((a, b) => (b.active !== false ? 1 : 0) - (a.active !== false ? 1 : 0) || a.name.localeCompare(b.name, 'es'));

  return (
    <div className="page">
      <TopBar title="Catálogo" sub="Lo que la app recuerda para autocompletar" />
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={kind === t.key} className={kind === t.key ? 'on' : ''} onClick={() => navigate(`/catalogo/${t.key}`, { replace: true })}>{t.label}</button>
        ))}
      </nav>
      <div className="toolbar">
        <div className="search-box small">
          <Icon name="search" size={18} />
          <input id="cat-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar…" aria-label="Filtrar" />
        </div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={18} /> Nuevo</button>
      </div>
      {items && list.length === 0 ? (
        <Empty icon={kind === 'trabajadores' ? 'user' : kind === 'materiales' ? 'box' : 'receipt'} title="Nada todavía">
          <p>Se rellena solo a medida que haces partes. También puedes añadirlos aquí.</p>
        </Empty>
      ) : (
        <ul className="rows">
          {list.map((i) => (
            <li key={i.id}>
              <button className={`row-btn cat-row${i.active === false ? ' inactive' : ''}`} onClick={() => setEdit(i)}>
                <div><strong>{i.name}</strong><span className="muted">{kind === 'materiales' ? `por ${i.extra}` : kind === 'gastos' ? i.extra : i.active === false ? 'Inactivo' : 'Precio habitual'}{i.use_count ? ` · usado ${i.use_count} ${i.use_count === 1 ? 'vez' : 'veces'}` : ''}</span></div>
                <span className="num">{i.price != null ? euros(i.price) : '—'}{kind === 'trabajadores' ? '/h' : ''}</span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small center">Cambiar un precio aquí solo afecta a los partes nuevos. Los partes ya guardados conservan su precio.</p>
      <EditSheet kind={kind} item={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function EditSheet({ kind, item, onClose }: { kind: Kind; item: Item | 'new' | null; onClose: () => void }) {
  const [f, setF] = useState({ name: '', price: '', extra: '', active: true });
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!item) return;
    setErr('');
    if (item === 'new') setF({ name: '', price: '', extra: kind === 'materiales' ? 'ud' : kind === 'gastos' ? 'Otros' : '', active: true });
    else setF({ name: item.name, price: centsToInput(item.price), extra: item.extra, active: item.active !== false });
  }, [item, kind]);

  const id = item && item !== 'new' ? item.id : undefined;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Escribe un nombre.');
    const price = parseMoney(f.price);
    if (kind === 'trabajadores') await saveWorker({ id, name: f.name.trim(), default_rate_cents: price ?? 0, active: f.active });
    else if (kind === 'materiales') await saveMaterial({ id, name: f.name.trim(), last_price_cents: price ?? 0, default_unit: f.extra });
    else await saveConcept({ id, name: f.name.trim(), last_amount_cents: price, category: f.extra });
    toast('Guardado');
    onClose();
  };
  const title = kind === 'trabajadores' ? 'Trabajador' : kind === 'materiales' ? 'Material' : 'Gasto frecuente';

  return (
    <Sheet open={!!item} onClose={onClose} title={item === 'new' ? `Nuevo ${title.toLowerCase()}` : title}>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Nombre</span>
          <input id="cat-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={item === 'new'} />
        </label>
        <div className="row2">
          <label className="field"><span>{kind === 'trabajadores' ? 'Precio/hora habitual (€)' : kind === 'materiales' ? 'Precio habitual (€)' : 'Importe habitual (€)'}</span>
            <input id="cat-price" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="0" />
          </label>
          {kind === 'materiales' && (
            <label className="field"><span>Unidad</span>
              <select id="cat-unit" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })}>
                {[...new Set([...UNITS, f.extra])].map((u) => <option key={u} value={u}>{u} · {UNIT_LABEL[u] || u}</option>)}
              </select>
            </label>
          )}
          {kind === 'gastos' && (
            <label className="field"><span>Tipo</span>
              <select id="cat-category" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
        </div>
        {kind === 'trabajadores' && (
          <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (aparece en frecuentes)</label>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn btn-primary btn-block" type="submit">Guardar</button>
        {id && (
          <ConfirmButton label="Quitar del catálogo" confirmLabel="Pulsa otra vez (los partes antiguos no cambian)"
            onConfirm={async () => { await deleteCatalogItem(kind === 'trabajadores' ? 'workers' : kind === 'materiales' ? 'materials' : 'concepts', id); toast('Quitado del catálogo'); onClose(); }} />
        )}
      </form>
    </Sheet>
  );
}
