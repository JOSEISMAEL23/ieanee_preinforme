-- ============================================================================
-- Módulo de Calificaciones — CAPA 3 (captura de notas)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-25
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Requiere que las Capas 1 y 2 ya estén aplicadas (referencia a `subparametros`).
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- TIPOS: confirmados con sql/2026-07-25_verificar-tipos.sql en el Table Editor.
--   periodos.id / asignaciones.id / estudiantes.id = integer (NO bigint)
--   subparametros.id = bigint (tabla nueva de la Capa 2, sí es bigint)
--   docentes.id = uuid
-- ============================================================================

create table if not exists public.notas (
  id              bigint generated always as identity primary key,
  periodo_id      integer not null references public.periodos(id) on delete cascade,
  asignacion_id   integer not null references public.asignaciones(id) on delete cascade,
  estudiante_id   integer not null references public.estudiantes(id) on delete cascade,
  subparametro_id bigint  not null references public.subparametros(id) on delete cascade,
  valor           numeric(5,2) not null check (valor >= 30 and valor <= 100),
  descripcion     text,                  -- opcional: "Tarea 1", "Quiz células"
  registrado_por  uuid references public.docentes(id),
  created_at      timestamptz not null default now()
);
-- A propósito NO hay unique sobre (periodo, asignacion, estudiante, subparametro):
-- varias notas por esa combinación están permitidas y se promedian (promedio simple).

create index if not exists idx_notas_lookup
  on public.notas (periodo_id, asignacion_id, estudiante_id);
create index if not exists idx_notas_subparametro
  on public.notas (subparametro_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.notas enable row level security;

-- Leer: el admin ve todo; el docente solo las notas de SUS asignaciones.
drop policy if exists "leer notas" on public.notas;
create policy "leer notas" on public.notas
  for select to authenticated
  using (
    is_admin() or exists (
      select 1 from public.asignaciones a
      where a.id = notas.asignacion_id and a.docente_id = current_docente_id()
    )
  );

-- Escribir (insert/update/delete): el docente solo en SUS asignaciones y solo
-- dentro de la ventana de calificaciones del periodo (periodo activo +
-- calificacion_fecha_inicio/limite si están definidas). El admin no tiene esa
-- restricción de horario, igual que ya ocurre con `marcas` y `asistencias`.
drop policy if exists "docente escribe notas" on public.notas;
create policy "docente escribe notas" on public.notas
  for all to authenticated
  using (
    is_admin() or (
      exists (
        select 1 from public.asignaciones a
        where a.id = notas.asignacion_id and a.docente_id = current_docente_id()
      )
      and exists (
        select 1 from public.periodos p
        where p.id = notas.periodo_id
          and p.activo = true
          and (p.calificacion_fecha_inicio is null or now() >= p.calificacion_fecha_inicio)
          and (p.calificacion_fecha_limite is null or now() <= p.calificacion_fecha_limite)
      )
    )
  )
  with check (
    is_admin() or (
      exists (
        select 1 from public.asignaciones a
        where a.id = notas.asignacion_id and a.docente_id = current_docente_id()
      )
      and exists (
        select 1 from public.periodos p
        where p.id = notas.periodo_id
          and p.activo = true
          and (p.calificacion_fecha_inicio is null or now() >= p.calificacion_fecha_inicio)
          and (p.calificacion_fecha_limite is null or now() <= p.calificacion_fecha_limite)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'notas';
