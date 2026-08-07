-- ============================================================================
-- P2 · CAPA 0a — FASE 1 · EXPAND
-- Liberar el nombre del grupo, de forma retrocompatible
-- 2026-08-06
-- ============================================================================
--
-- QUÉ HACE
--   Añade `nombre` y `orden` a `grupos`, quita el CHECK que prohíbe existir a
--   los grupos D en adelante, y monta un trigger que mantiene `letra` y
--   `nombre` sincronizadas mientras conviven.
--
-- POR QUÉ ASÍ Y NO RENOMBRANDO DE GOLPE
--   Renombrar `letra -> nombre` exige que la base y el frontend cambien en el
--   mismo instante. Son dos despliegues distintos: entre uno y otro la app
--   queda rota. Con expand/contract hay un periodo en el que las dos formas
--   conviven, y ninguna fase deja la app caída.
--
-- LA REGLA DE ESTA FASE
--   Expandir es PERMISIVO. Nada de NOT NULL todavía: el código viejo no sabe
--   rellenar `nombre` ni `orden`. Los tornillos se aprietan en la fase 3
--   (archivo 2026-08-06_p2-capa0c-contract-despues-del-frontend.sql), cuando
--   ya no queda código viejo vivo.
--
-- ORDEN DE EJECUCIÓN
--   1. backup.ps1                          <- antes de nada
--   2. este archivo en STAGING    -> verificar a..h
--   3. este archivo en PRODUCCIÓN -> verificar a..h
--   La app sigue funcionando igual. Nadie nota nada.
--
-- Spec: segundo-cerebro/OUTPUTS/spec-p2-capa0-grupos-nombre-libre-2026-08-05.md §3.1
-- ============================================================================


-- ============================================================================
-- COMPROBACIÓN PREVIA — correr ANTES del begin
-- ============================================================================
-- Si devuelve alguna fila, PARAR: hay dos grupos con la misma letra en el
-- mismo grado y el UNIQUE del paso 6 fallaría a mitad de la transacción.

select grado_id, letra, count(*)
from public.grupos
group by grado_id, letra
having count(*) > 1;
-- esperado: 0 filas


-- ============================================================================
-- FASE 1 · EXPAND
-- ============================================================================

begin;

-- 1. Fuera la ley que prohíbe existir a los grupos D en adelante.
--    Se puede hacer ya: quitar un CHECK nunca rompe al código viejo,
--    solo deja de prohibir algo que el código viejo no intentaba hacer.
alter table public.grupos drop constraint grupos_letra_check;

-- 2. Las columnas nuevas nacen NULLABLE. Obligatorio en un expand:
--    el codigo viejo hace insert sin ellas y no puede fallar.
alter table public.grupos add column nombre text;
alter table public.grupos add column orden  integer;

-- 3. Sembrar el nombre con la letra actual
update public.grupos set nombre = letra where nombre is null;

-- 4. Sembrar el orden con el alfabético actual, por grado
with num as (
  select id, row_number() over (partition by grado_id order by letra) as n
  from public.grupos
)
update public.grupos g set orden = num.n from num where num.id = g.id;

-- 5. EL PUENTE. Mientras convivan las dos formas, esto las mantiene iguales.
--    Sin el trigger: el código viejo inserta solo `letra` -> `nombre` queda NULL
--    y esa fila es invisible para el código nuevo (y al revés).
create or replace function public.grupos_sync_nombre_letra()
returns trigger language plpgsql as $$
begin
  if new.nombre is null and new.letra is not null then
    new.nombre := new.letra;                 -- escribió el código VIEJO
  elsif new.letra is null and new.nombre is not null then
    new.letra := left(new.nombre, 1);        -- escribió el código NUEVO
  end if;
  if new.orden is null then
    select coalesce(max(orden), 0) + 1 into new.orden
    from public.grupos where grado_id = new.grado_id;
  end if;
  return new;
end;
$$;

create trigger grupos_sync
  before insert or update on public.grupos
  for each row execute function public.grupos_sync_nombre_letra();

-- 6. Dos grupos del mismo grado no pueden llamarse igual.
--    Este SÍ se puede poner ya: el código viejo tampoco creaba duplicados.
alter table public.grupos
  add constraint grupos_grado_id_nombre_key unique (grado_id, nombre);

commit;


-- NOTA sobre `letra`: sigue siendo NOT NULL y así se queda hasta la fase 3.
-- El trigger garantiza que el código nuevo —que solo manda `nombre`— la
-- rellene igual. Por eso el left(new.nombre, 1): a `letra` ya no la lee nadie
-- con criterio, solo tiene que existir hasta que se borre.


-- ============================================================================
-- VERIFICACIÓN DE LA FASE 1 — correr DESPUÉS, en la misma sesión
-- ============================================================================
-- Probar los DOS lados, como en la capa 0 de RESTRICT. Los pasos d y f son el
-- corazón de esta fase: comprueban que el puente cruza en las dos direcciones.
-- Si solo se verifica d, se está probando media migración.
--
-- -- a) La estructura quedó como se espera
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema='public' and table_name='grupos'
-- order by ordinal_position;
-- -- esperado: id, grado_id, letra (NO), nombre (text, YES), orden (integer, YES)
--
-- -- b) No quedó ni rastro del CHECK
-- select conname from pg_constraint where conrelid='public.grupos'::regclass;
-- -- esperado: pkey, grado_id_fkey, grupos_grado_id_nombre_key. NADA de letra_check
-- -- OJO: sale también grupos_grado_id_letra_key, que la spec §2 no lista.
-- --      Ver el HALLAZGO al final de este archivo. No es un fallo de la migración.
--
-- -- c) Las 36 filas siguen ahí, con nombre = letra y orden 1,2,3 por grado
-- select g.nombre as grado, gr.letra, gr.nombre as grupo, gr.orden
-- from public.grupos gr join public.grados g on g.id=gr.grado_id
-- order by g.orden, gr.orden;
-- -- esperado: 36 filas, letra = nombre en todas, orden sin huecos
--
-- -- d) LA PRUEBA QUE IMPORTA: crear un grupo D, que hoy es imposible.
-- --    Se escribe como lo haría el CÓDIGO NUEVO: sin letra, sin orden.
-- insert into public.grupos (grado_id, nombre)
-- values ((select id from public.grados where nombre like '6%'), 'D');
-- -- esperado: INSERT 0 1  <- si falla con 23514, el paso 1 no se aplicó
-- --                       <- si falla con 23502, el trigger no se creó
--
-- -- e) El trigger rellenó letra y orden solo
-- select nombre, letra, orden from public.grupos
-- where nombre='D' and grado_id=(select id from public.grados where nombre like '6%');
-- -- esperado: D | D | 4
--
-- -- f) Al revés: como lo haría el CÓDIGO VIEJO, solo con letra
-- insert into public.grupos (grado_id, letra)
-- values ((select id from public.grados where nombre like '6%'), 'E');
-- select nombre, letra, orden from public.grupos where letra='E';
-- -- esperado: E | E | 5   <- el puente funciona en las dos direcciones
--
-- -- g) Y el UNIQUE muerde
-- insert into public.grupos (grado_id, nombre)
-- values ((select id from public.grados where nombre like '6%'), 'D');
-- -- esperado: error 23505
--
-- -- h) Limpiar las pruebas (funciona porque están vacíos;
-- --    RESTRICT solo bloquea si tienen estudiantes dentro)
-- delete from public.grupos
-- where nombre in ('D','E')
--   and grado_id=(select id from public.grados where nombre like '6%');


-- ============================================================================
-- ⚠️ HALLAZGO AL ESCRIBIR ESTE ARCHIVO — leer antes de la fase 2
-- ============================================================================
--
-- El bloque de arriba está copiado TAL CUAL de la spec §3.1, sin cambios.
-- Pero al contrastarlo con sql/00-esquema-completo.sql aparece una constraint
-- que la spec §2 ("estado actual verificado") NO lista:
--
--     ALTER TABLE ONLY public.grupos
--       ADD CONSTRAINT grupos_grado_id_letra_key UNIQUE (grado_id, letra);
--                                                        ^^^^^^^^^^^^^^^
--
-- Esta fase 1 NO la toca, y no pasa nada: con 36 filas A/B/C por grado se
-- cumple de sobra, y los pasos d..h la satisfacen. La fase 1 es segura.
--
-- EL PROBLEMA APARECE EN LA FASE 2, cuando el frontend escriba solo `nombre`
-- y el trigger derive letra := left(nombre, 1):
--
--     grupo "1-01" -> letra '1'
--     grupo "1-02" -> letra '1'   -> 23505 en grupos_grado_id_letra_key
--
--     grupo "Mañana" -> letra 'M'
--     grupo "Martes" -> letra 'M' -> 23505
--
-- Es decir: mientras exista ese UNIQUE, dos grupos del mismo grado no pueden
-- empezar por el mismo carácter. Justo el caso "1-01 / 1-02" que la spec §1
-- pone como ejemplo de lo que hay que desbloquear. Sin resolverlo, la fase 2
-- entrega el nombre libre a medias y el fallo sale en producción, al crear el
-- segundo grupo.
--
-- Se cura solo en la fase 3: al hacer `drop column letra`, Postgres se lleva
-- por delante la constraint que depende de esa columna. Pero eso son DÍAS
-- después, y la ventana de convivencia es justo cuando el frontend nuevo ya
-- está creando grupos.
--
-- OPCIONES (decisión tuya, NO la tomo yo, por eso va comentado):
--
--   A) Añadir esta línea al bloque de la fase 1, dentro del begin/commit.
--      Quitar un UNIQUE es tan retrocompatible como quitar el CHECK del paso 1:
--      el código viejo no crea duplicados, así que no lo echa de menos.
--
--          alter table public.grupos drop constraint grupos_grado_id_letra_key;
--
--   B) Dejarlo y correrlo como migración aparte justo antes de la fase 2.
--
--   C) Cambiar el trigger para que derive una letra única en vez de
--      left(nombre,1). Es la más frágil: más código en un puente temporal.
--
-- Recomendación: A. Es una línea, cabe en esta misma transacción, y deja la
-- fase 2 sin sorpresas. Pero la spec dice "tal cual", así que va aquí abajo
-- y no arriba. Si eliges A, muévela al paso 1 y vuelve a correr en staging.
-- ============================================================================
