import { useId, useMemo, useState, type ReactNode } from 'react';
import { rank, type Suggestable } from '../lib/suggest';
import { norm } from '../lib/format';
import { Icon } from './ui';

/**
 * Cuadro "Añadir…" con sugerencias. Al elegir una sugerencia llama a onPick(item);
 * si lo escrito es nuevo, ofrece "Añadir «texto»" y llama a onCreate(texto).
 */
export function AddWithSuggestions<T extends Suggestable & { id: string }>({
  items, placeholder, onPick, onCreate, meta, exclude, id,
}: {
  items: T[];
  placeholder: string;
  onPick: (item: T) => void;
  onCreate: (name: string) => void;
  meta?: (item: T) => ReactNode;
  exclude?: Set<string>;
  id?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const pool = useMemo(() => (exclude ? items.filter((i) => !exclude.has(i.id)) : items), [items, exclude]);
  const hits = useMemo(() => (q.trim() ? rank(pool, q, 6) : []), [pool, q]);
  const exact = hits.some((h) => norm(h.name) === norm(q));
  const showCreate = q.trim().length > 0 && !exact;
  const total = hits.length + (showCreate ? 1 : 0);

  const choose = (i: number) => {
    if (i < hits.length) onPick(hits[i]);
    else if (showCreate) onCreate(q.trim());
    setQ('');
    setActive(0);
  };

  return (
    <div className="ac">
      <div className="ac-field">
        <Icon name="plus" size={20} />
        <input
          id={id}
          value={q}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="sentences"
          role="combobox"
          aria-expanded={open && total > 0}
          aria-controls={listId}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(total - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter' && total > 0) { e.preventDefault(); choose(active); }
          }}
        />
      </div>
      {open && total > 0 && (
        <ul className="ac-list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}>
                <span className="ac-name">{h.name}</span>
                {meta && <span className="ac-meta">{meta(h)}</span>}
              </button>
            </li>
          ))}
          {showCreate && (
            <li role="option" aria-selected={active === hits.length}>
              <button type="button" className={'ac-create' + (active === hits.length ? ' active' : '')} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(hits.length)}>
                <Icon name="plus" size={16} /> Añadir «{q.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Fila de botones con los elementos más usados. */
export function Chips<T extends { id: string; name: string }>({ items, onPick, label, meta }: {
  items: T[]; onPick: (i: T) => void; label: string; meta?: (i: T) => string;
}) {
  if (!items.length) return null;
  return (
    <div className="chips" aria-label={label}>
      {items.map((i) => (
        <button type="button" key={i.id} className="chip" onClick={() => onPick(i)}>
          <Icon name="plus" size={14} stroke={2.5} />{i.name}{meta && <small>{meta(i)}</small>}
        </button>
      ))}
    </div>
  );
}
