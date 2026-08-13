-- =====================================================================
-- 01-semilla.sql — Datos base para una instancia NUEVA
-- =====================================================================
-- Se ejecuta DESPUÉS de 00-esquema-completo.sql, en el SQL Editor del
-- proyecto de Supabase del colegio nuevo.
--
-- Carga únicamente:
--   1. grados          (la escalera académica)
--   2. grupos          (cada grado x sus grupos)
--   3. configuracion   (la fila única id=1 que la app asume que existe)
--   4. parametros      (Saber/Hacer/Ser + pesos de sus subparámetros)
--
-- NO contiene estudiantes, docentes, materias, periodos ni notas.
-- Esos los carga el admin del colegio desde la app (plantillas/*.xlsx).
--
-- ⚠️ AJUSTAR ANTES DE EJECUTAR: ver los cuatro bloques marcados "AJUSTAR".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. GRADOS                                          << AJUSTAR (1 de 4)
-- ---------------------------------------------------------------------
-- Borra las filas de los grados que este colegio NO tenga.
-- Ejemplo: un colegio solo de primaria borra de '6°' a '11°'.
-- 'orden' controla cómo se ordenan en pantalla. 'nivel' es
-- 'primaria' o 'bachillerato'.
-- ---------------------------------------------------------------------
insert into public.grados (id, nombre, orden, nivel) values
  ( 1, 'Transición',  0, 'primaria'),
  ( 2, '1°',          1, 'primaria'),
  ( 3, '2°',          2, 'primaria'),
  ( 4, '3°',          3, 'primaria'),
  ( 5, '4°',          4, 'primaria'),
  ( 6, '5°',          5, 'primaria'),
  ( 7, '6°',          6, 'bachillerato'),
  ( 8, '7°',          7, 'bachillerato'),
  ( 9, '8°',          8, 'bachillerato'),
  (10, '9°',          9, 'bachillerato'),
  (11, '10°',        10, 'bachillerato'),
  (12, '11°',        11, 'bachillerato')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. GRUPOS                                          << AJUSTAR (2 de 4)
-- ---------------------------------------------------------------------
-- Genera un grupo por cada grado x cada nombre de la lista.
--
-- EL NOMBRE ES LIBRE. No tiene que ser una letra: vale 'A', '1-01',
-- 'Mañana' o lo que use el colegio. Ejemplos de lista:
--     array['A','B','C','D','E']
--     array['1-01','1-02','1-03']
-- El 'orden' (1, 2, 3...) lo pone solo la posición en la lista, y es
-- lo que decide cómo se ordenan en pantalla.
--
-- ESTE BLOQUE YA ES OPCIONAL: desde /admin/estructura el colegio crea
-- y renombra sus grados y grupos sin tocar SQL. Sirve para dejar la
-- instancia sembrada de una vez; si prefieres que el colegio lo arme
-- desde la app, puedes saltarte este insert.
--
-- Si un grado concreto tiene menos grupos, bórralos después desde
-- /admin/estructura.
-- ---------------------------------------------------------------------
insert into public.grupos (grado_id, nombre, orden)
select g.id, n.nombre, n.orden::int
from public.grados g
cross join unnest(array['A','B','C'])   -- << AJUSTAR los nombres
     with ordinality as n(nombre, orden)
order by g.orden, n.orden
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. CONFIGURACIÓN                                   << AJUSTAR (3 de 4)
-- ---------------------------------------------------------------------
-- La app asume que SIEMPRE existe la fila id = 1. Si falta, falla.
-- El nombre, el eslogan y el logo también se pueden cambiar después
-- desde /admin (Ajustes de institución) — esto es solo el arranque.
--
-- nota_minima: escala de 0 a 100. 70.00 = aprueba con 70.
-- Solo aplica si el colegio contrató el módulo de calificaciones.
-- ---------------------------------------------------------------------
insert into public.configuracion (id, nombre_institucion, eslogan, logo_url, nota_minima)
values (
  1,
  'NOMBRE OFICIAL DE LA INSTITUCIÓN',   -- << AJUSTAR
  'Eslogan institucional',              -- << AJUSTAR (puede quedar vacío: '')
  null,                                 -- el logo se sube después desde /admin
  70.00                                 -- << AJUSTAR la nota mínima
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. PARÁMETROS DE EVALUACIÓN                        << AJUSTAR (4 de 4)
-- ---------------------------------------------------------------------
-- Saber / Hacer / Ser y los pesos iniciales de sus subparámetros.
-- Solo aplica si el colegio contrató el módulo de calificaciones.
--
-- POR QUÉ ESTÁ AQUÍ: sin estas filas, /admin/parametros no se puede
-- usar. Muestra el cartel "Falta ejecutar el SQL" y no ofrece salida:
-- esa pantalla solo hace UPDATE sobre filas que ya existen, nunca
-- INSERT, así que el admin no puede crearlas desde la app.
--
-- Los porcentajes deben sumar EXACTAMENTE 100 — la pantalla se niega
-- a guardar si no. Lo mismo los 4 pesos de cada parámetro.
-- ---------------------------------------------------------------------
insert into public.parametros (nombre, porcentaje, orden)
select v.nombre, v.porcentaje, v.orden
from (values
  ('Saber', 60::numeric, 1),          -- << AJUSTAR
  ('Hacer', 30::numeric, 2),          -- << AJUSTAR
  ('Ser',   10::numeric, 3)           -- << AJUSTAR  (los tres suman 100)
) as v(nombre, porcentaje, orden)
where not exists (select 1 from public.parametros);

-- 4 subparámetros por parámetro, al 25% cada uno.
-- Va con INSERT ... SELECT y no con valores fijos porque parametros.id
-- es `generated always as identity`: los ids los asigna Postgres en el
-- INSERT de arriba y no se pueden escribir a mano aquí.
insert into public.subparametro_plantilla (parametro_id, orden, peso)
select p.id, o.orden, 25              -- << AJUSTAR el peso (los 4 suman 100)
from public.parametros p
cross join (values (1), (2), (3), (4)) as o(orden)
on conflict (parametro_id, orden) do nothing;

-- ---------------------------------------------------------------------
-- 5. Sincronizar las secuencias
-- ---------------------------------------------------------------------
-- Los ids de arriba se insertaron a mano. Sin esto, el primer INSERT
-- que haga la app intentaría usar el id 1 y chocaría con una clave
-- duplicada. NO borrar este bloque.
--
-- parametros y subparametro_plantilla NO aparecen aquí a propósito:
-- son `identity` y nunca se les puso el id a mano, así que su secuencia
-- ya quedó en el valor correcto.
-- ---------------------------------------------------------------------
select setval(pg_get_serial_sequence('public.grados', 'id'),
              coalesce((select max(id) from public.grados), 1), true);

select setval(pg_get_serial_sequence('public.grupos', 'id'),
              coalesce((select max(id) from public.grupos), 1), true);

select setval(pg_get_serial_sequence('public.configuracion', 'id'),
              coalesce((select max(id) from public.configuracion), 1), true);

commit;

-- =====================================================================
-- VERIFICACIÓN — correr después y revisar los resultados
-- =====================================================================
-- Esperado en un colegio completo: 12 grados, 36 grupos, 1 configuración,
-- 3 parámetros y 12 filas de plantilla (4 por parámetro).
select 'grados'        as tabla, count(*) as filas from public.grados
union all
select 'grupos',        count(*) from public.grupos
union all
select 'configuracion', count(*) from public.configuracion
union all
select 'parametros',    count(*) from public.parametros
union all
select 'plantilla',     count(*) from public.subparametro_plantilla;

-- Los porcentajes y pesos que quedaron. Los tres porcentajes deben dar
-- 100, y los 4 pesos de cada parámetro también.
select p.orden, p.nombre, p.porcentaje,
       (select string_agg(s.peso::text, ' / ' order by s.orden)
        from public.subparametro_plantilla s where s.parametro_id = p.id) as pesos
from public.parametros p
order by p.orden;

-- Listado legible de los grupos creados, para revisar de un vistazo:
select g.nombre as grado, string_agg(gr.nombre, ', ' order by gr.orden) as grupos
from public.grados g
join public.grupos gr on gr.grado_id = g.id
group by g.nombre, g.orden
order by g.orden;
