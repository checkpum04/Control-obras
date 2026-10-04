import { useEffect, useState } from 'react';
import { match, navigate, query, useRoute } from './lib/router';
import { Icon, Toaster } from './components/ui';
import { startTodayReport } from './screens/PickProject';
import Home from './screens/Home';
import PickProject from './screens/PickProject';
import ProjectForm from './screens/ProjectForm';
import ProjectDetail from './screens/ProjectDetail';
import ReportEditor from './screens/ReportEditor';
import ReportView from './screens/ReportView';
import Search from './screens/Search';
import Catalog from './screens/Catalog';
import ReportPage from './screens/ReportPage';
import Settings from './screens/Settings';
import { seedOnFirstRun } from './data/seed';
import { cloudEnabled, useSession } from './data/cloud';
import Login from './screens/Login';
import { ErrorBoundary } from './components/ErrorBoundary';

function Screen({ path }: { path: string }) {
  let m;
  if (path === '/' || path === '') return <Home />;
  if (path === '/elegir-obra') return <PickProject />;
  if (path === '/obra/nueva') return <ProjectForm />;
  if ((m = match('/obra/:id/editar', path))) return <ProjectForm key={m.id} id={m.id} />;
  if ((m = match('/obra/:id', path))) return <ProjectDetail key={m.id} id={m.id} />;
  if ((m = match('/obra/:id/:tab', path))) return <ProjectDetail key={m.id} id={m.id} tab={m.tab} />;
  if ((m = match('/parte/nuevo/:pid', path))) return <ReportEditor key={path} projectId={m.pid} initialDate={query(path).get('fecha') || undefined} />;
  if ((m = match('/parte/:id/editar', path))) return <ReportEditor key={path} reportId={m.id} />;
  if ((m = match('/parte/:id', path))) return <ReportView id={m.id} />;
  if (path === '/buscar') return <Search />;
  if (path === '/catalogo') return <Catalog />;
  if ((m = match('/catalogo/:tab', path))) return <Catalog tab={m.tab} />;
  if ((m = match('/informe/:id', path))) return <ReportPage id={m.id} />;
  if (path === '/ajustes') return <Settings />;
  return <Home />;
}

const NAV = [
  { path: '/', label: 'Obras', icon: 'home', is: (p: string) => p === '/' || p.startsWith('/obra') || p.startsWith('/informe') },
  { path: '/buscar', label: 'Buscar', icon: 'search', is: (p: string) => p.startsWith('/buscar') },
  { path: '/catalogo', label: 'Catálogo', icon: 'list', is: (p: string) => p.startsWith('/catalogo') },
  { path: '/ajustes', label: 'Ajustes', icon: 'cog', is: (p: string) => p.startsWith('/ajustes') },
];

export default function App() {
  const path = useRoute();
  const session = useSession();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    seedOnFirstRun().catch(() => {}).finally(() => setReady(true));
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  if (cloudEnabled && session === undefined) return <div className="app" />;
  if (cloudEnabled && !session) return <ErrorBoundary><Login /></ErrorBoundary>;
  const editing = path.startsWith('/parte/nuevo') || path.endsWith('/editar') || path === '/obra/nueva';

  return (
    <div className={`app${editing ? ' app-editing' : ''}`}>
      <main><ErrorBoundary resetKey={path}>{ready ? <Screen path={path} /> : null}</ErrorBoundary></main>
      {!editing && (
        <nav className="bottomnav" aria-label="Navegación principal">
          {NAV.slice(0, 2).map((n) => <NavBtn key={n.path} n={n} path={path} />)}
          <button className="nav-add" onClick={() => startTodayReport()} aria-label="Añadir parte de hoy">
            <Icon name="plus" size={28} stroke={2.5} /><span>Parte</span>
          </button>
          {NAV.slice(2).map((n) => <NavBtn key={n.path} n={n} path={path} />)}
        </nav>
      )}
      <Toaster />
    </div>
  );
}

function NavBtn({ n, path }: { n: (typeof NAV)[number]; path: string }) {
  const on = n.is(path);
  return (
    <button className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => navigate(n.path)}>
      <Icon name={n.icon} size={22} /><span>{n.label}</span>
    </button>
  );
}
