-- ============================================================================
-- P2 · CAPA 0a — FASE 1 · EXPAND
-- Liberar el nombre del grupo, de forma retrocompatible
-- 2026-08-06
-- ============================================================================
--
-- QUÉ HACE
--   Añade `nombre` y `orden` a `grupos`, quita las DOS constraints que atan la
--   tabla a la letra (el CHECK A/B/C y el UNIQUE sobre (grado_id, letra)), y
--   monta un trigger que mantiene `letra` y `nombre` sincronizadas mientras
--   conviven.
--
--   Única diferencia con la spec §3.1: el paso 1b, que quita ese UNIQUE. El
--   porqué está en el HALLAZGO del final del archivo.
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

-- 1a. Fuera la ley que prohíbe existir a los grupos D en adelante.
--     Se puede hacer ya: quitar un CHECK nunca rompe al código viejo,
--     solo deja de prohibir algo que el código viejo no intentaba hacer.
alter table public.grupos drop constraint grupos_letra_check;

-- 1b. Y fuera el UNIQUE sobre (grado_id, letra), por el mismo motivo.
--     Si se queda, en la fase 2 el trigger deriva letra = left(nombre,1)
--     y dos grupos del mismo grado no pueden empezar por el mismo carácter:
--     "1-01" y "1-02" chocan con 23505. Ver el HALLAZGO al final.
alter table public.grupos drop constraint grupos_grado_id_letra_key;

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
-- -- b) No quedó ni rastro de las dos constraints sobre `letra`
-- select conname from pg_constraint where conrelid='public.grupos'::regclass;
-- -- esperado: EXACTAMENTE estas tres, ni una más:
-- --     grupos_pkey
-- --     grupos_grado_id_fkey
-- --     grupos_grado_id_nombre_key
-- --
-- -- Si aparece grupos_letra_check      -> el paso 1a no se aplicó.
-- -- Si aparece grupos_grado_id_letra_key -> PARAR. El paso 1b no se aplicó.
-- --     Cuidado, porque esto NO se nota aquí: el resto de la fase 1 pasa
-- --     igual, las 36 filas quedan bien y hasta los pasos d..h dan verde.
-- --     Estalla en la FASE 2, en producción, al crear el segundo grupo que
-- --     empiece por el mismo carácter ("1-01" y luego "1-02"): 23505.
-- --     No seguir a la fase 2 hasta que esta consulta dé las tres de arriba.
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
-- ⚠️ HALLAZGO — RESUELTO. Registro de la decisión.
-- ============================================================================
--
-- ESTADO: aplicado el 2026-08-06. Es el paso 1b del bloque de arriba.
--         Este texto se conserva como registro del porqué, no como pendiente.
--
-- El bloque de arriba salió copiado TAL CUAL de la spec §3.1. Al contrastarlo
-- con sql/00-esquema-completo.sql apareció una constraint que la spec §2
-- ("estado actual verificado") NO lista:
--
--     ALTER TABLE ONLY public.grupos
--       ADD CONSTRAINT grupos_grado_id_letra_key UNIQUE (grado_id, letra);
--                                                        ^^^^^^^^^^^^^^^
--
-- Dejarla no rompía la fase 1: con 36 filas A/B/C por grado se cumple de
-- sobra, y los pasos d..h la satisfacen. Por eso es traicionera — la fase 1
-- da verde igual.
--
-- EL PROBLEMA APARECÍA EN LA FASE 2, cuando el frontend escriba solo `nombre`
-- y el trigger derive letra := left(nombre, 1):
--
--     grupo "1-01" -> letra '1'
--     grupo "1-02" -> letra '1'   -> 23505 en grupos_grado_id_letra_key
--
--     grupo "Mañana" -> letra 'M'
--     grupo "Martes" -> letra 'M' -> 23505
--
-- Es decir: mientras existiera ese UNIQUE, dos grupos del mismo grado no
-- podían empezar por el mismo carácter. Justo el caso "1-01 / 1-02" que la
-- spec §1 pone como ejemplo de lo que hay que desbloquear. Sin resolverlo, la
-- fase 2 entregaba el nombre libre a medias y el fallo salía en producción, al
-- crear el segundo grupo.
--
-- Se curaba solo en la fase 3: al hacer `drop column letra`, Postgres se lleva
-- por delante la constraint que depende de esa columna. Pero eso son DÍAS
-- después, y la ventana de convivencia es justo cuando el frontend nuevo ya
-- está creando grupos. Esperar a la fase 3 no servía.
--
-- LAS TRES OPCIONES QUE HABÍA:
--
--   A) ✅ ELEGIDA (2026-08-06). Quitar el UNIQUE dentro del begin/commit de
--      la fase 1 — es el paso 1b de arriba.
--
--          alter table public.grupos drop constraint grupos_grado_id_letra_key;
--
--      POR QUÉ: quitar un UNIQUE es tan retrocompatible como quitar el CHECK
--      del paso 1a. El código viejo nunca creó duplicados de (grado_id, letra),
--      así que no echa de menos una constraint que jamás llegó a tocar. Cabe
--      en la misma transacción, es una línea, y deja la fase 2 sin sorpresas.
--      Lo que protege de verdad los nombres a partir de ahora es el UNIQUE
--      (grado_id, nombre) del paso 6, que es el correcto.
--
--   B) Descartada: correrlo como migración aparte justo antes de la fase 2.
--      Añade un cuarto momento que hay que acordarse de ejecutar, y si se
--      olvida el síntoma es un 23505 en producción. Mismo efecto que A, más
--      superficie para el olvido.
--
--   C) Descartada: cambiar el trigger para derivar una letra única en vez de
--      left(nombre,1). La más frágil de las tres: mete lógica no trivial en un
--      puente que existe para morir en unos días, y habría que probarla.
--
-- Lo que NO cambia: la única diferencia con la spec §3.1 es el paso 1b. El
-- resto del bloque sigue tal cual.
-- ============================================================================
