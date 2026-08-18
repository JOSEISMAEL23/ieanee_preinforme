-- ============================================================================
-- Fix — el delegado no puede leer `estudiantes` (los tres permisos de lectura)
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-08-18
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- ⚠️ ESTE ARCHIVO YA SE CORRIÓ EN STAGING el 2026-08-18. Queda versionado
-- aquí para que la política tenga historia en el repo y para poder pegarla
-- en PRODUCCIÓN. Recordar el orden de siempre: el SQL de producción va
-- ANTES de mergear el PR, nunca después.
--
-- CONTEXTO DEL BUG: se detectó el 2026-08-18 con un usuario real (una
-- auxiliar con `gestionar_incapacidades` y sin asignaciones). La única
-- política de SELECT de `estudiantes` es `estudiantes_select_docente`
-- (sql/00-esquema-completo.sql:1455), que solo deja ver a los estudiantes de
-- los grupos que uno DICTA:
--
--   CREATE POLICY estudiantes_select_docente ON public.estudiantes FOR SELECT
--   USING (EXISTS (SELECT 1 FROM public.asignaciones a
--                  WHERE a.grupo_id = estudiantes.grupo_id
--                    AND a.docente_id = public.current_docente_id()));
--
-- Un delegado no dicta clase, así que ve CERO estudiantes:
--   * IncapacidadesAdmin.jsx:103 → el selector para crear una incapacidad
--     sale vacío.
--   * La lista de incapacidades ya registradas trae
--     `estudiantes(nombre, grupo_id, grupos(...))` como join, y un join
--     bloqueado por RLS NO da error: devuelve null. En pantalla el nombre
--     del estudiante sale vacío o como "undefined".
-- Los otros dos permisos de lectura tienen exactamente el mismo hueco, y
-- por eso se arreglan los tres de una vez: ConsolidadoAdmin.jsx:60 y 112,
-- BoletinesImprimir.jsx:31 (ver_informes_dificultades) y
-- CalificacionesInforme.jsx:218 (ver_informes_notas). Que el informe de
-- notas pareciera funcionar en la prueba del 2026-07-28 fue casualidad: se
-- probó con un docente que SÍ dictaba ese grupo, así que lo cubría la
-- política vieja.
--
-- Es la tercera vez que aparece el mismo error (§12.1 de la spec de
-- permisos: "al ampliar RLS para un permiso de lectura no basta con la
-- tabla principal; hay que recorrer TODAS las consultas de la pantalla").
-- Aquella vez se mapearon `asignaciones`, `subparametros` y `docentes` y se
-- pasó por alto `estudiantes`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- estudiantes: SOLO lectura ampliada. Se AÑADE una política nueva y separada
-- —misma convención de nombre que "leer X por permiso delegado"— sin tocar
-- `estudiantes_select_docente` ni ninguna otra: dos políticas permisivas del
-- mismo comando se combinan con OR, así que esto solo puede AMPLIAR acceso,
-- nunca restringir lo que ya funciona para un docente normal.
--
-- No se tocan `estudiantes_admin_write/update/delete`: el delegado sigue sin
-- poder crear, editar ni borrar estudiantes. Solo SELECT.
-- ----------------------------------------------------------------------------
drop policy if exists "leer estudiantes por permiso delegado" on public.estudiantes;
create policy "leer estudiantes por permiso delegado"
  on public.estudiantes for select to authenticated
  using (
    public.tiene_permiso('gestionar_incapacidades')
    or public.tiene_permiso('ver_informes_dificultades')
    or public.tiene_permiso('ver_informes_notas')
  );

-- ----------------------------------------------------------------------------
-- Verificación — hay que probar las DOS direcciones, no solo la que debe
-- pasar. Así se verificó en staging el 2026-08-18 (por impersonación en SQL,
-- sin depender de tener un usuario delegado creado): un docente normal veía
-- 147 estudiantes —solo sus grupos— y 226 —el colegio entero— al darle el
-- permiso dentro de una transacción con rollback.
-- ----------------------------------------------------------------------------
-- -- 1) SIN el permiso: el docente debe seguir viendo SOLO sus grupos.
-- begin;
--   select set_config('request.jwt.claims',
--     '{"sub":"<UUID-DE-UN-DOCENTE-NORMAL>","role":"authenticated"}', true);
--   set local role authenticated;
--   select count(*) from public.estudiantes;
-- rollback;
--
-- -- 2) CON el permiso: el mismo docente debe ver el colegio entero.
-- begin;
--   insert into public.permisos_usuario (docente_id, permiso, activo)
--     values ('<UUID-DE-UN-DOCENTE-NORMAL>', 'gestionar_incapacidades', true);
--   select set_config('request.jwt.claims',
--     '{"sub":"<UUID-DE-UN-DOCENTE-NORMAL>","role":"authenticated"}', true);
--   set local role authenticated;
--   select count(*) from public.estudiantes;
-- rollback;  -- ⚠️ el rollback NO es opcional: deja la base como estaba.
--
-- -- Estado final: debe verse la política vieja intacta MÁS la nueva.
-- select policyname, cmd, qual
-- from pg_policies
-- where tablename = 'estudiantes'
-- order by policyname;
