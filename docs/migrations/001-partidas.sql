-- Migración 001 · PARTIDAS dentro de cada obra (octubre 2026)
-- Cómo usarla: Supabase → SQL Editor → New query → pegar todo este archivo → Run.
-- Es segura: solo AÑADE tablas nuevas y columnas vacías. No borra ni cambia nada de lo que ya hay.
-- Lo apuntado antes queda sin partida («Sin partida») y sigue contando igual en la obra.
-- Se puede ejecutar más de una vez sin problema.

create table if not exists partidas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  project_id uuid not null references projects(id),
  name text not null,
  description text,
  budget_cents bigint,
  status project_status not null default 'pendiente',
  start_date date,
  end_date date,
  notes text,
  quantity numeric(12,3), -- cantidad ejecutada (120 m², 7 ud…) para el coste por unidad
  unit text,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Plantillas de partidas («Reforma integral vivienda»): lista de nombres y unidades
create table if not exists partida_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  items jsonb not null default '[]',
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Cada hora, material, gasto o foto puede ir a una partida (o a ninguna: null)
alter table labor_entries add column if not exists partida_id uuid references partidas(id);
alter table material_entries add column if not exists partida_id uuid references partidas(id);
alter table expenses add column if not exists partida_id uuid references partidas(id);
alter table attachments add column if not exists partida_id uuid references partidas(id);

create index if not exists partidas_project on partidas(project_id);
create index if not exists partidas_owner_updated on partidas(owner_id, updated_at);
create index if not exists partida_templates_owner_updated on partida_templates(owner_id, updated_at);
create index if not exists labor_entries_partida on labor_entries(partida_id);
create index if not exists material_entries_partida on material_entries(partida_id);
create index if not exists expenses_partida on expenses(partida_id);

-- Seguridad: cada usuario solo ve sus datos
do $$
declare t text;
begin
  foreach t in array array['partidas','partida_templates']
  loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'propietario') then
      execute format('create policy "propietario" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    end if;
  end loop;
end $$;

-- Coste de cada partida (para consultas desde Supabase; la app lo calcula ella misma)
create or replace view partida_totals as
select pa.id as partida_id, pa.project_id, pa.name,
  coalesce((select sum(hours) from labor_entries l where l.partida_id = pa.id and l.deleted_at is null), 0) as hours,
  coalesce((select sum(cost_cents) from labor_entries l where l.partida_id = pa.id and l.deleted_at is null), 0) as labor_cents,
  coalesce((select sum(cost_cents) from material_entries m where m.partida_id = pa.id and m.deleted_at is null), 0) as materials_cents,
  coalesce((select sum(amount_cents) from expenses e where e.partida_id = pa.id and e.deleted_at is null), 0) as expenses_cents
from partidas pa where pa.deleted_at is null;
alter view partida_totals set (security_invoker = true);

-- Que la app vea las columnas nuevas al momento
notify pgrst, 'reload schema';
