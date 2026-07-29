-- =====================================================================
-- 01-semilla.sql — Datos base para una instancia NUEVA
-- =====================================================================
-- Se ejecuta DESPUÉS de 00-esquema-completo.sql, en el SQL Editor del
-- proyecto de Supabase del colegio nuevo.
--
-- Carga únicamente:
--   1. grados          (la escalera académica)
--   2. grupos          (cada grado x sus letras)
--   3. configuracion   (la fila única id=1 que la app asume que existe)
--
-- NO contiene estudiantes, docentes, materias, periodos ni notas.
-- Esos los carga el admin del colegio desde la app (plantillas/*.xlsx).
--
-- ⚠️ AJUSTAR ANTES DE EJECUTAR: ver los tres bloques marcados "AJUSTAR".
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. GRADOS                                          << AJUSTAR (1 de 3)
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
-- 2. GRUPOS                                          << AJUSTAR (2 de 3)
-- ---------------------------------------------------------------------
-- Genera un grupo por cada grado x cada letra de la lista.
-- Si el colegio maneja grupos A hasta E, cambia la lista por:
--     array['A','B','C','D','E']
-- Si un grado concreto tiene menos grupos, bórralos después a mano
-- desde el Table Editor.
-- ---------------------------------------------------------------------
insert into public.grupos (grado_id, letra)
select g.id, l.letra
from public.grados g
cross join unnest(array['A','B','C']) as l(letra)   -- << AJUSTAR las letras
order by g.orden, l.letra
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. CONFIGURACIÓN                                   << AJUSTAR (3 de 3)
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
-- 4. Sincronizar las secuencias
-- ---------------------------------------------------------------------
-- Los ids de arriba se insertaron a mano. Sin esto, el primer INSERT
-- que haga la app intentaría usar el id 1 y chocaría con una clave
-- duplicada. NO borrar este bloque.
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
-- Esperado en un colegio completo: 12 grados, 36 grupos, 1 configuración.
select 'grados'       as tabla, count(*) as filas from public.grados
union all
select 'grupos',       count(*) from public.grupos
union all
select 'configuracion', count(*) from public.configuracion;

-- Listado legible de los grupos creados, para revisar de un vistazo:
select g.nombre as grado, string_agg(gr.letra, ', ' order by gr.letra) as grupos
from public.grados g
join public.grupos gr on gr.grado_id = g.id
group by g.nombre, g.orden
order by g.orden;
