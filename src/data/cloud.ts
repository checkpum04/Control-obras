// Conexión con Supabase. Si la app se compila sin VITE_SUPABASE_URL funciona solo en local.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { SyncEngine, type SyncState } from './sync';
import type { Attachment } from './types';
import { db, SYNC_TABLES } from './db';

async function prepareForUser(uid: string) {
  const owner = (await db.meta.get('owner'))?.value;
  if (owner && owner !== uid) {
    await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.meta], async () => {
      for (const t of SYNC_TABLES) await db.table(t).clear();
      await db.meta.filter((m) => m.key.startsWith('pull:') || m.key === 'lastSync').delete();
    });
  }
  await db.meta.put({ key: 'owner', value: uid });
}

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = !!(URL_ && KEY);
export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'obras-auth' } })
  : null;

let engine: SyncEngine | null = null;
let stopEngine: (() => void) | null = null;
const engineListeners = new Set<(e: SyncEngine | null) => void>();

function setEngine(session: Session | null) {
  const uid = session?.user.id;
  if (engine && (engine as any).userId === uid) return;
  stopEngine?.();
  engine = null;
  stopEngine = null;
  if (supabase && uid) {
    const e = new SyncEngine(supabase, uid);
    engine = e;
    // Si en este móvil había datos de otra cuenta, se borran antes de sincronizar.
    prepareForUser(uid).then(() => {
      if (engine !== e) return;
      stopEngine = e.start();
      engineListeners.forEach((l) => l(engine));
    });
    return;
  }
  engineListeners.forEach((l) => l(engine));
}

/** Sesión actual (undefined mientras se comprueba). */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(cloudEnabled ? undefined : null);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setEngine(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setEngine(s); });
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(engine?.state || { kind: 'off' });
  useEffect(() => {
    let unsub = engine?.subscribe(setState);
    const l = (e: SyncEngine | null) => { unsub?.(); unsub = e?.subscribe(setState); if (!e) setState({ kind: 'off' }); };
    engineListeners.add(l);
    return () => { unsub?.(); engineListeners.delete(l); };
  }, []);
  return state;
}

export const syncNow = () => engine?.syncNow();

/** Archivo de un adjunto: el guardado en el móvil o, si no está, descargado de la nube. */
export async function attachmentBlob(a: Attachment): Promise<Blob | undefined> {
  if (a.blob) return a.blob;
  return engine?.download(a);
}

export async function signOut() {
  await engine?.syncNow();
  await supabase?.auth.signOut();
}
