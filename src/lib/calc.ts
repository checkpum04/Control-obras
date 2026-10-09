// Cálculos económicos. Funciones puras: todo en céntimos enteros.

export interface Totals {
  hours: number;
  laborCents: number;
  materialsCents: number;
  expensesCents: number;
  totalCents: number;
}

export type Health = 'ok' | 'warn' | 'danger' | 'none';

/** Umbrales del semáforo sobre el % de presupuesto consumido. */
export const WARN_AT = 0.75;
export const DANGER_AT = 0.9;

export const lineCost = (qty: number, unitCents: number) => Math.round((qty || 0) * (unitCents || 0));

export function sumTotals(
  labor: { hours: number; cost_cents: number }[],
  materials: { cost_cents: number }[],
  expenses: { amount_cents: number }[],
): Totals {
  const hours = round2(labor.reduce((a, l) => a + (l.hours || 0), 0));
  const laborCents = labor.reduce((a, l) => a + (l.cost_cents || 0), 0);
  const materialsCents = materials.reduce((a, m) => a + (m.cost_cents || 0), 0);
  const expensesCents = expenses.reduce((a, e) => a + (e.amount_cents || 0), 0);
  return { hours, laborCents, materialsCents, expensesCents, totalCents: laborCents + materialsCents + expensesCents };
}

export interface BudgetStatus {
  budgetCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  /** 0.6 = 60 %. null si no hay presupuesto. */
  consumed: number | null;
  /** Beneficio estimado actual = presupuesto − coste */
  profitCents: number | null;
  health: Health;
}

export function budgetStatus(budgetCents: number | null | undefined, spentCents: number): BudgetStatus {
  if (!budgetCents || budgetCents <= 0) {
    return { budgetCents: null, spentCents, remainingCents: null, consumed: null, profitCents: null, health: 'none' };
  }
  const consumed = spentCents / budgetCents;
  const health: Health = consumed >= DANGER_AT ? 'danger' : consumed >= WARN_AT ? 'warn' : 'ok';
  const remaining = budgetCents - spentCents;
  return { budgetCents, spentCents, remainingCents: remaining, consumed, profitCents: remaining, health };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

type Keyed = { partida_id?: string | null };

/**
 * Totales por partida. Las líneas sin partida (o de una partida que ya no existe) van a la clave ''.
 * Una misma línea nunca cuenta en dos partidas, así que la suma de todas es el total de la obra.
 */
export function totalsByPartida(
  labor: ({ hours: number; cost_cents: number } & Keyed)[],
  materials: ({ cost_cents: number } & Keyed)[],
  expenses: ({ amount_cents: number } & Keyed)[],
  known?: Set<string>,
): Map<string, Totals> {
  const key = (r: Keyed) => (r.partida_id && (!known || known.has(r.partida_id)) ? r.partida_id : '');
  const L = new Map<string, typeof labor>(), M = new Map<string, typeof materials>(), E = new Map<string, typeof expenses>();
  const push = <T,>(m: Map<string, T[]>, k: string, r: T) => { const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); };
  for (const r of labor) push(L, key(r), r);
  for (const r of materials) push(M, key(r), r);
  for (const r of expenses) push(E, key(r), r);
  const out = new Map<string, Totals>();
  for (const k of new Set([...L.keys(), ...M.keys(), ...E.keys()])) out.set(k, sumTotals(L.get(k) || [], M.get(k) || [], E.get(k) || []));
  return out;
}

/** Coste real por unidad ejecutada (3.000 € / 100 m² = 30 €/m²). null si no hay cantidad. */
export function unitCost(totalCents: number, quantity: number | null | undefined): number | null {
  return quantity && quantity > 0 ? Math.round(totalCents / quantity) : null;
}

export const EMPTY_TOTALS: Totals = { hours: 0, laborCents: 0, materialsCents: 0, expensesCents: 0, totalCents: 0 };
