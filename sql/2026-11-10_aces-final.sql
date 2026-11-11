-- ============================================================================
-- ACES FINAL — tabla aces_final + RLS + trigger
-- Proyecto: Seguimiento Académico (IE Andrés Escobar)
-- Fecha: 2026-11-10 · Spec: segundo-cerebro/OUTPUTS/spec-aces-final-2026-11-10.md §4
--
-- CÓMO USAR: Supabase Dashboard → SQL Editor → pegar TODO → Run.
-- ORDEN:     1. STAGING → 2. probar la rama → 3. PRODUCCIÓN → 4. mergear el PR.
--
-- Es solo EXPAND: una tabla nueva que nada lee todavía. Correrla en producción
-- antes del merge no cambia nada de lo que ya funciona.
--
-- Todo o nada: el SQL Editor manda el archivo de una vez y Postgres lo corre
-- como UNA transacción. Si algo falla, no queda nada a medias y la sesión
-- queda limpia. (Sin begin/commit a propósito: con begin explícito, un fallo
-- deja el editor en "current transaction is aborted" hasta un rollback.)
--
-- NO es idempotente, a propósito: si la tabla ya existe, falla en la primera
-- línea y no toca nada. Un "if not exists" aquí dejaría pasar en silencio una
-- tabla vieja con otra forma.
--
-- Requiere public.is_admin() y public.current_docente_id() (esquema base).
-- Al final sale sola una VERIFICACIÓN: compárala con la lista de abajo.
--
-- Cuatro cambios respecto al SQL del spec, cada uno por un fallo concreto:
--
--  1. El trigger deja pasar al SQL Editor (auth.uid() vacío).
--     is_admin() mira auth.uid(), que en el SQL Editor es null. Con el trigger
--     del spec, ni coordinación podría corregir AQUÍ el docente de un acta mal
--     asignada (spec §10 P2): saldría "Solo coordinación puede cambiar...".
--     auth.uid() vacío solo lo tienen el SQL Editor y service_role, que ya
--     pueden todo; anon no tiene ningún GRANT sobre esta tabla.
--
--  2. El trigger NO es security definer y fija search_path.
--     Solo compara columnas: no necesita privilegios de nadie. Una función
--     security definer sin search_path es justo lo que marca el Security
--     Advisor de Supabase (proteger_nota_minima() tiene ese defecto).
--
--  3. revoke all antes de los grant.
--     Si las default privileges viejas del proyecto siguen activas, anon
--     recibiría ALL sobre la tabla. La RLS lo frenaría igual (no hay policy
--     para anon), pero aquí la regla es que anon no tenga nada. Revocar
--     primero deja exactamente lo que dice este archivo, sea cual sea el
--     proyecto, y la verificación de abajo puede exigir una lista exacta.
--
--  4. Índice en docente_id.
--     Es el filtro de la RLS en cada lectura y lo que Postgres revisa al
--     intentar borrar un docente (ON DELETE RESTRICT).
-- ============================================================================

create table public.aces_final (
  id                bigint generated always as identity primary key,
  anio              integer not null,
  consecutivo       integer not null check (consecutivo > 0),
  docente_id        uuid    not null references public.docentes(id) on delete restrict,
  grupo             text    not null,   -- tal como lo trae Q10: 'Noveno A'
  area              text    not null,   -- tal como lo trae Q10: 'MATEMATICAS'
  estudiante        text    not null,   -- tal como lo trae Q10
  tematicas         text,
  desempeno_general text,               -- "la evidencia que debe alcanzar el estudiante"
  actividades       text,
  nota              numeric(5,2) check (nota between 0 and 100),   -- null = sin calificar
  updated_at        timestamptz not null default now(),
  unique (anio, consecutivo),
  unique (anio, grupo, estudiante, area)
);

create index aces_final_docente_id_idx on public.aces_final (docente_id);

-- ----------------------------------------------------------------------------
-- Permisos. GRANT obligatorio desde el 2026-10-30 (CLAUDE.md).
-- anon: nada, esta tabla no tiene nada público.
-- ----------------------------------------------------------------------------
alter table public.aces_final enable row level security;

revoke all on public.aces_final from anon, authenticated, service_role;
grant select, insert, update, delete on public.aces_final to authenticated, service_role;

-- Policies separadas por comando: nunca FOR ALL, que incluye DELETE.
create policy aces_final_select on public.aces_final for select to authenticated
  using (docente_id = public.current_docente_id() or public.is_admin());

create policy aces_final_update on public.aces_final for update to authenticated
  using      (docente_id = public.current_docente_id() or public.is_admin())
  with check (docente_id = public.current_docente_id() or public.is_admin());

create policy aces_final_insert_admin on public.aces_final for insert to authenticated
  with check (public.is_admin());

create policy aces_final_delete_admin on public.aces_final for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- El docente solo puede tocar lo que llena: los tres textos y la nota.
-- updated_at lo pone siempre el trigger: el docente no puede falsearlo, y el
-- spec §7 lo usa para saber si alguien cambió algo después de exportar.
-- ----------------------------------------------------------------------------
create function public.proteger_aces_final() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- auth.uid() vacío = SQL Editor o service_role: coordinación corrigiendo a mano.
  if auth.uid() is not null and not public.is_admin() and (
       new.anio        is distinct from old.anio
    or new.consecutivo is distinct from old.consecutivo
    or new.docente_id  is distinct from old.docente_id
    or new.grupo       is distinct from old.grupo
    or new.area        is distinct from old.area
    or new.estudiante  is distinct from old.estudiante) then
    raise exception 'Solo coordinación puede cambiar el estudiante, el área, el docente o el consecutivo de un acta';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger proteger_aces_final before update on public.aces_final
  for each row execute function public.proteger_aces_final();

-- ============================================================================
-- VERIFICACIÓN — sale sola al correr el archivo. Tienen que ser EXACTAMENTE
-- estas 14 filas:
--
--   grant        authenticated            DELETE, INSERT, SELECT, UPDATE
--   grant        service_role             DELETE, INSERT, SELECT, UPDATE
--                → si sale una fila de anon, está mal
--   policy       aces_final_delete_admin  DELETE to authenticated
--   policy       aces_final_insert_admin  INSERT to authenticated
--   policy       aces_final_select        SELECT to authenticated
--   policy       aces_final_update        UPDATE to authenticated
--   restriccion  aces_final_anio_consecutivo_key            UNIQUE (anio, consecutivo)
--   restriccion  aces_final_anio_grupo_estudiante_area_key  UNIQUE (anio, grupo, estudiante, area)
--   restriccion  aces_final_consecutivo_check  CHECK ((consecutivo > 0))
--   restriccion  aces_final_docente_id_fkey    FOREIGN KEY ... ON DELETE RESTRICT
--                → si no dice ON DELETE RESTRICT, está mal
--   restriccion  aces_final_nota_check         CHECK (((nota >= (0)::numeric) AND (nota <= (100)::numeric)))
--   restriccion  aces_final_pkey               PRIMARY KEY (id)
--   rls          aces_final               activada
--   trigger      proteger_aces_final      CREATE TRIGGER ... BEFORE UPDATE ...
-- ============================================================================
select 'grant' as que,
       case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as nombre,
       string_agg(a.privilege_type, ', ' order by a.privilege_type) as detalle
  from pg_class c, aclexplode(c.relacl) a
 where c.oid = 'public.aces_final'::regclass
   and a.grantee <> c.relowner
 group by a.grantee
union all
select 'policy', policyname, cmd || ' to ' || array_to_string(roles, ',')
  from pg_policies
 where schemaname = 'public' and tablename = 'aces_final'
union all
select 'restriccion', conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.aces_final'::regclass
   and contype <> 'n'   -- los NOT NULL (Postgres 18+) no hacen falta aquí
union all
select 'rls', relname, case when relrowsecurity then 'activada' else 'DESACTIVADA' end
  from pg_class
 where oid = 'public.aces_final'::regclass
union all
select 'trigger', tgname, pg_get_triggerdef(oid)
  from pg_trigger
 where tgrelid = 'public.aces_final'::regclass and not tgisinternal
order by 1, 2;
