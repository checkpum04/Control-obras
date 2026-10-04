import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clearExamples, exportBackup, hasExamples, importBackup, isEmpty } from '../data/repo';
import { seedExamples } from '../data/seed';
import { todayISO } from '../lib/format';
import { ConfirmButton, Icon, TopBar, toast } from '../components/ui';
import { cloudEnabled, signOut, supabase, syncNow, useSyncState } from '../data/cloud';
import { SyncBadge } from '../components/SyncBadge';

const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();

export default function Settings() {
  const examples = useLiveQuery(hasExamples);
  const empty = useLiveQuery(isEmpty);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState('');
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setPersisted(await navigator.storage?.persisted?.() ?? null);
        const est = await navigator.storage?.estimate?.();
        if (est?.usage != null) setUsage(`${(est.usage / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB usados`);
      } catch { /* sin API de almacenamiento */ }
    })();
  }, []);

  const download = async () => {
    const json = await exportBackup(true);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `copia-obras-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      await importBackup(await file.text());
      setImportMsg('Copia restaurada.');
      toast('Copia restaurada');
    } catch (e) {
      setImportMsg(`No se pudo restaurar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <TopBar title="Ajustes" />
      {cloudEnabled && <CloudCard />}

      <section className="card stack-v">
        <h2 className="card-title">{cloudEnabled ? 'Copia de seguridad extra' : 'Tus datos'}</h2>
        {cloudEnabled
          ? <p>Además de la nube, puedes descargar una copia completa en un archivo y guardarla en Drive o en el correo.</p>
          : <p>Los datos se guardan en este dispositivo y funcionan sin conexión. Haz una copia de seguridad de vez en cuando
            (por ejemplo, cada viernes) y guárdala en Drive o envíatela por correo.</p>}
        <p className="muted small">
          {persisted === true ? 'Almacenamiento protegido: el navegador no lo borrará por falta de espacio.' : persisted === false ? 'El navegador podría liberar espacio si el móvil se llena. Instalar la app lo evita.' : ''}
          {usage && ` ${usage}.`}
        </p>
        {inFrame
          ? <p className="muted small">La copia de seguridad se descarga desde la app instalada; en esta vista previa el navegador no permite descargar archivos.</p>
          : <button className="btn btn-primary" onClick={download}><Icon name="download" size={18} /> Exportar copia de seguridad</button>}
        <label className="btn btn-ghost file-btn">
          <Icon name="upload" size={18} /> Restaurar una copia
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <p className="muted small">Restaurar sustituye todos los datos actuales por los de la copia.</p>
        {importMsg && <p role="status">{importMsg}</p>}
      </section>

      <section className="card stack-v">
        <h2 className="card-title">Datos de ejemplo</h2>
        {examples ? (
          <>
            <p>Hay obras de ejemplo cargadas para probar la app. Al borrarlas, tus datos se quedan como están.</p>
            <ConfirmButton className="btn btn-ghost danger" label="Borrar datos de ejemplo" confirmLabel="Pulsa otra vez para borrar"
              onConfirm={async () => { await clearExamples(); toast('Datos de ejemplo borrados'); }} />
          </>
        ) : empty ? (
          <button className="btn btn-ghost" onClick={async () => { await seedExamples(); toast('Ejemplos cargados'); }}>Cargar obras de ejemplo</button>
        ) : (
          <p className="muted">No hay datos de ejemplo.</p>
        )}
      </section>

      <section className="card stack-v">
        <h2 className="card-title">Instalar en el móvil</h2>
        <p><strong>iPhone (Safari):</strong> botón Compartir → «Añadir a pantalla de inicio».</p>
        <p><strong>Android (Chrome):</strong> menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».</p>
        <p className="muted small">Una vez instalada se abre a pantalla completa como cualquier otra app.</p>
      </section>

      <p className="muted small center">Control de obras · versión 0.1</p>
    </div>
  );
}

function CloudCard() {
  const st = useSyncState();
  const [email, setEmail] = useState('');
  useEffect(() => { supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email || '')); }, []);
  const last = 'lastSync' in st && st.lastSync ? new Date(st.lastSync).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <section className="card stack-v">
      <h2 className="card-title">Nube</h2>
      <SyncBadge />
      <p>Todo lo que apuntas se guarda primero en el móvil y se sube solo a la nube en cuanto hay conexión. Si cambias de móvil, entra con tu cuenta y lo recuperas todo.</p>
      {st.kind === 'error' && <p className="error">{st.message}</p>}
      {st.kind === 'blocked' && <p className="error">{st.reason}</p>}
      <p className="muted small">Cuenta: {email || '—'}{last ? ` · última copia ${last}` : ''}</p>
      <button className="btn btn-ghost" onClick={() => { syncNow(); toast('Sincronizando…'); }}><Icon name="upload" size={18} /> Sincronizar ahora</button>
      <ConfirmButton className="btn btn-ghost danger" label="Cerrar sesión" confirmLabel="Pulsa otra vez para cerrar sesión"
        onConfirm={async () => { await signOut(); }} />
    </section>
  );
}
