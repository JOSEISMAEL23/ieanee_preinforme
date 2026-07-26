-- ============================================================================
-- Verificación de tipos — antes de construir Capa 2/3 de Calificaciones
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-07-25
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar → Run.
-- Es de SOLO LECTURA (no modifica nada). Copia el resultado de la consulta
-- de abajo y pégamelo para que ajuste las FKs de `notas`/`subparametros`.
-- ============================================================================

select
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name       -- útil para distinguir uuid vs bigint vs int4/int8
from information_schema.columns c
where c.table_schema = 'public'
  and (
    (c.table_name = 'asignaciones'  and c.column_name in ('id', 'docente_id', 'grupo_id', 'materia_id'))
    or (c.table_name = 'periodos'   and c.column_name = 'id')
    or (c.table_name = 'docentes'   and c.column_name in ('id', 'user_id'))
    or (c.table_name = 'estudiantes' and c.column_name = 'id')
  )
order by c.table_name, c.column_name;
