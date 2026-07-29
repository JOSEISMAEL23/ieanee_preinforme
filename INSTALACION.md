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
| `sql/00-esquema-completo.sql` | Esquema completo: tablas, funciones, triggers y RLS | ⏳ pendiente de generar |
| `sql/01-semilla.sql` | Datos base: `grados`, `grupos`, fila `configuracion` | ⏳ pendiente de generar |
| `sql/2026-*.sql` | Migraciones históricas incrementales (referencia, ya incluidas en el esquema) | ✅ |
| `supabase/functions/admin-docentes/` | Edge Function de gestión de cuentas | ⏳ falta `index.ts` |
| `plantillas/*.xlsx` | Plantillas de importación para enviar al colegio | ✅ |

## Cómo regenerar el esquema (cuando cambie la base de datos)

```bash
npx supabase login
npx supabase link --project-ref lbenvgnrvuckkrrfylhx
npx supabase db dump -f sql/00-esquema-completo.sql --schema public
```

Pide la **contraseña de la base de datos** (no la de la cuenta). Si no la recuerdas:
Project Settings → Database → *Reset database password*. Resetearla **no rompe la app** — el
frontend usa la anon key, no esa contraseña.

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
