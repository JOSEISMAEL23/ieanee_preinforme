# Edge Function `admin-docentes`

⚠️ **FALTA EL CÓDIGO.** Hoy esta función vive **únicamente** en el dashboard de Supabase del
proyecto de producción. Si esa cuenta se pierde o se borra el proyecto, **el código se pierde**.

## Qué hace

Crea/edita cuentas reales en `auth.users`, lo que exige la `service_role key` — que jamás puede
estar en el navegador. Esta función corre del lado del servidor, valida con el JWT que quien la
llama sea admin, y solo entonces usa privilegios elevados.

Acciones (parámetro `accion` en el body):

| Acción | Efecto |
|---|---|
| `crear` | Usuario en Auth + fila en `docentes` (`debe_cambiar_password: true`) + sus `asignaciones` |
| `eliminar` | Borra el usuario de Auth y su fila de `docentes` (cascada borra `asignaciones`; las `marcas` se conservan) |
| `reset_password` | Cambia la contraseña y marca `debe_cambiar_password: true` |
| `cambiar_email` | Cambia el correo en Auth y en `docentes` |

## Cómo traer el código hasta acá (hacerlo una sola vez)

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto de producción.
2. Menú lateral → **Edge Functions** → clic en **`admin-docentes`**.
3. Abre el editor de código, selecciona todo (Ctrl+A) y copia (Ctrl+C).
4. Crea `index.ts` **en esta misma carpeta** y pega el contenido.
5. Commit. Borra la advertencia de arriba de este archivo.

## Cómo desplegarla en un colegio nuevo

Dashboard del proyecto nuevo → **Edge Functions** → **Create a new function** →
nombre exacto **`admin-docentes`** → pegar el contenido de `index.ts` → **Deploy**.

> El nombre debe ser exacto: el frontend la invoca por ese nombre.

**Claves:** Supabase inyecta la `service_role key` sola como variable de entorno del proyecto.
No hay que pegarla en ningún archivo.

**CORS:** actualmente en `*` (abierto). Restringir al dominio real de cada colegio una vez esté
estable.
