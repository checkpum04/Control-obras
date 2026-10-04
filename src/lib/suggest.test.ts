import { it, expect } from 'vitest';
import { rank, frequent } from './suggest';

const mats = [
  { name: 'Placa aislamiento', use_count: 1 },
  { name: 'Pladur hidrófugo', use_count: 2 },
  { name: 'Pladur 13 mm', use_count: 9 },
  { name: 'Cemento 25 kg', use_count: 20 },
  { name: 'Tornillo placa', use_count: 30 },
];

it('"pla" sugiere Pladur 13 mm, Pladur hidrófugo, Placa aislamiento', () => {
  expect(rank(mats, 'pla').map((m) => m.name)).toEqual(['Pladur 13 mm', 'Pladur hidrófugo', 'Placa aislamiento', 'Tornillo placa']);
});
it('"cem" sugiere Cemento 25 kg', () => {
  expect(rank(mats, 'cem')[0].name).toBe('Cemento 25 kg');
});
it('frecuentes excluye los ya añadidos', () => {
  expect(frequent(mats, new Set(['tornillo placa']), 2).map((m) => m.name)).toEqual(['Cemento 25 kg', 'Pladur 13 mm']);
});
