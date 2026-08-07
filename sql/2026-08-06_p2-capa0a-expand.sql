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
--   Dos diferencias con la spec §3.1, las dos documentadas al final del
--   archivo: el paso 1b (quitar ese UNIQUE) y el cuerpo de la función del
--   paso 5 (el trigger de la spec no sincronizaba en UPDATE).
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
--    Cubre INSERT y UPDATE por separado, porque son dos problemas distintos:
--    al crear hay una columna vacía que rellenar; al renombrar no hay ninguna
--    vacía y hay que mirar cuál cambió. Ver el HALLAZGO 2 del final.
create or replace function public.grupos_sync_nombre_letra()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Al crear: se rellena la columna que venga vacia
    if new.nombre is null and new.letra is not null then
      new.nombre := new.letra;               -- escribio el codigo VIEJO
    elsif new.letra is null and new.nombre is not null then
      new.letra := left(new.nombre, 1);      -- escribio el codigo NUEVO
    end if;
  else
    -- Al RENOMBRAR: ninguna viene vacia. Hay que mirar cual CAMBIO
    -- y arrastrar la otra detras. Sin esta rama el puente es solo de ida.
    if new.nombre is distinct from old.nombre and new.nombre is not null then
      new.letra := left(new.nombre, 1);      -- renombro el codigo NUEVO
    elsif new.letra is distinct from old.letra and new.letra is not null then
      new.nombre := new.letra;               -- renombro el codigo VIEJO
    end if;
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
-- Probar los DOS lados, como en la capa 0 de RESTRICT. Los pasos d/f (crear) e
-- i/j (renombrar) son el corazón de esta fase: comprueban que el puente cruza
-- en las dos direcciones y en las dos operaciones. Si solo se verifica d, se
-- está probando un cuarto de la migración.
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
-- -- i) RENOMBRAR como lo hará el CÓDIGO NUEVO: se toca solo `nombre`
-- update public.grupos set nombre='1-01'
-- where nombre='D' and grado_id=(select id from public.grados where nombre like '6%');
-- select nombre, letra from public.grupos where nombre='1-01';
-- -- esperado: 1-01 | 1   <- `letra` siguió al nombre.
-- --           Si sale 1-01 | D, el trigger no maneja UPDATE.
--
-- -- j) RENOMBRAR como lo haría el CÓDIGO VIEJO: se toca solo `letra`
-- update public.grupos set letra='Z'
-- where nombre='1-01' and grado_id=(select id from public.grados where nombre like '6%');
-- select nombre, letra from public.grupos where letra='Z';
-- -- esperado: Z | Z
--
-- -- k) Limpiar TODAS las pruebas (funciona porque están vacíos;
-- --    RESTRICT solo bloquea si tienen estudiantes dentro)
-- delete from public.grupos
-- where grado_id=(select id from public.grados where nombre like '6%')
--   and orden > 3;
-- -- esperado: DELETE 2   <- vuelven a quedar solo A, B, C


-- ============================================================================
-- ⚠️ HALLAZGO 1 — RESUELTO. Registro de la decisión.
--    El UNIQUE (grado_id, letra) que la spec no listaba
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
-- ============================================================================
-- ⚠️ HALLAZGO 2 — RESUELTO. Registro de la decisión.
--    El trigger de la spec era un puente de una sola dirección: INSERT
-- ============================================================================
--
-- ESTADO: aplicado el 2026-08-06. Es la función del paso 5 del bloque de
--         arriba, reescrita. Este texto es el registro del porqué.
--
-- La función de la spec §3.1 decidía qué rellenar preguntando cuál de las dos
-- columnas venía vacía:
--
--     if new.nombre is null and new.letra is not null then ...
--     elsif new.letra is null and new.nombre is not null then ...
--
-- Eso solo describe un INSERT. En un UPDATE de una fila que ya existe
-- **ninguna de las dos columnas viene vacía**, así que las dos ramas del if se
-- saltan y el trigger no sincroniza nada, aunque esté declarado
-- `before insert or update`.
--
-- EL SÍNTOMA que producía, en la fase 2 y en producción: renombrar el grupo
-- "A" a "1-01" desde la pantalla nueva escribe solo `nombre`. `letra` se queda
-- congelada en "A". A partir de ahí las dos columnas dicen cosas distintas
-- sobre la misma fila, y cualquier pantalla que todavía lea `letra` —durante
-- la convivencia son las 11— muestra el grupo con su nombre viejo. El puente
-- solo cruzaba de ida.
--
-- POR QUÉ NO LO CAZARON LAS VERIFICACIONES a..h: porque las ocho probaban
-- únicamente INSERT. Los pasos d y f, que la spec llama "el corazón de esta
-- fase" por cruzar el puente en las dos direcciones, cruzaban las dos
-- direcciones de una sola operación. La verificación daba verde con el trigger
-- roto — exactamente el mismo patrón que el HALLAZGO 1, donde la fase 1 también
-- pasaba entera y lo que estallaba era la fase 2.
--
-- EL ARREGLO: separar por `tg_op`. Al crear se rellena la columna vacía, como
-- antes. Al renombrar se compara con `old` para ver cuál de las dos cambió y se
-- arrastra la otra detrás.
--
-- Y SE AÑADIERON LOS PASOS i y j a la verificación, que renombran por cada
-- lado, porque un arreglo sin la comprobación que lo vigila vuelve a romperse
-- en silencio la próxima vez que alguien toque la función.
--
-- ============================================================================
-- Lo que NO cambia: las únicas diferencias con la spec §3.1 son el paso 1b y
-- el cuerpo de la función del paso 5. El resto del bloque sigue tal cual.
-- ============================================================================
