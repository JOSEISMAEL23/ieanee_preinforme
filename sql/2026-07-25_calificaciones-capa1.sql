-- ============================================================================
-- Módulo de Calificaciones — CAPA 1 (configuración global del admin)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-25
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin duplicar datos.
--
-- Cubre las secciones 3.1, 3.2 y 3.5 de la spec. Las tablas `subparametros`
-- (3.3) y `notas` (3.4) NO se crean aquí: pertenecen a las capas 2 y 3.
--
-- NOTA SOBRE TIPOS: ninguna tabla de esta capa referencia a `asignaciones`,
-- `periodos`, `estudiantes` ni `docentes`, así que no depende de los tipos de
-- sus PKs. Esa verificación es necesaria antes de la Capa 2/3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 parametros — Saber / Hacer / Ser, con su % (global para todo el colegio)
-- ----------------------------------------------------------------------------
create table if not exists public.parametros (
  id         bigint generated always as identity primary key,
  nombre     text not null,                -- "Saber", "Hacer", "Ser" (editable)
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  orden      int not null,                 -- 1,2,3 para ordenar en pantalla
  created_at timestamptz not null default now()
);

-- Siembra los 3 iniciales SOLO si la tabla está vacía (no pisa ajustes previos).
insert into public.parametros (nombre, porcentaje, orden)
select v.nombre, v.porcentaje, v.orden
from (values
  ('Saber', 40::numeric, 1),
  ('Hacer', 40::numeric, 2),
  ('Ser',   20::numeric, 3)
) as v(nombre, porcentaje, orden)
where not exists (select 1 from public.parametros);

-- ----------------------------------------------------------------------------
-- 3.2 subparametro_plantilla — pesos iniciales por defecto (4 por parámetro)
-- ----------------------------------------------------------------------------
create table if not exists public.subparametro_plantilla (
  id           bigint generated always as identity primary key,
  parametro_id bigint not null references public.parametros(id) on delete cascade,
  orden        int not null,               -- 1..4
  peso         numeric(5,2) not null check (peso >= 0 and peso <= 100),
  unique (parametro_id, orden)
);

-- 4 subparámetros al 25% para cada parámetro que aún no los tenga.
insert into public.subparametro_plantilla (parametro_id, orden, peso)
select p.id, o.orden, 25
from public.parametros p
cross join (values (1), (2), (3), (4)) as o(orden)
on conflict (parametro_id, orden) do nothing;

-- ----------------------------------------------------------------------------
-- 3.5 Ajustes a tablas existentes
-- ----------------------------------------------------------------------------
-- Nota mínima para aprobar (fila única id=1 de configuracion)
alter table public.configuracion
  add column if not exists nota_minima numeric(5,2) default 70;

-- Ventana de tiempo de calificaciones, independiente de dificultades y asistencia
alter table public.periodos
  add column if not exists calificacion_fecha_inicio timestamptz;
alter table public.periodos
  add column if not exists calificacion_fecha_limite timestamptz;

-- ----------------------------------------------------------------------------
-- 3.6 RLS — config global: lee cualquier autenticado, escribe solo admin
-- ----------------------------------------------------------------------------
alter table public.parametros enable row level security;
alter table public.subparametro_plantilla enable row level security;

drop policy if exists "leer parametros" on public.parametros;
create policy "leer parametros" on public.parametros
  for select to authenticated using (true);

drop policy if exists "admin parametros" on public.parametros;
create policy "admin parametros" on public.parametros
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "leer plantilla" on public.subparametro_plantilla;
create policy "leer plantilla" on public.subparametro_plantilla
  for select to authenticated using (true);

drop policy if exists "admin plantilla" on public.subparametro_plantilla;
create policy "admin plantilla" on public.subparametro_plantilla
  for all to authenticated using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- select p.nombre, p.porcentaje, p.orden,
--        (select count(*) from public.subparametro_plantilla s where s.parametro_id = p.id) as subparametros
-- from public.parametros p order by p.orden;
