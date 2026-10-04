import { useLiveQuery } from 'dexie-react-hooks';
import { allTotals, clientMap, listProjects } from '../data/repo';
import { fmtDate } from '../lib/format';
import { navigate } from '../lib/router';
import { Empty, Icon, StatusPill, TopBar } from '../components/ui';

/** Botón principal: si solo hay una obra en curso va directo a su parte de hoy. */
export async function startTodayReport() {
  const projects = (await listProjects()).filter((p) => p.status === 'en_curso');
  if (projects.length === 1) navigate(`/parte/nuevo/${projects[0].id}`);
  else navigate('/elegir-obra');
}

export default function PickProject() {
  const data = useLiveQuery(async () => {
    const [projects, totals, clients] = await Promise.all([listProjects(), allTotals(), clientMap()]);
    const list = projects
      .filter((p) => p.status !== 'terminada')
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'en_curso' ? -1 : 1) ||
        (totals.get(b.id)?.lastDate || '').localeCompare(totals.get(a.id)?.lastDate || ''));
    return { list, totals, clients };
  });

  return (
    <div className="page">
      <TopBar title="¿En qué obra?" sub="Parte de hoy" backTo="/" />
      {data && data.list.length === 0 && (
        <Empty icon="home" title="No hay obras activas">
          <button className="btn btn-primary" onClick={() => navigate('/obra/nueva')}>Crear obra</button>
        </Empty>
      )}
      <div className="pick-list">
        {data?.list.map((p) => {
          const last = data.totals.get(p.id)?.lastDate;
          return (
            <button key={p.id} className="pick" onClick={() => navigate(`/parte/nuevo/${p.id}`, { replace: true })}>
              <div>
                <strong>{p.name}</strong>
                <span className="muted">{p.client_id ? data.clients.get(p.client_id)?.name : 'Sin cliente'}{last ? ` · último parte ${fmtDate(last)}` : ''}</span>
              </div>
              {p.status !== 'en_curso' && <StatusPill status={p.status} />}
              <Icon name="chevron" />
            </button>
          );
        })}
      </div>
      {data && data.list.length > 0 && (
        <button className="btn btn-ghost" onClick={() => navigate('/obra/nueva')}><Icon name="plus" size={18} /> Nueva obra</button>
      )}
    </div>
  );
}
