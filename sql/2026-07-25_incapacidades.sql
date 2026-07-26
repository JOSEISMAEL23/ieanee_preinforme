-- ============================================================================
-- Feature 2.1 — Tabla de incapacidades + RLS
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-25
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Requiere que ya exista la función is_admin() (creada con el esquema base).
--
-- CORREGIDO 2026-07-25 (tras verificar tipos reales en el Table Editor):
-- estudiantes.id es integer (int4), NO bigint. docentes.id es uuid, NO bigint.
-- La versión original de este archivo tenía `registrado_por bigint`, lo cual
-- habría hecho fallar el CREATE TABLE (bigint y uuid son incompatibles en una FK).
-- ============================================================================

create table if not exists public.incapacidades (
  id             bigint generated always as identity primary key,
  estudiante_id  integer not null references public.estudiantes(id) on delete cascade,
  fecha_inicio   date not null,
  fecha_fin      date not null,
  motivo         text,                 -- opcional (ej. "incapacidad médica EPS")
  registrado_por uuid references public.docentes(id),
  created_at     timestamptz not null default now(),
  constraint incapacidades_rango_valido check (fecha_fin >= fecha_inicio)
);

create index if not exists idx_incapacidades_estudiante
  on public.incapacidades(estudiante_id);

create index if not exists idx_incapacidades_rango
  on public.incapacidades(fecha_inicio, fecha_fin);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.incapacidades enable row level security;

-- Cualquier usuario autenticado puede LEER: el docente necesita ver el estado
-- de incapacidad en la pantalla de llamado a lista.
drop policy if exists "leer incapacidades" on public.incapacidades;
create policy "leer incapacidades" on public.incapacidades
  for select to authenticated using (true);

-- Solo el admin puede crear / editar / borrar.
drop policy if exists "admin gestiona incapacidades" on public.incapacidades;
create policy "admin gestiona incapacidades" on public.incapacidades
  for all to authenticated using (is_admin()) with check (is_admin());

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional): debe devolver las dos políticas.
-- ----------------------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'incapacidades';
