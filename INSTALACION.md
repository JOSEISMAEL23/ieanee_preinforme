# Instalación en una institución nueva

Guion técnico para montar esta app en un colegio distinto. Arquitectura vigente:
**1 proyecto de Supabase + 1 proyecto de Vercel + este mismo repositorio** por institución.

> Proceso completo (puertas legales, recolección de datos, capacitación y entrega):
> `segundo-cerebro/OUTPUTS/checklist-nueva-instancia-2026-07-29.md`.
> Este archivo cubre solo la parte técnica.

---

## Contenido del kit

| Ruta | Qué es | Estado |
|---|---|---|
| `sql/00-esquema-completo.sql` | Esquema completo: 17 tablas, 6 funciones, 1 trigger, 9 índices y **47 políticas RLS**. Sin datos. | ✅ |
| `sql/01-semilla.sql` | Datos base: `grados`, `grupos`, fila `configuracion`. Parametrizable por colegio. | ✅ |
| `sql/2026-*.sql` | Migraciones históricas incrementales (referencia, ya incluidas en el esquema) | ✅ |
| `supabase/functions/admin-docentes/` | Edge Function de gestión de cuentas | ⏳ falta `index.ts` |
| `plantillas/*.xlsx` | Plantillas de importación para enviar al colegio | ✅ |

## Cómo regenerar el esquema (cuando cambie la base de datos)

> ⚠️ **No uses `npx supabase db dump`**: exige Docker Desktop instalado. Se usa `pg_dump`
> directamente, que es más liviano y es la herramienta estándar.

Requiere las *Command Line Tools* de PostgreSQL 17
([postgresql.org/download/windows](https://www.postgresql.org/download/windows/) — en *Select
Components* dejar **solo** "Command Line Tools").

```bash
PGPASSWORD='LA_CONTRASEÑA_DE_LA_BD' \
"/c/Program Files/PostgreSQL/17/bin/pg_dump.exe" \
  --schema-only --schema=public --no-owner \
  -h aws-0-us-west-1.pooler.supabase.com -p 5432 \
  -U postgres.lbenvgnrvuckkrrfylhx -d postgres \
  -f sql/00-esquema-completo.sql
```

**Datos de conexión del proyecto actual** (Session pooler, IPv4):
- host `aws-0-us-west-1.pooler.supabase.com` · puerto `5432` · usuario `postgres.lbenvgnrvuckkrrfylhx`
- La contraseña de la BD se resetea en Project Settings → Database → *Reset database password*.
  Resetearla **no rompe la app** — el frontend usa la anon key, no esa contraseña.

> ⚠️ **No uses la "Direct connection" (`db.<ref>.supabase.co`)**: solo resuelve por IPv6 y falla
> en la mayoría de redes domésticas y de colegio. Siempre el **Session pooler**.

### Después de regenerar, reaplicar SIEMPRE estos dos ajustes

`pg_dump` genera dos cosas que el **SQL Editor de Supabase rechaza**:

1. Las líneas `\restrict` y `\unrestrict` (metacomandos de psql) → **borrarlas**. Si no, falla en
   la primera línea con un error de sintaxis desconcertante.
2. `CREATE SCHEMA public;` → **comentarla**. Ese esquema ya existe en cualquier proyecto nuevo.

> Repite este dump **cada vez que cambies el esquema en producción**, o el kit queda desfasado
> y el próximo colegio nacerá con una base de datos incompleta.

---

## Pasos en el colegio nuevo

### 1. Supabase

1. **New project** → nombre `seguimiento-NOMBRECOLEGIO`, región **East US (North Virginia)**,
   guardar la contraseña generada.
2. **SQL Editor** → pegar `sql/00-esquema-completo.sql` → **Run**.
3. **SQL Editor** → ajustar `sql/01-semilla.sql` a los grados/grupos reales del colegio → **Run**.
4. **Authentication → Policies**: verificar que **ninguna** tabla diga *"RLS is not enabled"*.
5. **Edge Functions** → crear `admin-docentes` (ver su README) → **Deploy**.
6. Crear el primer admin (ver abajo).
7. **Project Settings → API**: copiar **Project URL** y **anon key**.
   ⚠️ La `service_role` key **no** se copia a ningún lado.

### 2. Primer usuario administrador

La Edge Function exige que quien la llame ya sea admin, y todavía no hay ninguno. El primero se
crea a mano:

1. **Authentication → Users → Add user → Create new user**.
2. Correo del admin + contraseña temporal.
3. ✅ **Marcar "Auto Confirm User"** — sin esto el usuario **no podrá iniciar sesión nunca**.
4. Copiar el **UUID** del usuario creado.
5. SQL Editor:

```sql
insert into docentes (user_id, nombre, email, rol, activo, debe_cambiar_password, cargo)
values (
  'UUID_DEL_PASO_4',
  'Nombre Completo Del Admin',
  'correo@delcolegio.edu.co',
  'admin',
  true,
  true,
  'Administrador'
);
```

6. Verificar:

```sql
select d.nombre, d.rol, u.email_confirmed_at
from docentes d join auth.users u on u.id = d.user_id
where d.rol = 'admin';
```

`email_confirmed_at` **no** debe ser nulo.

### 3. Vercel

1. **Add New → Project** → importar este mismo repositorio.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. **Environment Variables** — antes del primer deploy:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. **Deploy**.

> ⚠️ Cambiar una variable **después** de un deploy no la aplica sola:
> Deployments → `···` → **Redeploy**.

### 4. Verificación mínima

- [ ] Carga el Login.
- [ ] El admin entra y es forzado a cambiar la contraseña.
- [ ] `/admin/consolidado/imprimir` no da 404 (rewrites de `vercel.json`).
- [ ] Forzar *Traducir…* en Chrome **no traduce** los nombres (`lang="es"` + `notranslate`).
- [ ] Un docente de prueba ve **solo** sus grupos asignados (verificación de RLS).

---

## ⚠️ Este repositorio despliega a TODOS los colegios

Cada proyecto de Vercel apunta al mismo repo: **un push a `main` despliega a todas las
instituciones a la vez**. Ningún cambio va a `main` sin haberse probado antes en un Vercel
Preview.

## Tipos de `id` (para no romper foreign keys)

| Columna | Tipo |
|---|---|
| `estudiantes.id`, `asignaciones.id`, `periodos.id` | `integer` |
| `docentes.id`, `asignaciones.docente_id` | `uuid` |

Lo que apunte a estudiantes/asignaciones/periodos → `integer`; lo que guarde un docente → `uuid`.
