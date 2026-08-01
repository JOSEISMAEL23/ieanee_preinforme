# Edge Function `admin-docentes`

✅ **Código versionado en `index.ts`** (rescatado del dashboard el 2026-07-29). Antes vivía
únicamente dentro del dashboard de Supabase: si esa cuenta se perdía, se perdía el código.

> ⚠️ **`index.ts` debe reflejar exactamente lo que está desplegado.** Si editas la función desde
> el dashboard, copia el cambio también a este archivo — si divergen, el próximo colegio se monta
> con una versión distinta a la de producción y nadie lo va a notar hasta que falle.

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

## Cómo desplegarla en un colegio nuevo

Dashboard del proyecto nuevo → **Edge Functions** → **Create a new function** →
nombre exacto **`admin-docentes`** → pegar el contenido de `index.ts` → **Deploy**.

> El nombre debe ser exacto: el frontend la invoca por ese nombre.

**Claves:** Supabase inyecta la `service_role key` sola como variable de entorno del proyecto.
No hay que pegarla en ningún archivo.

**CORS:** actualmente en `*` (abierto). Restringir al dominio real de cada colegio una vez esté
estable.
