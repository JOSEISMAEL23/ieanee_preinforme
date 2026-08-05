-- ============================================================================
-- 2026-08-04 · Capa 0 de P2 — ON DELETE CASCADE  ->  ON DELETE RESTRICT
--             en las FK que apuntan a la ESTRUCTURA ACADÉMICA
--             (grados, grupos, periodos, materias)
-- ============================================================================
--
-- POR QUÉ
-- P2 va a poner por primera vez un botón de "eliminar" sobre grados y grupos.
-- Hoy esas FK están en CASCADE: borrar un grado se lleva en silencio sus
-- grupos, sus estudiantes, sus materias, sus asignaciones y — por debajo —
-- todas las notas, marcas y asistencias colgadas de ellos. Sin confirmación
-- de Postgres y sin forma de deshacerlo.
--
-- Y no basta con no dibujar el botón: las policies RLS son FOR ALL, así que
-- incluyen DELETE. Cualquiera con is_admin() puede abrir la consola del
-- navegador y hacer el .delete() con la anon key. RESTRICT lo bloquea dentro
-- de Postgres, venga de la UI o de fuera de ella.
--
-- QUÉ NO CAMBIA
-- RESTRICT solo rechaza borrar una fila QUE TENGA HIJOS. Borrar un grupo
-- vacío creado por error sigue funcionando — que es el único borrado que P2
-- va a ofrecer.
--
-- ANTES DE CORRER ESTO EN PRODUCCIÓN: backup.ps1
-- Orden obligatorio: backup -> staging -> verificar -> producción.
--
-- ============================================================================
-- PASO 1 — Foto del estado actual (correr ANTES, guardar el resultado)
-- ============================================================================

select
  tc.table_name      as tabla_hija,
  kcu.column_name    as columna,
  ccu.table_name     as tabla_padre,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by rc.delete_rule, tc.table_name;

-- ============================================================================
-- PASO 2 — La migración (9 constraints, transaccional: o entran todas o ninguna)
-- ============================================================================
--
-- Cada DROP + ADD toma un lock ACCESS EXCLUSIVE sobre la tabla hija y revalida
-- sus filas. Con el volumen de un colegio son milisegundos, pero conviene
-- correrlo fuera de horario de captura de notas.

begin;

-- --- Hijos de GRADOS -------------------------------------------------------
-- Borrar un grado ya no puede llevarse sus grupos ni sus materias.

alter table public.grupos drop constraint grupos_grado_id_fkey;
alter table public.grupos add constraint grupos_grado_id_fkey
  foreign key (grado_id) references public.grados(id) on delete restrict;

alter table public.materias drop constraint materias_grado_id_fkey;
alter table public.materias add constraint materias_grado_id_fkey
  foreign key (grado_id) references public.grados(id) on delete restrict;

-- --- Hijos de GRUPOS -------------------------------------------------------
-- Borrar un grupo ya no puede llevarse su matrícula ni sus asignaciones
-- (y, por la cadena estudiante -> notas/marcas/asistencias, el histórico).

alter table public.estudiantes drop constraint estudiantes_grupo_id_fkey;
alter table public.estudiantes add constraint estudiantes_grupo_id_fkey
  foreign key (grupo_id) references public.grupos(id) on delete restrict;

alter table public.asignaciones drop constraint asignaciones_grupo_id_fkey;
alter table public.asignaciones add constraint asignaciones_grupo_id_fkey
  foreign key (grupo_id) references public.grupos(id) on delete restrict;

-- --- Hijos de MATERIAS -----------------------------------------------------
-- Borrar una materia ya no puede llevarse las asignaciones docente-materia
-- (y con ellas las notas) ni las marcas registradas en esa materia.

alter table public.asignaciones drop constraint asignaciones_materia_id_fkey;
alter table public.asignaciones add constraint asignaciones_materia_id_fkey
  foreign key (materia_id) references public.materias(id) on delete restrict;

alter table public.marcas drop constraint marcas_materia_id_fkey;
alter table public.marcas add constraint marcas_materia_id_fkey
  foreign key (materia_id) references public.materias(id) on delete restrict;

-- --- Hijos de PERIODOS -----------------------------------------------------
-- Borrar un periodo ya no puede vaciar el año entero de notas, marcas y
-- asistencias de un clic.

alter table public.notas drop constraint notas_periodo_id_fkey;
alter table public.notas add constraint notas_periodo_id_fkey
  foreign key (periodo_id) references public.periodos(id) on delete restrict;

alter table public.marcas drop constraint marcas_periodo_id_fkey;
alter table public.marcas add constraint marcas_periodo_id_fkey
  foreign key (periodo_id) references public.periodos(id) on delete restrict;

alter table public.asistencias drop constraint asistencias_periodo_id_fkey;
alter table public.asistencias add constraint asistencias_periodo_id_fkey
  foreign key (periodo_id) references public.periodos(id) on delete restrict;

commit;

-- ============================================================================
-- PASO 3 — Verificación (debe devolver exactamente 9 filas, todas RESTRICT)
-- ============================================================================

select
  tc.table_name      as tabla_hija,
  kcu.column_name    as columna,
  ccu.table_name     as tabla_padre,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and ccu.table_name in ('grados', 'grupos', 'periodos', 'materias')
order by ccu.table_name, tc.table_name;

-- ============================================================================
-- LO QUE SE QUEDA EN CASCADE, A PROPÓSITO
-- ============================================================================
--
--  estudiantes -> notas / marcas / asistencias / incapacidades
--      EstudiantesAdmin.jsx tiene hoy "borrar toda la matrícula"
--      (.delete().gt('id', 0)), el flujo de reimportar el Excel al empezar
--      el año. Ponerlo en RESTRICT rompe ese flujo sin darle reemplazo.
--
--  asignaciones -> notas / asistencias / subparametros
--      DocentesAdmin.quitarAsignacion() se usa de rutina para reasignar
--      docentes. RESTRICT lo bloquearía cada vez.
--      ⚠️ Es el hueco grande que queda: quitar una asignación SIGUE borrando
--      las notas de esa materia. Merece su propia capa (soft-delete o aviso
--      con conteo), no cabe en esta.
--
--  docentes -> asignaciones / docente_modulos / permisos_usuario
--      Son permisos y vínculos, no historial académico. Se regeneran.
--
--  parametros -> subparametros / subparametro_plantilla
--  subparametros -> notas
--      Tabla de detalle que no existe sin su cabecera. CASCADE es lo correcto.
--
--  auth.users -> docentes
--      Lo gobierna Supabase Auth, no nosotros.
--
--  asistencias.registrado_por / notas.registrado_por / marcas.actualizado_por
--  incapacidades.registrado_por  ->  docentes
--      Ya son SET NULL o NO ACTION. No borran nada. Se dejan igual.
