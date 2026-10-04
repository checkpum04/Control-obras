import { describe, it, expect } from 'vitest';
import { budgetStatus, lineCost, sumTotals } from './calc';
import { euros, fmtDate, parseDecimal, parseMoney, norm, addDays } from './format';

describe('cálculos', () => {
  it('horas × precio/hora', () => {
    expect(lineCost(8, 1800)).toBe(14400); // 8 h × 18 € = 144 €
    expect(lineCost(7.5, 1850)).toBe(13875);
  });
  it('cantidad × precio unitario redondea al céntimo', () => {
    expect(lineCost(3, 650)).toBe(1950);
    expect(lineCost(2.333, 100)).toBe(233);
  });
  it('total obra = mano de obra + materiales + gastos', () => {
    const t = sumTotals(
      [{ hours: 8, cost_cents: 14400 }, { hours: 8, cost_cents: 12000 }],
      [{ cost_cents: 54000 }],
      [{ amount_cents: 6000 }],
    );
    expect(t).toEqual({ hours: 16, laborCents: 26400, materialsCents: 54000, expensesCents: 6000, totalCents: 86400 });
  });
  it('ejemplo del enunciado: 30.000 € presupuesto, 18.000 € gastado', () => {
    const s = budgetStatus(3_000_000, 1_800_000);
    expect(s.remainingCents).toBe(1_200_000);
    expect(s.consumed).toBeCloseTo(0.6);
    expect(s.health).toBe('ok');
  });
  it('semáforo', () => {
    expect(budgetStatus(100000, 74000).health).toBe('ok');
    expect(budgetStatus(100000, 75000).health).toBe('warn');
    expect(budgetStatus(100000, 90000).health).toBe('danger');
    expect(budgetStatus(100000, 120000).remainingCents).toBe(-20000);
    expect(budgetStatus(null, 5000).health).toBe('none');
  });
});

describe('formatos', () => {
  it('euros y fechas en español', () => {
    expect(euros(2135000).replace(/ /g, ' ')).toBe('21.350,00 €');
    expect(fmtDate('2026-10-12')).toBe('12/10/2026');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('acepta coma o punto', () => {
    expect(parseMoney('6,50')).toBe(650);
    expect(parseMoney('6.5')).toBe(650);
    expect(parseMoney('1.234,50')).toBe(123450);
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseDecimal('8,5')).toBe(8.5);
    expect(parseMoney('')).toBeNull();
  });
  it('busca sin acentos', () => {
    expect(norm('Pladur Hidrófugo').startsWith(norm('PLA'))).toBe(true);
  });
});
