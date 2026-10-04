// Formatos en español: euros, fechas DD/MM/AAAA y búsqueda sin acentos.

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' as any });
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' as any });
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, useGrouping: 'always' as any });

/** 123456 céntimos → "1.234,56 €" */
export const euros = (cents: number) => eur.format((cents || 0) / 100);
/** Sin decimales, para tarjetas y cifras grandes: "1.235 €" */
export const eurosRound = (cents: number) => eur0.format(Math.round((cents || 0) / 100));
export const number = (n: number) => num.format(n || 0);
export const hours = (h: number) => `${num.format(h || 0)} h`;
export const pct = (p: number | null) => (p == null ? '—' : `${Math.round(p * 100)} %`);

/** "2026-10-04" → "04/10/2026" */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DAYS[new Date(y, m - 1, d).getDay()];
}

/** Fecha local de hoy en ISO (no UTC, para que a las 23:30 siga siendo hoy). */
export function todayISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

/** "6,50" / "6.5" / "1.234,50" → 650 céntimos. Vacío → null. */
export function parseMoney(input: string): number | null {
  const n = parseDecimal(input);
  return n == null ? null : Math.round(n * 100);
}

/** Acepta coma o punto decimal. "1.234,5" → 1234.5, "8,5" → 8.5 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return isFinite(input) ? input : null;
  let s = input.trim().replace(/\s|€/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Céntimos → texto editable "6,50" */
export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : ((cents / 100).toFixed(2)).replace('.', ',').replace(/,00$/, '');
export const numToInput = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Minúsculas y sin acentos, para buscar "pladur" escribiendo "PLÁ". */
export const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
