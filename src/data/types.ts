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

export interface DailyReport extends Row { project_id: string; date: string; notes?: string }

/** Las líneas guardan su propia copia de nombre y precio: el histórico no cambia nunca. */
export interface LaborEntry extends Row {
  report_id: string; project_id: string; worker_id?: string | null;
  worker_name: string; hours: number; rate_cents: number; cost_cents: number;
}

export interface MaterialEntry extends Row {
  report_id: string; project_id: string; material_id?: string | null;
  material_name: string; unit: string; quantity: number; unit_price_cents: number; cost_cents: number;
}

export interface Expense extends Row {
  project_id: string; report_id?: string | null; date: string;
  category: string; concept: string; amount_cents: number; note?: string;
}

export interface Attachment extends Row {
  project_id: string; expense_id?: string | null; kind: AttachmentKind;
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
