import { useSyncState, syncNow } from '../data/cloud';
import { navigate } from '../lib/router';
import { Icon } from './ui';

/** Indicador pequeño de si todo está guardado en la nube. */
export function SyncBadge() {
  const s = useSyncState();
  if (s.kind === 'off') return null;
  const pending = 'pending' in s ? s.pending : 0;
  const view =
    s.kind === 'syncing' ? { cls: 'sync-busy', icon: 'upload', text: 'Guardando…' }
      : s.kind === 'offline' ? { cls: 'sync-warn', icon: 'alert', text: pending ? `Sin conexión · ${pending} sin subir` : 'Sin conexión' }
        : s.kind === 'error' ? { cls: 'sync-warn', icon: 'alert', text: 'No se pudo subir · reintentando' }
          : s.kind === 'blocked' ? { cls: 'sync-warn', icon: 'alert', text: 'Nube en pausa' }
            : pending ? { cls: 'sync-busy', icon: 'upload', text: `${pending} sin subir` }
              : { cls: 'sync-ok', icon: 'check', text: 'Guardado en la nube' };
  return (
    <button className={`sync-badge ${view.cls}`} onClick={() => { syncNow(); navigate('/ajustes'); }} aria-label={`${view.text}. Ver detalles`}>
      <Icon name={view.icon} size={14} stroke={2.5} />{view.text}
    </button>
  );
}
