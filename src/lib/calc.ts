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
