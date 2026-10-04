import { cloudEnabled } from './cloud';
// Obras de ejemplo para probar la app. Todo lo creado aquí queda marcado con example=true
// y se puede borrar desde Inicio o Ajustes sin tocar los datos reales.
import { db } from './db';
import { saveConcept, saveMaterial, saveProject, saveReport, saveWorker, type ExpenseLine, type MaterialLine } from './repo';
import { addDays, todayISO } from '../lib/format';

const W = {
  juan: ['Juan Pérez', 1800], pedro: ['Pedro López', 1600], miguel: ['Miguel Torres', 1500],
  antonio: ['Antonio Ruiz (fontanero)', 2200], luis: ['Luis Gómez (electricista)', 2100],
} as const;

const M: Record<string, [string, string, number]> = {
  cemento: ['Cemento 25 kg', 'saco', 650], arena: ['Arena de río', 'm³', 3200], ladrillo: ['Ladrillo hueco doble', 'ud', 38],
  pladur: ['Pladur 13 mm', 'm²', 420], hidro: ['Pladur hidrófugo', 'm²', 610], aislam: ['Placa aislamiento lana mineral', 'm²', 890],
  montante: ['Perfil montante 48 mm', 'm', 145], tornillo: ['Tornillo placa 25 mm', 'caja', 780], azulejo: ['Azulejo 30x60 blanco mate', 'm²', 1850],
  adhesivo: ['Adhesivo cementoso C2TE', 'saco', 990], pintura: ['Pintura plástica blanca 15 l', 'bote', 3400],
  multicapa: ['Tubo multicapa 20 mm', 'm', 210], cable: ['Cable 2,5 mm² 100 m', 'rollo', 4800], yeso: ['Yeso proyectable', 'saco', 720],
};

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const mat = (k: string, q: number): MaterialLine => ({ material_name: M[k][0], unit: M[k][1], quantity: q, unit_price_cents: M[k][2] });
const exp = (category: string, concept: string, amount: number, note = ''): ExpenseLine => ({ category, concept, amount_cents: amount * 100, note });
const weekdays = (from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    const d = addDays(todayISO(), i);
    const wd = new Date(d + 'T12:00').getDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
};
const labor = (keys: (keyof typeof W)[], h = 8) => keys.map((k) => ({ worker_name: W[k][0], hours: h, rate_cents: W[k][1] }));

export async function seedExamples() {
  seed = 7;
  for (const [name, rate] of Object.values(W)) await saveWorker({ name, default_rate_cents: rate });
  for (const [name, unit, price] of Object.values(M)) await saveMaterial({ name, default_unit: unit, last_price_cents: price });
  for (const [c, n, a] of [['Contenedores', 'Contenedor 6 m³', 180], ['Gasolina', 'Gasolina furgoneta', 60], ['Dietas', 'Comida cuadrilla', 45]] as const) {
    await saveConcept({ name: n, category: c, last_amount_cents: a * 100 });
  }

  // 1 · Reforma integral en curso, gasto normal
  const casa = await saveProject({
    name: 'Reforma casa Martínez', client_name: 'Familia Martínez', address: 'C/ Mayor 14, 2.º B, Alcalá de Henares',
    start_date: addDays(todayISO(), -33), status: 'en_curso', budget_cents: 4_500_000,
    notes: 'Llaves en el bar de abajo. Vecina del 2.º A pide no empezar antes de las 8:30.',
  });
  const casaDays = weekdays(-33, -1);
  for (const [i, d] of casaDays.entries()) {
    const phase = i / casaDays.length;
    const crew: (keyof typeof W)[] = phase > 0.55 && phase < 0.7 ? ['juan', 'pedro', 'miguel', 'luis'] : ['juan', 'pedro', 'miguel'];
    const L = labor(crew).map((l) => ({ ...l, hours: rnd() < 0.15 ? 6 : 8 }));
    const mats: MaterialLine[] =
      phase < 0.3 ? [mat('cemento', 4 + Math.round(rnd() * 6)), mat('arena', 1), mat('ladrillo', 120 + Math.round(rnd() * 200))]
        : phase < 0.6 ? [mat('pladur', 18 + Math.round(rnd() * 20)), mat('montante', 40 + Math.round(rnd() * 30)), mat('tornillo', 2), mat('aislam', 10 + Math.round(rnd() * 15))]
          : [mat('yeso', 6 + Math.round(rnd() * 6)), mat('pintura', 1 + Math.round(rnd() * 2)), mat('cemento', 2)];
    const E: ExpenseLine[] = [];
    if (i % 6 === 0) E.push(exp('Contenedores', 'Contenedor 6 m³', 180));
    if (i % 4 === 1) E.push(exp('Gasolina', 'Gasolina furgoneta', 55 + Math.round(rnd() * 15)));
    if (i === 3) E.push(exp('Alquiler de maquinaria', 'Alquiler andamio 2 semanas', 450, 'Andamios Henares'));
    if (i === Math.floor(casaDays.length * 0.6)) E.push(exp('Subcontratistas', 'Instalación eléctrica (mano de obra)', 2400, 'Factura 2026-118'));
    await saveReport({ project_id: casa, date: d, labor: L, materials: mats.filter((m) => m.quantity > 0), expenses: E,
      notes: i === 0 ? 'Demolición de tabiques de cocina y baño.' : '' });
  }

  // 2 · Baño y cocina, cerca del límite
  const olivo = await saveProject({
    name: 'Baño y cocina Olivo 12', client_name: 'Laura Sánchez', address: 'Av. del Olivo 12, 4.º, Torrejón de Ardoz',
    start_date: addDays(todayISO(), -19), status: 'en_curso', budget_cents: 1_200_000,
  });
  for (const [i, d] of weekdays(-19, -1).entries()) {
    const mats = i < 4 ? [mat('multicapa', 10 + Math.round(rnd() * 10)), mat('cemento', 3)]
      : [mat('azulejo', 6 + Math.round(rnd() * 6)), mat('adhesivo', 3 + Math.round(rnd() * 2)), mat('hidro', 4)];
    const E: ExpenseLine[] = [];
    if (i === 0) E.push(exp('Contenedores', 'Contenedor 6 m³', 180));
    if (i === 0) E.push(exp('Permisos', 'Licencia obra menor', 120));
    if (i === 6) E.push(exp('Transporte', 'Porte azulejos almacén', 90));
    if (i === 11) E.push(exp('Subcontratistas', 'Mampara de ducha a medida', 690));
    if (i === 9) E.push(exp('Subcontratistas', 'Encimera cuarzo (medición y montaje)', 1650));
    if (i % 3 === 2) E.push(exp('Dietas', 'Comida cuadrilla', 45));
    await saveReport({ project_id: olivo, date: d, labor: labor(['antonio', 'miguel']), materials: mats, expenses: E });
  }

  // 3 · Local terminado, al límite del presupuesto
  const ruiz = await saveProject({
    name: 'Local comercial Ruiz', client_name: 'Ruiz e Hijos SL', address: 'C/ Libreros 3, Alcalá de Henares',
    start_date: addDays(todayISO(), -72), end_date: addDays(todayISO(), -41), status: 'terminada', budget_cents: 1_800_000,
  });
  for (const [i, d] of weekdays(-72, -41).entries()) {
    const mats = [mat(pick(['pladur', 'yeso', 'cemento']), 6 + Math.round(rnd() * 10)), mat(pick(['cable', 'pintura', 'montante']), 1 + Math.round(rnd() * 3))];
    const E: ExpenseLine[] = [];
    if (i % 5 === 0) E.push(exp('Contenedores', 'Contenedor 6 m³', 180));
    if (i % 3 === 0) E.push(exp('Gasolina', 'Gasolina furgoneta', 60));
    await saveReport({ project_id: ruiz, date: d, labor: labor(['juan', 'pedro', 'luis', 'miguel']), materials: mats, expenses: E });
  }

  // 4 · Pendiente de empezar
  await saveProject({
    name: 'Tejado nave Hnos. Gil', client_name: 'Hermanos Gil SC', address: 'Polígono Los Frailes, nave 21, Daganzo',
    start_date: addDays(todayISO(), 12), status: 'pendiente', budget_cents: 2_650_000, notes: 'Sustituir chapa y canalones. Pedir grúa.',
  });

  await markAllAsExamples();
}

async function markAllAsExamples() {
  const tables = db.tables.filter((t) => t.name !== 'meta');
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.toCollection().modify({ example: true });
  });
}

/** Primer arranque: carga los ejemplos una sola vez (si luego se borran, no vuelven). */
export async function seedOnFirstRun() {
  const done = await db.meta.get('seeded');
  if (done) return;
  await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
  // En la app conectada a la nube no se cargan ejemplos: empieza limpia con tus obras.
  if (!cloudEnabled && (await db.projects.count()) === 0) await seedExamples();
}
