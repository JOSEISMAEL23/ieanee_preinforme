-- ⚠️ NO CORRER HASTA QUE EL FRONTEND (FASE 2) LLEVE DÍAS EN PRODUCCIÓN FUNCIONANDO.
-- ============================================================================
-- P2 · CAPA 0c — FASE 3 · CONTRACT
-- Retirar el puente: se van el trigger y la columna `letra`
-- 2026-08-06
-- ============================================================================
--
-- POR QUÉ LA ESPERA NO ES PEREZA
--   Esa espera ES la red de seguridad. Mientras `letra` siga existiendo, si
--   algo del frontend nuevo falla se vuelve atrás con un `git revert` y ya
--   está — sin tocar la base. En el momento en que se corra este archivo, esa
--   marcha atrás deja de ser gratis.
--
-- LA REGLA DE ESTA FASE
--   Contraer es ESTRICTO. Aquí sí se aprietan los tornillos (NOT NULL sobre
--   `nombre` y `orden`), porque ya no queda código viejo que los rompa. Lo
--   contrario de la fase 1, que era permisiva a propósito.
--
-- ANTES DE CORRER, LAS DOS COMPROBACIONES QUE NO SON SQL
--   1. Producción lleva días con el frontend de la fase 2 sin incidencias.
--   2. Buscar `letra` en todo src/. Debe dar 0 resultados — incluidos
--      `LETRAS` y `slice(-1)`. Si queda UNA sola, esta fase la rompe.
--
-- ORDEN DE EJECUCIÓN
--   1. backup.ps1
--   2. este archivo en STAGING    -> verificar
--   3. este archivo en PRODUCCIÓN -> verificar
--
-- Spec: segundo-cerebro/OUTPUTS/spec-p2-capa0-grupos-nombre-libre-2026-08-05.md §3.3
-- ============================================================================


-- 0. Antes de nada: ¿queda alguien escribiendo la forma vieja?
select count(*) from public.grupos where nombre is null or orden is null;
-- esperado: 0. Si no es 0, PARAR: hay código viejo todavía vivo.


-- ============================================================================
-- FASE 3 · CONTRACT
-- ============================================================================

begin;

drop trigger grupos_sync on public.grupos;
drop function public.grupos_sync_nombre_letra();

alter table public.grupos drop column letra;

-- Ahora sí se aprietan los tornillos: ya no hay código viejo que los rompa
alter table public.grupos alter column nombre set not null;
alter table public.grupos alter column orden  set not null;

commit;


-- NOTA: el `drop column letra` se lleva por delante, en cascada implícita, la
-- constraint grupos_grado_id_letra_key UNIQUE (grado_id, letra) que hay hoy en
-- el esquema. Es lo que se busca — ver el HALLAZGO del archivo de la fase 1
-- (2026-08-06_p2-capa0a-expand.sql): mientras ese UNIQUE viva, dos grupos del
-- mismo grado no pueden empezar por el mismo carácter. A partir de aquí, sí.


-- ============================================================================
-- VERIFICACIÓN DE LA FASE 3 — correr DESPUÉS, en la misma sesión
-- ============================================================================
--
-- select column_name, is_nullable from information_schema.columns
-- where table_schema='public' and table_name='grupos' order by ordinal_position;
-- -- esperado: id, grado_id, nombre (NO), orden (NO). `letra` ya no aparece.
--
-- select tgname from pg_trigger where tgrelid='public.grupos'::regclass and not tgisinternal;
-- -- esperado: 0 filas
--
-- -- Y la comprobación final, que no es SQL: buscar `letra` en todo src/.
-- -- Debe dar 0 resultados. Si queda una sola, esta fase la rompe.
