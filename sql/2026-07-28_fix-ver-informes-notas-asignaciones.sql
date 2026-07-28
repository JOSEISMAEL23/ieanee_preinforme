-- ============================================================================
-- Fix — ver_informes_notas también necesita leer TODAS las asignaciones,
-- subparametros y docentes, no solo notas/marcas
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-28
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada (incluye las
-- dos políticas de una primera pasada de este mismo fix, ya aplicadas).
--
-- CONTEXTO DEL BUG: la Capa 1 de permisos delegados (sql/2026-07-28_permisos_
-- delegados.sql) amplió SOLO las políticas de SELECT de `notas` y `marcas`
-- para el permiso ver_informes_notas / ver_informes_dificultades. Pero
-- CalificacionesInforme.jsx, para armar el consolidado de un docente que NO
-- es el que está mirando, también necesita:
--   1. Listar TODAS las asignaciones de un grupo (no solo las propias) para
--      poblar el combo de "Materia" — consulta `asignaciones` filtrada por
--      grupo_id, sin filtro de docente.
--   2. Leer los `subparametros` de esa asignación ajena para poder calcular
--      la nota.
--   3. Leer el `nombre` del `docentes` dueño de cada asignación ajena, vía
--      el join asignaciones(..., docentes(nombre)) que arma el combo de
--      Materia — si esa fila de docentes no es legible, el join vuelve
--      null y en pantalla aparece "undefined" en vez del nombre.
-- Ninguna de las tres tablas se tocó en la Capa 1.
--
-- TIPOS: docentes.id = uuid (confirmado en migraciones previas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- asignaciones: SOLO lectura ampliada. La política actual de esta tabla no
-- está versionada en sql/ (se creó directo en Supabase antes de esta
-- convención), así que se AÑADE una política nueva y separada en vez de
-- reemplazar por nombre adivinado — dos políticas permisivas del mismo
-- comando se combinan con OR, así que esto solo puede ampliar acceso, nunca
-- restringir lo que ya funciona. No se toca insert/update/delete: un
-- delegado de informes no debe poder crear ni reasignar materias.
-- ----------------------------------------------------------------------------
drop policy if exists "leer asignaciones por permiso delegado" on public.asignaciones;
create policy "leer asignaciones por permiso delegado" on public.asignaciones
  for select to authenticated
  using (tiene_permiso('ver_informes_notas'));

-- ----------------------------------------------------------------------------
-- subparametros: SOLO lectura ampliada. Política real conocida (definida en
-- sql/2026-07-25_calificaciones-capa2.sql y luego ajustada en
-- sql/2026-07-28_docente_modulos.sql para exigir tiene_modulo). Se preserva
-- esa condición para el docente que usa su propio módulo de calificaciones,
-- y se agrega el camino del delegado con permiso de informes (no depende de
-- si tiene o no el módulo de calificaciones activo — un delegado puede no
-- dictar clase en absoluto).
-- ----------------------------------------------------------------------------
drop policy if exists "leer subparametros" on public.subparametros;
create policy "leer subparametros" on public.subparametros
  for select to authenticated
  using (
    tiene_permiso('ver_informes_notas')
    or tiene_modulo('calificaciones')
  );

-- ----------------------------------------------------------------------------
-- docentes: SOLO lectura ampliada. El combo de Materia hace
-- asignaciones(..., docentes(nombre)) para mostrar de quién es cada
-- asignatura — si la fila de `docentes` del dueño no es legible, el join
-- vuelve null y en pantalla sale "undefined" en vez del nombre (bug
-- reportado tras aplicar el fix de arriba). Política actual no versionada
-- en sql/ → se AÑADE una política nueva y separada, mismo criterio que
-- asignaciones: solo amplía lectura, nunca toca insert/update/delete (así
-- un delegado de informes no puede editar el nombre/correo de otro
-- docente, solo verlo).
-- ----------------------------------------------------------------------------
drop policy if exists "leer docentes por permiso delegado" on public.docentes;
create policy "leer docentes por permiso delegado" on public.docentes
  for select to authenticated
  using (tiene_permiso('ver_informes_notas'));

-- ----------------------------------------------------------------------------
-- Verificación rápida (opcional)
-- ----------------------------------------------------------------------------
-- select tablename, policyname, cmd
-- from pg_policies
-- where tablename in ('asignaciones', 'subparametros', 'docentes')
-- order by tablename, policyname;
