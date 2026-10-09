// Modelo de datos. Coincide con schema.sql (Postgres/Supabase) para poder migrar sin cambiar pantallas.

export type ProjectStatus = 'pendiente' | 'en_curso' | 'terminada';
export type AttachmentKind = 'foto' | 'documento' | 'ticket';

interface Row {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  /** Datos de ejemplo cargados al primer arranque (nunca se suben a la nube) */
  example?: boolean;
  /** Sincronización: 1 = cambio local pendiente de subir; 0 = igual que en la nube */
  _dirty?: 0 | 1;
  /** Marca de versión local: cambia en cada escritura para no perder ediciones durante una subida */
  _v?: string;
}

export interface Client extends Row { name: string; phone?: string; email?: string; notes?: string }

export interface Project extends Row {
  name: string;
  client_id?: string | null;
  address?: string;
  start_date?: string | null;
  end_date?: string | null;
  status: ProjectStatus;
  budget_cents?: number | null;
  notes?: string;
}

export interface Worker extends Row {
  name: string;
  default_rate_cents: number;
  phone?: string;
  active: boolean;
  use_count: number;
  last_used_at?: string | null;
}

export interface Material extends Row {
  name: string;
  default_unit: string;
  last_price_cents: number;
  use_count: number;
  last_used_at?: string | null;
}

export interface ExpenseConcept extends Row {
  name: string;
  category: string;
  last_amount_cents?: number | null;
  use_count: number;
  last_used_at?: string | null;
}

/**
 * Partida: trabajo concreto dentro de una obra (Pladur, Pintura…). Las líneas de los partes
 * apuntan a ella con partida_id; si no tienen, cuentan como «Sin partida».
 */
export interface Partida extends Row {
  project_id: string;
  name: string;
  description?: string;
  budget_cents?: number | null;
  status: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string;
  /** Cantidad ejecutada (120 m², 7 ud…) para sacar el coste real por unidad */
  quantity?: number | null;
  unit?: string | null;
  sort_order: number;
  archived?: boolean;
}

/** Plantilla de partidas («Reforma integral vivienda»): solo nombres y unidades. */
export interface PartidaTemplate extends Row {
  name: string;
  items: { name: string; unit?: string | null }[];
  use_count: number;
}

export interface DailyReport extends Row { project_id: string; date: string; notes?: string }

/** Las líneas guardan su propia copia de nombre y precio: el histórico no cambia nunca. */
export interface LaborEntry extends Row {
  report_id: string; project_id: string; partida_id?: string | null; worker_id?: string | null;
  worker_name: string; hours: number; rate_cents: number; cost_cents: number;
}

export interface MaterialEntry extends Row {
  report_id: string; project_id: string; partida_id?: string | null; material_id?: string | null;
  material_name: string; unit: string; quantity: number; unit_price_cents: number; cost_cents: number;
}

export interface Expense extends Row {
  project_id: string; report_id?: string | null; partida_id?: string | null; date: string;
  category: string; concept: string; amount_cents: number; note?: string;
}

export interface Attachment extends Row {
  project_id: string; expense_id?: string | null; partida_id?: string | null; kind: AttachmentKind;
  name: string; mime: string; size: number;
  /** Contenido del archivo. Puede faltar si está en la nube y aún no se ha descargado a este móvil. */
  blob?: Blob;
  /** Ruta en Supabase Storage una vez subido */
  storage_path?: string | null;
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  terminada: 'Terminada',
};

export const UNITS = ['ud', 'm', 'm²', 'm³', 'kg', 'l', 'saco', 'caja', 'palé', 'rollo', 'bote', 'h'];
export const UNIT_LABEL: Record<string, string> = {
  ud: 'unidades', m: 'metros', 'm²': 'metros cuadrados', 'm³': 'metros cúbicos', kg: 'kilos', l: 'litros',
  saco: 'sacos', caja: 'cajas', 'palé': 'palés', rollo: 'rollos', bote: 'botes', h: 'horas',
};

export const EXPENSE_CATEGORIES = [
  'Alquiler de maquinaria', 'Transporte', 'Gasolina', 'Contenedores', 'Permisos',
  'Subcontratistas', 'Herramientas', 'Dietas', 'Otros',
];

/** Partidas que se ofrecen cuando aún no se ha usado ninguna, con su unidad de producción típica. */
export const SUGGESTED_PARTIDAS: { name: string; unit?: string }[] = [
  { name: 'Demolición' }, { name: 'Albañilería' }, { name: 'Fontanería' }, { name: 'Electricidad' },
  { name: 'Climatización' }, { name: 'Pladur', unit: 'm²' }, { name: 'Pintura', unit: 'm²' }, { name: 'Alicatado', unit: 'm²' },
  { name: 'Solado', unit: 'm²' }, { name: 'Carpintería', unit: 'ud' }, { name: 'Limpieza' }, { name: 'Otros' },
];

/** Plantilla incluida de serie. */
export const BUILTIN_TEMPLATE = {
  name: 'Reforma integral vivienda',
  items: SUGGESTED_PARTIDAS.filter((p) => p.name !== 'Otros'),
};

export const NO_PARTIDA = 'Sin partida';
