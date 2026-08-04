-- ============================================================================
-- Año lectivo en `periodos` — libera los nombres de periodo cada año
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-08-04
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
--
-- ⚠️ ORDEN OBLIGATORIO: este script va PRIMERO en staging, luego en
-- producción, y SOLO DESPUÉS se mergea el PR del frontend. Si el código
-- llega antes que la columna, el formulario de "Crear y activar" intenta
-- insertar `anio` en una tabla que no lo tiene y la creación de periodos
-- queda rota para todos.
--
-- PROBLEMA QUE RESUELVE
-- `periodos.nombre` era UNIQUE a secas, así que "Primer Periodo" quedaba
-- quemado para siempre: al empezar el año lectivo siguiente no se podía
-- reutilizar el nombre. Con `anio` la unicidad pasa a ser (nombre, anio).
--
-- POR QUÉ NO SE USA `add column ... default` DE UNA
-- En Postgres 11+ un `add column` con default rellena TODAS las filas
-- existentes en el acto. Si se pusiera el default aquí, el backfill de más
-- abajo no encontraría ningún NULL que corregir y todos los periodos
-- viejos quedarían marcados con el año actual, incluidos los de años
-- anteriores. Por eso: columna sin default → backfill → default.
--
-- ZONA HORARIA: `now()` en Supabase corre en UTC. El 31 de diciembre
-- después de las 7 pm hora Colombia, UTC ya está en enero, así que un
-- periodo creado esa noche nacería con el año siguiente. De ahí el
-- `at time zone 'America/Bogota'`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Columna, sin default todavía (ver nota de arriba)
-- ----------------------------------------------------------------------------
alter table public.periodos add column if not exists anio integer;

-- ----------------------------------------------------------------------------
-- 2. Backfill desde created_at
--
-- `created_at` es nullable en el esquema, así que el coalesce evita que una
-- fila sin fecha deje un NULL que reventaría el `set not null` del paso 3 y
-- abortara la migración a medias.
-- ----------------------------------------------------------------------------
update public.periodos
   set anio = extract(year from coalesce(created_at, now()) at time zone 'America/Bogota')::int
 where anio is null;

-- ----------------------------------------------------------------------------
-- 3. Ya sin NULLs: obligatoria, y default para los periodos nuevos
-- ----------------------------------------------------------------------------
alter table public.periodos alter column anio set not null;

alter table public.periodos alter column anio
  set default extract(year from now() at time zone 'America/Bogota')::int;

-- ----------------------------------------------------------------------------
-- 4. La unicidad pasa de (nombre) a (nombre, anio)
-- ----------------------------------------------------------------------------
alter table public.periodos drop constraint if exists periodos_nombre_key;

alter table public.periodos
  add constraint periodos_nombre_anio_key unique (nombre, anio);

commit;

-- ----------------------------------------------------------------------------
-- 5. VERIFICACIÓN — correr después y revisar a ojo antes de dar por buena
--    la migración. Cada periodo debe mostrar el año en que se creó de
--    verdad, no todos el mismo.
-- ----------------------------------------------------------------------------
-- select id, nombre, anio, created_at, activo
--   from public.periodos
--  order by anio desc, created_at desc;
