-- Esquema Postgres / Supabase para la app de control de obras.
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo este archivo → Run.
-- Importes en céntimos (bigint). Todas las tablas tienen borrado lógico (deleted_at).
-- owner_id permite activar Row Level Security cuando haya login.

create extension if not exists "pgcrypto";

create type project_status as enum ('pendiente', 'en_curso', 'terminada');
create type attachment_kind as enum ('foto', 'documento', 'ticket');

create table clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  phone text, email text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  client_id uuid references clients(id),
  address text,
  start_date date,
  end_date date,
  status project_status not null default 'en_curso',
  budget_cents bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  default_rate_cents bigint not null default 0,
  phone text,
  active boolean not null default true,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  default_unit text not null default 'ud',
  last_price_cents bigint not null default 0,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table expense_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  category text not null default 'Otros',
  last_amount_cents bigint,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  project_id uuid not null references projects(id),
  date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- Un parte por obra y día (solo entre los no borrados)
create unique index daily_reports_project_date on daily_reports(project_id, date) where deleted_at is null;

-- Las líneas guardan una COPIA del nombre y del precio: cambiar el catálogo no altera el histórico.
create table labor_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  report_id uuid not null references daily_reports(id),
  project_id uuid not null references projects(id),
  worker_id uuid, -- referencia informativa al catálogo; el nombre y precio van copiados en la línea
  worker_name text not null,
  hours numeric(6,2) not null,
  rate_cents bigint not null,
  cost_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table material_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  report_id uuid not null references daily_reports(id),
  project_id uuid not null references projects(id),
  material_id uuid,
  material_name text not null,
  unit text not null,
  quantity numeric(12,3) not null,
  unit_price_cents bigint not null,
  cost_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  project_id uuid not null references projects(id),
  report_id uuid references daily_reports(id),
  date date not null,
  category text not null default 'Otros',
  concept text not null,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  project_id uuid not null references projects(id),
  expense_id uuid references expenses(id),
  kind attachment_kind not null default 'foto',
  name text not null,
  mime text,
  size_bytes bigint,
  storage_path text, -- ruta en Supabase Storage (bucket 'adjuntos')
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index on labor_entries(project_id);
create index on material_entries(project_id);
create index on expenses(project_id, date);
create index on attachments(project_id);
-- La app pide "lo cambiado desde la última vez" por updated_at
create index on clients(owner_id, updated_at);
create index on projects(owner_id, updated_at);
create index on workers(owner_id, updated_at);
create index on materials(owner_id, updated_at);
create index on expense_concepts(owner_id, updated_at);
create index on daily_reports(owner_id, updated_at);
create index on labor_entries(owner_id, updated_at);
create index on material_entries(owner_id, updated_at);
create index on expenses(owner_id, updated_at);
create index on attachments(owner_id, updated_at);

-- Totales por obra (lo que muestra el dashboard)
create view project_totals as
select p.id as project_id,
  coalesce((select sum(hours) from labor_entries l where l.project_id = p.id and l.deleted_at is null), 0) as hours,
  coalesce((select sum(cost_cents) from labor_entries l where l.project_id = p.id and l.deleted_at is null), 0) as labor_cents,
  coalesce((select sum(cost_cents) from material_entries m where m.project_id = p.id and m.deleted_at is null), 0) as materials_cents,
  coalesce((select sum(amount_cents) from expenses e where e.project_id = p.id and e.deleted_at is null), 0) as expenses_cents
from projects p where p.deleted_at is null;

-- Seguridad: cada usuario solo ve sus datos
do $$
declare t text;
begin
  foreach t in array array['clients','projects','workers','materials','expense_concepts','daily_reports','labor_entries','material_entries','expenses','attachments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "propietario" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Fotos, tickets y documentos: bucket privado, cada usuario solo su carpeta (<id de usuario>/...)
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false) on conflict (id) do nothing;
create policy "adjuntos propios" on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Partidas: en una instalación nueva, ejecuta también docs/migrations/001-partidas.sql
