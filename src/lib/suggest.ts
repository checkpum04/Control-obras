import { norm } from './format';

export interface Suggestable { name: string; use_count?: number; last_used_at?: string | null }

/**
 * Ordena sugerencias: primero lo que empieza por lo escrito, luego palabras que empiezan
 * por ello, luego lo que lo contiene. A igualdad, lo más usado y lo más reciente.
 */
export function rank<T extends Suggestable>(items: T[], q: string, limit = 6): T[] {
  const n = norm(q);
  const scored = items
    .map((it) => {
      const name = norm(it.name);
      let s = 0;
      if (!n) s = 1;
      else if (name.startsWith(n)) s = 3;
      else if (name.split(/[\s\-/(]+/).some((w) => w.startsWith(n))) s = 2;
      else if (name.includes(n)) s = 1;
      return { it, s };
    })
    .filter((x) => x.s > 0);
  scored.sort((a, b) =>
    b.s - a.s ||
    (b.it.use_count || 0) - (a.it.use_count || 0) ||
    (b.it.last_used_at || '').localeCompare(a.it.last_used_at || '') ||
    a.it.name.localeCompare(b.it.name, 'es'));
  return scored.slice(0, limit).map((x) => x.it);
}

/** Los más usados, para los botones de "frecuentes". */
export function frequent<T extends Suggestable>(items: T[], exclude: Set<string> = new Set(), limit = 6): T[] {
  return items
    .filter((i) => (i.use_count || 0) > 0 && !exclude.has(norm(i.name)))
    .sort((a, b) => (b.use_count || 0) - (a.use_count || 0) || (b.last_used_at || '').localeCompare(a.last_used_at || ''))
    .slice(0, limit);
}
