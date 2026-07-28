-- ============================================================================
-- Control de módulos por docente — CAPA 1 (backend: tabla + función + RLS)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-28
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin duplicar datos ni romper nada.
--
-- Solo backend (Capa 1 de la spec). NO toca frontend ni pantalla admin —
-- eso va en PRs aparte (Capa 2 y Capa 3).
--
-- TIPOS: docentes.id = uuid (confirmado en sql/2026-07-25_verificar-tipos.sql,
-- reutilizado también por notas.registrado_por y asignaciones.docente_id).
--
-- ⚠️ MIGRACIÓN SIN ROMPER NADA: ya hay docentes capturando notas este periodo.
-- El INSERT de más abajo activa 'calificaciones' a TODOS los docentes
-- existentes antes de que las políticas de notas/subparametros empiecen a
-- exigir el módulo, así nadie pierde acceso a mitad de periodo. Los docentes
-- que se creen DESPUÉS de correr este script no tendrán el módulo por
-- defecto (es el comportamiento esperado: el admin lo activa caso a caso).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. docente_modulos — feature gating por docente
-- ----------------------------------------------------------------------------
create table if not exists public.docente_modulos (
  id          bigint generated always as identity primary key,
  docente_id  uuid not null references public.docentes(id) on delete cascade,
  modulo      text not null,             -- slug: 'calificaciones', y futuros
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (docente_id, modulo)
);
-- Regla de lectura: sin fila para (docente, modulo) → no tiene acceso.
-- La ausencia es el estado por defecto, así no hay que crear una fila por
-- docente para negar acceso a un módulo nuevo.

-- ----------------------------------------------------------------------------
-- 2. tiene_modulo(p_modulo) — mismo patrón que is_admin() / current_docente_id()
-- ----------------------------------------------------------------------------
create or replace function public.tiene_modulo(p_modulo text)
returns boolean
language sql
security definer
stable
as $$
  select is_admin() or coalesce(
    (select activo from public.docente_modulos
      where docente_id = current_docente_id() and modulo = p_modulo),
    false
  );
$$;
-- El admin siempre tiene acceso a todo (is_admin() dentro de la función),
-- sin importar la configuración de docente_modulos.

-- ----------------------------------------------------------------------------
-- 3. RLS de docente_modulos: cada docente lee sus propias filas (y el admin
--    lee todas, para la pantalla admin de la Capa 2); solo el admin escribe.
-- ----------------------------------------------------------------------------
alter table public.docente_modulos enable row level security;

drop policy if exists "leer docente_modulos" on public.docente_modulos;
create policy "leer docente_modulos" on public.docente_modulos
  for select to authenticated
  using (is_admin() or docente_id = current_docente_id());

drop policy if exists "admin docente_modulos" on public.docente_modulos;
create policy "admin docente_modulos" on public.docente_modulos
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------
-- 4. Migración obligatoria: activar 'calificaciones' a todos los docentes
--    existentes ANTES de que las políticas de abajo empiecen a exigirlo.
-- ----------------------------------------------------------------------------
insert into public.docente_modulos (docente_id, modulo, activo)
select id, 'calificaciones', true from public.docentes
on conflict (docente_id, modulo) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Gating real: exigir tiene_modulo('calificaciones') en notas y
--    subparametros (lectura y escritura). Ocultar el botón en el frontend NO
--    protege el módulo — la protección real va aquí, en RLS.
--
--    Se AND-ea `tiene_modulo('calificaciones')` sobre las condiciones ya
--    existentes (sql/2026-07-25_calificaciones-capa2.sql y -capa3.sql), sin
--    tocar el resto de la lógica (dueño de la asignación, ventana de tiempo).
--    Como tiene_modulo() ya resuelve a true para is_admin(), el admin no
--    pierde nada de acceso.
-- ----------------------------------------------------------------------------

-- subparametros --------------------------------------------------------------
drop policy if exists "leer subparametros" on public.subparametros;
create policy "leer subparametros" on public.subparametros
  for select to authenticated
  using (tiene_modulo('calificaciones'));

drop policy if exists "docente/admin subparametros" on public.subparametros;
create policy "docente/admin subparametros" on public.subparametros
  for all to authenticated
  using (
    tiene_modulo('calificaciones') and (
      is_admin() or exists (
        select 1 from public.asignaciones a
        where a.id = subparametros.asignacion_id and a.docente_id = current_docente_id()
      )
    )
  )
  with check (
    tiene_modulo('calificaciones') and (
      is_admin() or exists (
        select 1 from public.asignaciones a
        where a.id = subparametros.asignacion_id and a.docente_id = current_docente_id()
      )
    )
  );

-- notas ------------------------------------------------------------------
drop policy if exists "leer notas" on public.notas;
create policy "leer notas" on public.notas
  for select to authenticated
  using (
    tiene_modulo('calificaciones') and (
      is_admin() or exists (
        select 1 from public.asignaciones a
        where a.id = notas.asignacion_id and a.docente_id = current_docente_id()
      )
    )
  );

drop policy if exists "docente escribe notas" on public.notas;
create policy "docente escribe notas" on public.notas
  for all to authenticated
  using (
    tiene_modulo('calificaciones') and (
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
  )
  with check (
    tiene_modulo('calificaciones') and (
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
  );

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- -- Nadie debería perder acceso: todo docente con asignaciones de calificaciones
-- -- debe salir con activo = true acá.
-- select d.nombre, dm.modulo, dm.activo
-- from public.docentes d
-- left join public.docente_modulos dm on dm.docente_id = d.id and dm.modulo = 'calificaciones'
-- order by d.nombre;
--
-- select policyname, cmd from pg_policies where tablename in ('docente_modulos', 'notas', 'subparametros');
