import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { allTotals, clientMap, clearExamples, hasExamples, listProjects } from '../data/repo';
import { budgetStatus } from '../lib/calc';
import { eurosRound, fmtDate, pct } from '../lib/format';
import { navigate } from '../lib/router';
import { BudgetMeter, ConfirmButton, Empty, HealthPill, Icon, StatusPill, toast } from '../components/ui';
import type { ProjectStatus } from '../data/types';
import { startTodayReport } from './PickProject';
import { SyncBadge } from '../components/SyncBadge';

type Filter = 'activas' | ProjectStatus | 'todas';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'activas', label: 'Activas' },
  { key: 'en_curso', label: 'En curso' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'terminada', label: 'Terminadas' },
  { key: 'todas', label: 'Todas' },
];
const ORDER: Record<ProjectStatus, number> = { en_curso: 0, pendiente: 1, terminada: 2 };

export default function Home() {
  const [filter, setFilter] = useState<Filter>(() => {
    try { return (localStorage.getItem('obra.filter') as Filter) || 'activas'; } catch { return 'activas'; }
  });
  const data = useLiveQuery(async () => {
    const [projects, totals, clients, examples] = await Promise.all([listProjects(), allTotals(), clientMap(), hasExamples()]);
    return { projects, totals, clients, examples };
  });

  const setF = (f: Filter) => { setFilter(f); try { localStorage.setItem('obra.filter', f); } catch { /* nada */ } };

  if (!data) return <div className="page" />;
  const { projects, totals, clients, examples } = data;
  const visible = projects
    .filter((p) => filter === 'todas' || (filter === 'activas' ? p.status !== 'terminada' : p.status === filter))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (totals.get(b.id)?.lastDate || '').localeCompare(totals.get(a.id)?.lastDate || '') || a.name.localeCompare(b.name, 'es'));

  const active = projects.filter((p) => p.status === 'en_curso');
  const spentActive = active.reduce((a, p) => a + (totals.get(p.id)?.totalCents || 0), 0);

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <p className="eyebrow">Control de obras</p>
          <h1 className="home-title">Mis obras</h1>
          <SyncBadge />
        </div>
        <button className="icon-btn" onClick={() => navigate('/buscar')} aria-label="Buscar"><Icon name="search" /></button>
      </header>

      <button className="cta" onClick={() => startTodayReport()}>
        <Icon name="plus" size={26} stroke={2.5} />
        <span>Añadir parte de hoy</span>
      </button>

      {active.length > 0 && (
        <p className="home-kpi">
          <span className="num">{active.length}</span> {active.length === 1 ? 'obra en curso' : 'obras en curso'} · <span className="num">{eurosRound(spentActive)}</span> invertidos
        </p>
      )}

      {examples && (
        <div className="notice">
          <p><strong>Estás viendo datos de ejemplo.</strong> Pruébalo todo con libertad; cuando quieras empezar con tus obras, bórralos.</p>
          <ConfirmButton className="btn btn-small" label="Borrar ejemplos" confirmLabel="Pulsa otra vez para borrar"
            onConfirm={async () => { await clearExamples(); toast('Datos de ejemplo borrados'); }} />
        </div>
      )}

      {projects.length > 0 && (
        <div className="seg" role="tablist" aria-label="Filtrar obras">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'on' : ''} onClick={() => setF(f.key)}>{f.label}</button>
          ))}
        </div>
      )}

      {projects.length === 0 ? (
        <Empty icon="home" title="Todavía no hay obras">
          <p>Crea tu primera obra para empezar a registrar partes diarios.</p>
          <button className="btn btn-primary" onClick={() => navigate('/obra/nueva')}>Crear obra</button>
        </Empty>
      ) : (
        <div className="cards">
          {visible.map((p) => {
            const t = totals.get(p.id);
            const spent = t?.totalCents || 0;
            const s = budgetStatus(p.budget_cents, spent);
            const client = p.client_id ? clients.get(p.client_id)?.name : '';
            return (
              <button key={p.id} className={`card obra-card h-${s.health}`} onClick={() => navigate(`/obra/${p.id}`)}>
                <div className="obra-card-head">
                  <div className="obra-card-name">
                    <h2>{p.name}</h2>
                    <p className="muted">{client || 'Sin cliente'}{t?.lastDate ? ` · último parte ${fmtDate(t.lastDate)}` : ''}</p>
                  </div>
                  <StatusPill status={p.status} />
                </div>
                <dl className="figs">
                  <div><dt>Presupuesto</dt><dd className="num">{s.budgetCents ? eurosRound(s.budgetCents) : '—'}</dd></div>
                  <div><dt>Gastado</dt><dd className="num">{eurosRound(spent)}</dd></div>
                  <div><dt>Restante</dt><dd className={`num${s.remainingCents != null && s.remainingCents < 0 ? ' neg' : ''}`}>{s.remainingCents != null ? eurosRound(s.remainingCents) : '—'}</dd></div>
                </dl>
                {s.consumed != null && spent > 0 && (
                  <div className="obra-card-meter">
                    <BudgetMeter s={s} compact />
                    <div className="obra-card-foot">
                      <HealthPill s={s} />
                      <span className={`pct num health-text-${s.health}`}>{pct(s.consumed)} consumido</span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
          {visible.length === 0 && <p className="muted center">No hay obras con este filtro.</p>}
          <button className="btn btn-ghost add-obra" onClick={() => navigate('/obra/nueva')}><Icon name="plus" size={18} /> Nueva obra</button>
        </div>
      )}
    </div>
  );
}
