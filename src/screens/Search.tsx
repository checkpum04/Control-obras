import { useEffect, useState } from 'react';
import { search, type SearchHit } from '../data/repo';
import { navigate } from '../lib/router';
import { Empty, Icon, TopBar } from '../components/ui';
import { fmtDate } from '../lib/format';

const GROUPS: { type: SearchHit['type']; label: string; icon: string }[] = [
  { type: 'obra', label: 'Obras', icon: 'home' },
  { type: 'parte', label: 'Partes diarios', icon: 'calendar' },
  { type: 'trabajador', label: 'Trabajadores', icon: 'user' },
  { type: 'material', label: 'Materiales', icon: 'box' },
  { type: 'gasto', label: 'Gastos', icon: 'receipt' },
];

export default function Search() {
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem('obra.q') || ''; } catch { return ''; } });
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    try { sessionStorage.setItem('obra.q', q); } catch { /* nada */ }
    let cancel = false;
    const t = setTimeout(() => search(q).then((h) => !cancel && setHits(h)), 120);
    return () => { cancel = true; clearTimeout(t); };
  }, [q]);

  const open = (h: SearchHit) => {
    if (h.type === 'obra') navigate(`/obra/${h.id}`);
    else if (h.type === 'parte') navigate(`/parte/${h.id}`);
    else if (h.type === 'gasto') navigate(`/obra/${h.projectId}/gastos`);
    else if (h.projectIds.length === 1) navigate(`/obra/${h.projectIds[0]}/${h.type === 'trabajador' ? 'trabajadores' : 'materiales'}`);
    else navigate('/catalogo/' + (h.type === 'trabajador' ? 'trabajadores' : 'materiales'));
  };

  return (
    <div className="page">
      <TopBar title="Buscar" />
      <div className="search-box">
        <Icon name="search" />
        <input id="search-q" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Obra, cliente, trabajador, material, 12/10…" aria-label="Buscar" />
      </div>
      {q.trim().length < 2 ? (
        <p className="muted center">Escribe al menos dos letras. Para buscar un parte, escribe la fecha (12/10).</p>
      ) : hits.length === 0 ? (
        <Empty icon="search" title={`Nada encontrado para «${q}»`} />
      ) : (
        GROUPS.map((g) => {
          const list = hits.filter((h) => h.type === g.type);
          if (!list.length) return null;
          return (
            <section key={g.type} className="search-group">
              <h2 className="label">{g.label} <span className="muted">{list.length}</span></h2>
              <ul className="rows">
                {list.slice(0, 20).map((h) => (
                  <li key={h.type + h.id}>
                    <button className="row-btn search-hit" onClick={() => open(h)}>
                      <Icon name={g.icon} size={20} />
                      <div><strong>{h.title}</strong><span className="muted">{h.type === 'gasto' ? h.sub.replace(/\d{4}-\d{2}-\d{2}$/, (d) => fmtDate(d)) : h.sub}</span></div>
                      <Icon name="chevron" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
