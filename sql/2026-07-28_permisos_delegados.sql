-- ============================================================================
-- Permisos delegados — CAPA 1 (backend: tabla + función + RLS + trigger)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-28
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin duplicar datos ni romper nada.
--
-- Solo backend (Capa 1 de la spec spec-permisos-delegados-2026-07-28.md). NO
-- toca pantallas ni frontend — eso va en PRs aparte (Capa 2 y Capa 3).
--
-- TIPOS: docentes.id = uuid (mismo patrón que sql/2026-07-28_docente_modulos.sql,
-- que ya sigue esta tabla en la mayoría de sus decisiones de diseño).
--
-- SIN MIGRACIÓN MASIVA: nadie tiene permisos al arrancar, y eso es correcto —
-- el admin los otorga desde la Capa 2. Un docente normal y el admin deben
-- seguir funcionando exactamente igual que antes de correr este script.
--
-- ⚠️ NOTA SOBRE `marcas`, `periodos` y `configuracion`: su RLS se creó
-- directo en el dashboard de Supabase, antes de que este repo empezara a
-- versionar SQL — no hay un archivo aquí con el texto exacto de sus
-- políticas actuales. Para no arriesgar un DROP POLICY con un nombre
-- adivinado (que podría no coincidir y dejar sin reemplazar la política
-- vieja), en esas tres tablas se AÑADE una política nueva y separada en vez
-- de reemplazar la existente. Postgres combina políticas permisivas del
-- mismo comando con OR, así que una política nueva solo puede AMPLIAR
-- acceso, nunca restringir lo que ya funciona hoy. Para `incapacidades`,
-- `notas`, `parametros` y `subparametro_plantilla` sí existe el archivo
-- fuente (sql/2026-07-25_*.sql), así que ahí se edita la política real.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. permisos_usuario — mismo patrón que docente_modulos
-- ----------------------------------------------------------------------------
create table if not exists public.permisos_usuario (
  id          bigint generated always as identity primary key,
  docente_id  uuid not null references public.docentes(id) on delete cascade,
  permiso     text not null,             -- slug del catálogo (ver spec §3)
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (docente_id, permiso)
);
-- Sin fila para (usuario, permiso) → sin ese permiso. Es el estado por
-- defecto, así nadie amanece con permisos que no se le otorgaron a mano.

-- ----------------------------------------------------------------------------
-- 2. tiene_permiso(p_permiso) — gemela de tiene_modulo()
-- ----------------------------------------------------------------------------
create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
security definer
stable
as $$
  select is_admin() or coalesce(
    (select activo from public.permisos_usuario
      where docente_id = current_docente_id() and permiso = p_permiso),
    false
  );
$$;
-- El admin siempre tiene todos los permisos (is_admin() dentro de la
-- función), sin importar lo que haya o no en permisos_usuario.

-- ----------------------------------------------------------------------------
-- 3. RLS de permisos_usuario: cada usuario lee sus propias filas (y el admin
--    lee todas, lo necesita la pantalla de Capa 2); SOLO admin escribe.
--    Crítico: un delegado no puede otorgarse permisos a sí mismo ni a otros.
-- ----------------------------------------------------------------------------
alter table public.permisos_usuario enable row level security;

drop policy if exists "leer permisos_usuario" on public.permisos_usuario;
create policy "leer permisos_usuario" on public.permisos_usuario
  for select to authenticated
  using (is_admin() or docente_id = current_docente_id());

drop policy if exists "admin permisos_usuario" on public.permisos_usuario;
create policy "admin permisos_usuario" on public.permisos_usuario
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ----------------------------------------------------------------------------
-- 4. docentes.cargo — etiqueta descriptiva, sin ningún efecto en RLS.
-- ----------------------------------------------------------------------------
alter table public.docentes
  add column if not exists cargo text;

-- ----------------------------------------------------------------------------
-- 5. Cambios de RLS (spec §5) — se AÑADE la alternativa, no se reescribe
--    la lógica existente de cada tabla.
-- ----------------------------------------------------------------------------

-- incapacidades: escritura. Política real conocida (sql/2026-07-25_incapacidades.sql).
drop policy if exists "admin gestiona incapacidades" on public.incapacidades;
create policy "admin gestiona incapacidades" on public.incapacidades
  for all to authenticated
  using (is_admin() or tiene_permiso('gestionar_incapacidades'))
  with check (is_admin() or tiene_permiso('gestionar_incapacidades'));
-- La lectura ("leer incapacidades", using(true) para cualquier autenticado)
-- no se toca: ya era abierta y sigue igual.

-- marcas: SOLO lectura ampliada. Política base desconocida (no está en
-- sql/) → se añade una política de SELECT nueva y separada, sin tocar
-- insert/update/delete (un delegado con solo este permiso no debe poder
-- marcar dificultades fuera de sus propias asignaciones).
drop policy if exists "leer marcas por permiso delegado" on public.marcas;
create policy "leer marcas por permiso delegado" on public.marcas
  for select to authenticated
  using (tiene_permiso('ver_informes_dificultades'));

-- notas: SOLO lectura ampliada. Política real conocida
-- (sql/2026-07-25_calificaciones-capa3.sql, luego ajustada por
-- sql/2026-07-28_docente_modulos.sql para exigir tiene_modulo). Se preserva
-- esa condición para el camino del docente dueño de la asignación, y se
-- agrega el camino del delegado con permiso de informes (no depende del
-- módulo de calificaciones: un delegado no necesariamente dicta clase).
-- "docente escribe notas" NO se toca — ver advertencia de la spec §5.
drop policy if exists "leer notas" on public.notas;
create policy "leer notas" on public.notas
  for select to authenticated
  using (
    tiene_permiso('ver_informes_notas')
    or (
      tiene_modulo('calificaciones') and (
        is_admin() or exists (
          select 1 from public.asignaciones a
          where a.id = notas.asignacion_id and a.docente_id = current_docente_id()
        )
      )
    )
  );

-- periodos: escritura ampliada. Política base desconocida (no está en
-- sql/) → se añade una política "for all" nueva y separada. La lectura de
-- periodos ya es abierta a cualquier autenticado en la práctica (el
-- selector de periodo lo usan todos los docentes), así que esta política
-- adicional no le resta nada a nadie; solo amplía quién puede escribir.
drop policy if exists "delegado escribe periodos" on public.periodos;
create policy "delegado escribe periodos" on public.periodos
  for all to authenticated
  using (is_admin() or tiene_permiso('gestionar_periodos'))
  with check (is_admin() or tiene_permiso('gestionar_periodos'));

-- parametros / subparametro_plantilla: escritura. Políticas reales
-- conocidas (sql/2026-07-25_calificaciones-capa1.sql).
drop policy if exists "admin parametros" on public.parametros;
create policy "admin parametros" on public.parametros
  for all to authenticated
  using (is_admin() or tiene_permiso('configurar_calificaciones'))
  with check (is_admin() or tiene_permiso('configurar_calificaciones'));

drop policy if exists "admin plantilla" on public.subparametro_plantilla;
create policy "admin plantilla" on public.subparametro_plantilla
  for all to authenticated
  using (is_admin() or tiene_permiso('configurar_calificaciones'))
  with check (is_admin() or tiene_permiso('configurar_calificaciones'));

-- configuracion: escritura ampliada (dos permisos distintos abren la fila
-- completa — ver la limitación de la spec §5 y el trigger de la sección 6).
-- Política base desconocida (no está en sql/) → se añade una política
-- "for all" nueva y separada, igual que en periodos.
drop policy if exists "delegado escribe configuracion" on public.configuracion;
create policy "delegado escribe configuracion" on public.configuracion
  for all to authenticated
  using (
    is_admin()
    or tiene_permiso('configurar_institucion')
    or tiene_permiso('configurar_calificaciones')
  )
  with check (
    is_admin()
    or tiene_permiso('configurar_institucion')
    or tiene_permiso('configurar_calificaciones')
  );

-- ----------------------------------------------------------------------------
-- 6. Trigger proteger_nota_minima — RLS protege la FILA de `configuracion`,
--    este trigger protege la COLUMNA `nota_minima` puntualmente: alguien
--    con SOLO 'configurar_institucion' puede tocar nombre/logo/eslogan pero
--    no la nota mínima, aunque llame a la API directamente (no solo desde
--    la pantalla).
-- ----------------------------------------------------------------------------
create or replace function public.proteger_nota_minima()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.nota_minima is distinct from old.nota_minima
     and not (is_admin() or tiene_permiso('configurar_calificaciones')) then
    raise exception 'No tiene permiso para modificar la nota mínima';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_nota_minima on public.configuracion;
create trigger trg_proteger_nota_minima
  before update on public.configuracion
  for each row execute function public.proteger_nota_minima();

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- -- Nadie debería tener permisos todavía (sin migración masiva a propósito).
-- select count(*) from public.permisos_usuario;
--
-- -- Confirmar que `cargo` existe y nace en null para todos.
-- select id, nombre, cargo from public.docentes order by nombre;
--
-- -- Revisar el estado final de políticas en las tablas tocadas: debe verse,
-- -- por tabla, la política vieja intacta (para marcas/periodos/configuracion)
-- -- MÁS la política nueva agregada por este script.
-- select tablename, policyname, cmd
-- from pg_policies
-- where tablename in (
--   'permisos_usuario', 'incapacidades', 'marcas', 'notas',
--   'periodos', 'parametros', 'subparametro_plantilla', 'configuracion'
-- )
-- order by tablename, policyname;
--
-- -- Probar el trigger manualmente como admin (debe funcionar):
-- -- update public.configuracion set nota_minima = nota_minima;
