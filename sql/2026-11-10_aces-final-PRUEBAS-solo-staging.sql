-- ============================================================================
-- ACES FINAL — PRUEBAS DE LA BASE (spec §8)               ⚠️ SOLO EN STAGING
-- ============================================================================
-- NO es una migración: NUNCA se pega en producción. Va DESPUÉS de
-- sql/2026-11-10_aces-final.sql, en el SQL Editor de STAGING.
--
-- QUÉ HACE, en una sola corrida:
--   1. Semilla: 6 actas con nombres ficticios ('PRUEBA ...'), consecutivos
--      901-906 para no chocar con una carga de verdad.
--        Docente A: 4 filas en 2 bloques (Noveno A y Noveno B · MATEMATICAS)
--        Docente B: 2 filas en 1 bloque  (Noveno A · CIENCIAS NATURALES)
--      ALVAREZ ANA queda con 2 áreas de 2 docentes distintos, seguidas.
--   2. Pruebas ENTRANDO COMO EL DOCENTE A, no como admin (error repetido nº 4:
--      is_admin() lo deja pasar todo). Cada prueba se deshace sola.
--   3. Una prueba como SQL Editor: coordinación SÍ puede corregir el docente.
--   Al final sale una tabla OK / FALLO. Tiene que ser TODO OK.
--
-- La semilla SÍ queda guardada: es con la que se prueba la pantalla después.
-- Se puede volver a correr: borra las filas 'PRUEBA %' y las crea de nuevo.
--
-- ANTES DE CORRER — cambia los dos correos EN EL SQL EDITOR, después de pegar
-- (no en este archivo: así no entra un correo al repo). Líneas marcadas con ←
--   A = el docente con el que vas a ENTRAR a la app para probar la pantalla.
--       Rol docente (NO admin), con usuario de acceso y contraseña conocidos.
--   B = cualquier otro docente activo.
-- Si un correo no existe, o A es admin, se detiene con un mensaje claro y no
-- guarda nada. Por eso pegado en producción tal cual, tampoco guarda nada.
--
-- Supabase puede pedir confirmación por el DELETE: es el de las filas PRUEBA.
--
-- Todo o nada: el archivo corre como UNA transacción (sin begin/commit a
-- propósito, igual que la migración). El "entrar como docente A" (set local
-- role + request.jwt.claims) dura solo esta corrida.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEMILLA (como SQL Editor)
-- ----------------------------------------------------------------------------
do $$
declare
  correo_a constant text := 'CORREO_DOCENTE_A';   -- ← docente con el que vas a ENTRAR
  correo_b constant text := 'CORREO_DOCENTE_B';   -- ← cualquier otro docente
  v_a      uuid;
  v_user_a uuid;
  v_rol_a  text;
  v_b      uuid;
begin
  select id, user_id, rol into v_a, v_user_a, v_rol_a
    from public.docentes where lower(email) = lower(correo_a) and activo;
  select id into v_b
    from public.docentes where lower(email) = lower(correo_b) and activo;

  if v_a is null then
    raise exception 'No hay un docente ACTIVO con el correo "%". No se guardó nada.', correo_a;
  end if;
  if v_b is null then
    raise exception 'No hay un docente ACTIVO con el correo "%". No se guardó nada.', correo_b;
  end if;
  if v_a = v_b then
    raise exception 'A y B son el mismo docente. No se guardó nada.';
  end if;
  if v_rol_a = 'admin' then
    raise exception '"%" es admin: is_admin() le deja pasar todo y la prueba no probaría nada. Usa un docente. No se guardó nada.', correo_a;
  end if;
  if v_user_a is null then
    raise exception '"%" no tiene usuario de acceso (docentes.user_id vacío): no podrías entrar con él a la app. No se guardó nada.', correo_a;
  end if;

  delete from public.aces_final where estudiante like 'PRUEBA %';

  insert into public.aces_final (anio, consecutivo, docente_id, grupo, area, estudiante) values
    (2026, 901, v_b, 'Noveno A', 'CIENCIAS NATURALES', 'PRUEBA ALVAREZ ANA'),
    (2026, 902, v_a, 'Noveno A', 'MATEMATICAS',        'PRUEBA ALVAREZ ANA'),
    (2026, 903, v_a, 'Noveno A', 'MATEMATICAS',        'PRUEBA BARRIOS BETO'),
    (2026, 904, v_b, 'Noveno A', 'CIENCIAS NATURALES', 'PRUEBA CASTRO CAMILA'),
    (2026, 905, v_a, 'Noveno B', 'MATEMATICAS',        'PRUEBA DIAZ DANIEL'),
    (2026, 906, v_a, 'Noveno B', 'MATEMATICAS',        'PRUEBA ESPINOSA ELENA');

  -- Para el paso 2: desde aquí, auth.uid() es el usuario del docente A.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  perform set_config('aces.docente_b', v_b::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 2. PRUEBAS COMO DOCENTE A. Cada una termina con raise 'deshacer': lo que
--    haya cambiado se revierte, salga bien o mal.
-- ----------------------------------------------------------------------------
set local role authenticated;

do $$
declare
  informe   text := '';
  n         integer;
  m         integer;
  v         numeric;
  docente_b uuid := current_setting('aces.docente_b')::uuid;
begin
  if auth.uid() is null or public.current_docente_id() is null then
    raise exception 'No quedé dentro como el docente A: revisa el paso 1.';
  end if;
  if public.is_admin() then
    raise exception 'Estoy dentro como admin: la prueba no vale.';
  end if;

  -- 1. Ve sus 4 filas, no las 6
  select count(*) into n from public.aces_final where estudiante like 'PRUEBA %';
  informe := informe || case when n = 4 then 'OK    ' else 'FALLO ' end
    || format('| 1. Filas de prueba que ve: %s (deben ser 4, no 6)', n) || E'\n';

  -- 2. Lo que NO debe salir, no sale
  select count(*) into n from public.aces_final
   where docente_id is distinct from public.current_docente_id();
  informe := informe || case when n = 0 then 'OK    ' else 'FALLO ' end
    || format('| 2. Filas de OTRO docente que alcanza a ver: %s (deben ser 0)', n) || E'\n';

  -- 3. Cambiar el consecutivo → error del trigger
  begin
    update public.aces_final set consecutivo = 999 where anio = 2026 and consecutivo = 902;
    get diagnostics n = row_count;
    informe := informe || format('FALLO | 3. Cambió el consecutivo sin error (%s filas)', n) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm = 'deshacer' then null;
    elsif sqlerrm like 'Solo coordinación%' then
      informe := informe || 'OK    | 3. Cambiar el consecutivo → error del trigger' || E'\n';
    else
      informe := informe || format('FALLO | 3. Error, pero no el del trigger: %s', sqlerrm) || E'\n';
    end if;
  end;

  -- 4. Pasarle un acta suya a otro docente → error. Lo frenan dos capas (el
  --    trigger y el WITH CHECK de la RLS): vale cualquiera de las dos. Que el
  --    trigger exista ya lo comprueban la 3 y la 10.
  begin
    update public.aces_final set docente_id = docente_b where anio = 2026 and consecutivo = 903;
    get diagnostics n = row_count;
    informe := informe || format('FALLO | 4. Le pasó un acta a otro docente sin error (%s filas)', n) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm = 'deshacer' then null;
    elsif sqlerrm like 'Solo coordinación%' then
      informe := informe || 'OK    | 4. Pasarle un acta a otro docente → rechazado (trigger)' || E'\n';
    elsif sqlstate = '42501' then
      informe := informe || 'OK    | 4. Pasarle un acta a otro docente → rechazado (RLS)' || E'\n';
    else
      informe := informe || format('FALLO | 4. Error inesperado: %s', sqlerrm) || E'\n';
    end if;
  end;

  -- 5. Poner nota en un acta de OTRO docente → 0 filas (la RLS no da error)
  begin
    update public.aces_final set nota = 80 where anio = 2026 and consecutivo = 904;
    get diagnostics n = row_count;
    informe := informe || case when n = 0 then 'OK    ' else 'FALLO ' end
      || format('| 5. Nota en un acta de otro docente: %s filas (deben ser 0)', n) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then
      informe := informe || format('FALLO | 5. Error inesperado: %s', sqlerrm) || E'\n';
    end if;
  end;

  -- 6. Borrar un acta SUYA → 0 filas, y la fila sigue ahí
  begin
    delete from public.aces_final where anio = 2026 and consecutivo = 902;
    get diagnostics n = row_count;
    select count(*) into m from public.aces_final where anio = 2026 and consecutivo = 902;
    informe := informe || case when n = 0 and m = 1 then 'OK    ' else 'FALLO ' end
      || format('| 6. Borrar un acta suya: %s borradas (deben ser 0), la fila sigue: %s',
                n, case when m = 1 then 'sí' else 'NO' end) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then
      informe := informe || format('FALLO | 6. Error inesperado: %s', sqlerrm) || E'\n';
    end if;
  end;

  -- 7. Crear un acta → error de permisos (42501)
  begin
    insert into public.aces_final (anio, consecutivo, docente_id, grupo, area, estudiante)
    values (2026, 907, public.current_docente_id(), 'Noveno A', 'INGLES', 'PRUEBA INTRUSO');
    informe := informe || 'FALLO | 7. Creó un acta sin error' || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm = 'deshacer' then null;
    elsif sqlstate = '42501' then
      informe := informe || 'OK    | 7. Crear un acta → rechazado por la RLS' || E'\n';
    else
      informe := informe || format('FALLO | 7. Error, pero no el de permisos: %s', sqlerrm) || E'\n';
    end if;
  end;

  -- 8. Notas fuera de rango → rechazadas por el CHECK (23514)
  foreach v in array array[100.01, -1]::numeric[] loop
    begin
      update public.aces_final set nota = v where anio = 2026 and consecutivo = 902;
      informe := informe || format('FALLO | 8. Aceptó la nota %s', v) || E'\n';
      raise exception 'deshacer';
    exception when others then
      if sqlerrm = 'deshacer' then null;
      elsif sqlstate = '23514' then
        informe := informe || format('OK    | 8. Nota %s → rechazada por el CHECK', v) || E'\n';
      else
        informe := informe || format('FALLO | 8. Nota %s: error, pero no el del CHECK: %s', v, sqlerrm) || E'\n';
      end if;
    end;
  end loop;

  -- 9. Los bordes que SÍ valen: 0 y 100
  foreach v in array array[0, 100]::numeric[] loop
    begin
      update public.aces_final set nota = v where anio = 2026 and consecutivo = 902;
      get diagnostics n = row_count;
      informe := informe || case when n = 1 then 'OK    ' else 'FALLO ' end
        || format('| 9. Nota %s → %s fila (debe ser 1)', v, n) || E'\n';
      raise exception 'deshacer';
    exception when others then
      if sqlerrm <> 'deshacer' then
        informe := informe || format('FALLO | 9. Nota %s rechazada: %s', v, sqlerrm) || E'\n';
      end if;
    end;
  end loop;

  -- 10. El caso que DEBE funcionar: guarda textos y nota de su acta,
  --     y no puede falsear updated_at (el trigger lo pisa con now()).
  begin
    update public.aces_final
       set tematicas = 'prueba', desempeno_general = 'prueba', actividades = 'prueba',
           nota = 84.5, updated_at = '2000-01-01'
     where anio = 2026 and consecutivo = 902;
    get diagnostics n = row_count;
    select count(*) into m from public.aces_final
     where anio = 2026 and consecutivo = 902
       and nota = 84.5 and tematicas = 'prueba' and updated_at > '2001-01-01';
    informe := informe || case when n = 1 and m = 1 then 'OK    ' else 'FALLO ' end
      || format('| 10. Guarda textos y nota de su acta: %s fila (debe ser 1); updated_at puesto por el trigger: %s',
                n, case when m = 1 then 'sí' else 'NO' end) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then
      informe := informe || format('FALLO | 10. No pudo guardar su propia acta: %s', sqlerrm) || E'\n';
    end if;
  end;

  perform set_config('aces.informe', informe, true);
end $$;

-- ----------------------------------------------------------------------------
-- 3. COMO SQL EDITOR (auth.uid() vacío): coordinación corrige el docente
-- ----------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);

do $$
declare
  informe text := current_setting('aces.informe');
  n       integer;
begin
  if auth.uid() is not null then
    raise exception 'auth.uid() debería estar vacío en el SQL Editor';
  end if;

  begin
    update public.aces_final set docente_id = current_setting('aces.docente_b')::uuid
     where anio = 2026 and consecutivo = 903;
    get diagnostics n = row_count;
    informe := informe || case when n = 1 then 'OK    ' else 'FALLO ' end
      || format('| 11. Desde el SQL Editor se corrige el docente de un acta: %s fila (debe ser 1)', n) || E'\n';
    raise exception 'deshacer';
  exception when others then
    if sqlerrm <> 'deshacer' then
      informe := informe || format('FALLO | 11. El SQL Editor no pudo corregir el docente: %s', sqlerrm) || E'\n';
    end if;
  end;

  perform set_config('aces.informe', informe, true);
end $$;

-- ----------------------------------------------------------------------------
-- RESULTADO — 13 filas, todas OK.
-- ----------------------------------------------------------------------------
select linea as resultado
  from regexp_split_to_table(current_setting('aces.informe'), E'\n') with ordinality as t(linea, n)
 where linea <> ''
 order by n;
