// Router mínimo basado en el hash (#/obra/123). Funciona en cualquier hosting estático.
import { useEffect, useState } from 'react';

let current = readHash();
/** Pasos propios en el historial: el botón atrás nunca saca al usuario fuera de la app. */
let depth = 0;
const listeners = new Set<(p: string) => void>();

function readHash() {
  try {
    const h = window.location.hash.replace(/^#/, '');
    return h.startsWith('/') ? h : '/';
  } catch {
    return '/';
  }
}

function emit() { listeners.forEach((l) => l(current)); }

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  current = path;
  try {
    if (opts.replace) history.replaceState(null, '', '#' + path);
    else { history.pushState(null, '', '#' + path); depth++; }
  } catch { /* entornos sin history: seguimos en memoria */ }
  window.scrollTo(0, 0);
  emit();
}

export function back(fallback = '/') {
  if (depth > 0) {
    try { history.back(); return; } catch { /* nada */ }
  }
  navigate(fallback, { replace: true });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); current = readHash(); emit(); });
  window.addEventListener('hashchange', () => { const h = readHash(); if (h !== current) { current = h; emit(); } });
}

export function useRoute() {
  const [path, setPath] = useState(current);
  useEffect(() => { listeners.add(setPath); return () => { listeners.delete(setPath); }; }, []);
  return path;
}

/** match('/obra/:id', '/obra/abc') → { id: 'abc' } */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/'), s = path.split('?')[0].split('/');
  if (p.length !== s.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return out;
}

export function query(path: string): URLSearchParams {
  return new URLSearchParams(path.split('?')[1] || '');
}
