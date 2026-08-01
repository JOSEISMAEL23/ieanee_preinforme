-- =====================================================================
-- 02-storage.sql — Bucket de logos y sus politicas
-- =====================================================================
-- Se ejecuta DESPUES de 00-esquema-completo.sql (necesita is_admin()).
-- El orden completo en un colegio nuevo es:
--     00-esquema-completo.sql  ->  01-semilla.sql  ->  02-storage.sql
--
-- POR QUE EXISTE ESTE ARCHIVO:
-- El dump del esquema se hace con --schema=public, pero los buckets y
-- sus politicas viven en el esquema "storage" (tablas storage.buckets y
-- storage.objects). Por eso NO viajan en 00-esquema-completo.sql.
--
-- Sin este archivo el sintoma es: se crea el bucket a mano, pero al
-- subir el logo desde /admin falla con
--     "new row violates row-level security policy"
-- porque RLS esta activo y no hay ninguna politica que permita escribir.
--
-- Detectado ejecutando el kit de verdad (ensayo del 2026-07-31).
-- Politicas copiadas TAL CUAL de produccion, no inventadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. El bucket
-- ---------------------------------------------------------------------
-- Publico: los logos se leen sin autenticacion (salen en el Header y en
-- los boletines impresos). Hacerlo por SQL evita el paso manual de
-- Storage -> New bucket, y garantiza que quede con public = true.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------
-- 2. Politicas sobre storage.objects
-- ---------------------------------------------------------------------
-- Lectura publica, escritura solo admin. Se borran primero por si el
-- script se corre dos veces (CREATE POLICY no admite IF NOT EXISTS).
-- ---------------------------------------------------------------------
drop policy if exists "logos_public_read"   on storage.objects;
drop policy if exists "logos_admin_upload"  on storage.objects;
drop policy if exists "logos_admin_update"  on storage.objects;

-- Cualquiera puede leer los logos (bucket publico).
create policy "logos_public_read"
  on storage.objects
  for select
  using (bucket_id = 'logos');

-- Solo un admin puede subir.
create policy "logos_admin_upload"
  on storage.objects
  for insert
  with check (bucket_id = 'logos' and public.is_admin());

-- Solo un admin puede reemplazar.
create policy "logos_admin_update"
  on storage.objects
  for update
  using (bucket_id = 'logos' and public.is_admin());

-- NOTA: produccion NO tiene politica de DELETE sobre este bucket, y este
-- archivo la replica tal cual. Consecuencia real: un logo no se puede
-- borrar desde la app, solo reemplazar (que es lo que hace /admin).
-- Si algun dia se quiere permitir borrarlos, agregar aqui la politica
-- equivalente para DELETE **y tambien en produccion**, para que las dos
-- instancias no diverjan.

-- =====================================================================
-- VERIFICACION — correr despues
-- =====================================================================
-- Esperado: el bucket 'logos' con public = true, y 3 politicas.
select id, name, public from storage.buckets where id = 'logos';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and policyname like 'logos%'
order by policyname;
