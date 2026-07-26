-- ============================================================================
-- Módulo de Calificaciones — CAPA 2 (subparámetros por docente)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-25
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Requiere que la Capa 1 (sql/2026-07-25_calificaciones-capa1.sql) ya esté
-- aplicada, porque `subparametros.parametro_id` referencia `parametros`.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- TIPOS: confirmados con sql/2026-07-25_verificar-tipos.sql en el Table Editor.
--   asignaciones.id = integer (NO bigint, a diferencia del SQL de ejemplo de la spec)
--   parametros.id   = bigint  (tabla nueva de la Capa 1, sí es bigint)
-- ============================================================================

create table if not exists public.subparametros (
  id            bigint generated always as identity primary key,
  asignacion_id integer not null references public.asignaciones(id) on delete cascade,
  parametro_id  bigint  not null references public.parametros(id) on delete cascade,
  nombre        text not null,             -- lo define el docente (ej. "Tareas")
  peso          numeric(5,2) not null check (peso >= 0 and peso <= 100),
  orden         int not null,              -- 1..4
  unique (asignacion_id, parametro_id, orden)
);
-- Nota: no hay siembra aquí. Los subparámetros se instancian desde
-- `subparametro_plantilla` la primera vez que el docente abre la config de
-- una asignación (lo hace el frontend, no este script).

create index if not exists idx_subparametros_asignacion
  on public.subparametros(asignacion_id);

-- ----------------------------------------------------------------------------
-- RLS: cualquier autenticado lee; el docente gestiona los de SUS asignaciones,
-- el admin gestiona todos.
-- ----------------------------------------------------------------------------
alter table public.subparametros enable row level security;

drop policy if exists "leer subparametros" on public.subparametros;
create policy "leer subparametros" on public.subparametros
  for select to authenticated using (true);

drop policy if exists "docente/admin subparametros" on public.subparametros;
create policy "docente/admin subparametros" on public.subparametros
  for all to authenticated
  using (
    is_admin() or exists (
      select 1 from public.asignaciones a
      where a.id = subparametros.asignacion_id and a.docente_id = current_docente_id()
    )
  )
  with check (
    is_admin() or exists (
      select 1 from public.asignaciones a
      where a.id = subparametros.asignacion_id and a.docente_id = current_docente_id()
    )
  );

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- select policyname, cmd from pg_policies where tablename = 'subparametros';
