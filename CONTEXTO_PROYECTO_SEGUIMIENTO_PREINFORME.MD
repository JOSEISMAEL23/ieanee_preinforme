# Contexto del Proyecto — Sistema de Seguimiento Académico
### Institución Educativa Andrés Nicolás Escobar Escobar

> Este documento existe para que cualquier persona (incluyendo una IA como Claude en una sesión nueva) pueda entender el estado completo del proyecto sin tener que revisar todo el historial de la conversación original donde se construyó.

---

## 1. Qué es este proyecto

Aplicación web que reemplaza el proceso manual (Excel compartido en Drive) que usaba el colegio para que los 50 docentes marcaran con "X" qué estudiantes presentan dificultad académica en cada materia, cada periodo. El sistema consolida esa información automáticamente y genera:

- Un consolidado en pantalla y en Excel (36 grupos: Transición a 11°, letras A/B/C)
- Boletines individuales imprimibles en PDF (formato oficial del colegio, 5 estudiantes por hoja tamaño oficio/legal, pensados para cortar con tijera y entregar a cada padre)

**Desarrollador:** Ingeniero Especialista José Ismael Martínez Lozada — 316 623 0215 — ieanee.josemartinez@gmail.com
(Docente de la institución y administrador de sistemas, primer proyecto de software construido de principio a fin.)

**Intención futura:** este mismo desarrollador quiere adaptar y vender esta app a otras instituciones educativas. Ver sección 12.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite + Tailwind CSS (v4, plugin `@tailwindcss/vite`) |
| Ruteo | react-router-dom (rutas anidadas para el panel admin) |
| Backend / Base de datos | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Autenticación | Supabase Auth real (email + password), NO un sistema propio |
| Excel (import/export) | librería `xlsx` (SheetJS) |
| Hosting / Despliegue | Vercel, conectado a un repo de GitHub |
| Control de versiones | Git + GitHub |
| Íconos | `lucide-react` |

**Cuentas separadas a propósito** (para no mezclar con otros proyectos personales del desarrollador):
- Proyecto de Supabase dedicado a esta app
- Proyecto de Vercel dedicado a esta app

---

## 3. Estructura de carpetas (src/)

```
src/
├── components/
│   ├── Header.jsx          # Barra superior verde: logo, nombre institución, usuario, salir
│   ├── Layout.jsx           # Envuelve Header + contenido, usado en paneles admin y docente
│   └── ProtectedRoute.jsx   # Bloquea rutas sin sesión, redirige si debe_cambiar_password=true
├── context/
│   ├── AuthContext.jsx          # Sesión, datos del docente logueado, signIn/signOut/recargarDocente
│   └── ConfiguracionContext.jsx # Nombre institución, logo, eslogan (compartido globalmente)
├── lib/
│   └── supabase.js          # Cliente de Supabase (usa variables de entorno VITE_*)
├── pages/
│   ├── Login.jsx             # Pantalla de inicio de sesión (fondo animado, marca institucional)
│   ├── RoleRedirect.jsx      # Tras login, redirige a /admin o /docente según el rol
│   ├── CambiarPassword.jsx   # Pantalla obligatoria si debe_cambiar_password=true
│   ├── DocenteDashboard.jsx  # Panel del docente: marcar estudiantes con dificultad
│   └── admin/
│       ├── AdminDashboard.jsx      # Shell con menú lateral (responsive) + <Outlet/>
│       ├── AjustesInstitucion.jsx  # Nombre, eslogan, logo de la institución
│       ├── PeriodosAdmin.jsx       # Crear/activar periodos, fecha inicio/límite de marcación
│       ├── MateriasAdmin.jsx       # Materias por grado (manual + import Excel)
│       ├── EstudiantesAdmin.jsx    # Estudiantes por grupo (manual + import Excel + borrar todos)
│       ├── DocentesAdmin.jsx       # Crear/editar/eliminar docentes y sus asignaciones
│       ├── ConsolidadoAdmin.jsx    # Vista matriz + vista boletines + exportar Excel
│       └── BoletinesImprimir.jsx   # Página standalone (SIN sidebar/header) solo para imprimir PDF
├── App.jsx                   # Definición de todas las rutas
└── main.jsx
```

**Archivo importante fuera de `src/`:**
```
vercel.json   # rewrites necesarios para que rutas como /admin/consolidado/imprimir no den 404 en producción
```

---

## 4. Modelo de datos (Supabase / Postgres)

### Tablas

- **`grados`** — 12 filas fijas: Transición, 1° a 11°. Campos: `nombre`, `orden`, `nivel` ('primaria'|'bachillerato').
- **`grupos`** — 36 filas fijas (12 grados × letras A/B/C), generadas automáticamente por SQL al crear el esquema.
- **`materias`** — materias configurables por grado (varían: Transición usa "Dimensiones", primaria y bachillerato tienen distinto número de materias).
- **`estudiantes`** — `grupo_id`, `nombre`, `activo`.
- **`periodos`** — `nombre`, `activo` (solo uno a la vez), `fecha_inicio`, `fecha_limite` (ambas opcionales; controlan cuándo los docentes pueden marcar).
- **`docentes`** — `user_id` (referencia a `auth.users`), `nombre`, `email`, `rol` ('admin'|'docente'), `activo`, `debe_cambiar_password`.
- **`asignaciones`** — relación docente ↔ grupo ↔ materia (qué dicta cada docente).
- **`marcas`** — `periodo_id`, `estudiante_id`, `materia_id`, `dificultad` (boolean), `actualizado_por`, `updated_at`. Única por (periodo, estudiante, materia).
- **`configuracion`** — fila única (id=1): `nombre_institucion`, `eslogan`, `logo_url`.

### Funciones auxiliares (SQL)

```sql
is_admin() -- true si el usuario autenticado tiene rol='admin' en docentes
current_docente_id() -- id del docente correspondiente al usuario autenticado
marcar_password_cambiada() -- security definer, el propio usuario apaga su flag debe_cambiar_password
```

### Seguridad (RLS) — puntos clave

- Todas las tablas tienen Row Level Security activado.
- Un docente **solo** puede leer/marcar estudiantes de los grupos+materias que tiene en `asignaciones` — verificado con `EXISTS` contra `current_docente_id()`.
- Las políticas de `marcas` (insert/update) además verifican que el periodo esté `activo=true` y que la hora actual esté dentro de `fecha_inicio`/`fecha_limite` (si están definidas). El admin puede editar sin esa restricción de horario.
- Bucket de Storage `logos`: lectura pública, escritura solo admin.
- **La `service_role key` de Supabase nunca toca el frontend.** Vive únicamente dentro de la Edge Function.

---

## 5. Edge Function: `admin-docentes`

Ubicación: Supabase Dashboard → Edge Functions → `admin-docentes` (creada y editada ahí mismo, vía el editor del navegador — no se maneja con Supabase CLI local).

**Por qué existe:** crear/editar cuentas reales en `auth.users` requiere la `service_role key`, que jamás debe estar en el navegador. Esta función corre del lado del servidor, valida que quien llama sea admin (usando el JWT del que hace la petición), y ahí sí usa privilegios elevados.

**Acciones que maneja** (parámetro `accion` en el body):
- `"crear"` — crea el usuario en Auth + fila en `docentes` (con `debe_cambiar_password: true`) + sus `asignaciones`.
- `"eliminar"` — borra el usuario de Auth y la fila de `docentes` (cascada borra sus `asignaciones`; las `marcas` que ya hizo se conservan).
- `"reset_password"` — cambia la contraseña y marca `debe_cambiar_password: true`.
- `"cambiar_email"` — cambia el correo en Auth y en la tabla `docentes`.

El código completo vive en el dashboard de Supabase — si se pierde, hay que reconstruirlo (el desarrollador tiene el código guardado de la conversación original de construcción).

---

## 6. Autenticación y flujo de acceso

- **Todos** (admin y docentes) inician sesión con correo + contraseña real de Supabase Auth. No hay un login "simplificado" de solo-contraseña para el admin.
- Docentes sin correo institucional reciben uno sintético: `nombre.apellido@colegio.interno`.
- Tras crear un docente o resetear su contraseña, la próxima vez que inicie sesión se le **fuerza** a cambiarla (`/cambiar-password`) antes de dejarlo ver cualquier otra página — implementado en `ProtectedRoute.jsx`.
- Los 50 docentes importados masivamente en la puesta en marcha inicial fueron forzados a cambiar su contraseña compartida (`Docente1234`) con un `UPDATE` manual en SQL, ya que el flag se agregó después de esa importación.

---

## 7. Convenciones de diseño

- **Paleta institucional** (tomada del escudo real del colegio): azul marino, rojo vinotinto, dorado, celeste. Usada en el login. El resto de la app (Header, botones) sigue usando una paleta verde esmeralda/dorado que se definió antes de tener el escudo — **pendiente de unificar si se quiere ver 100% consistente** (ver sección 9).
- Tipografía: sistema Tailwind estándar (sans-serif), sin fuentes externas cargadas.
- Nombres de grado siempre como `"Transición"`, `"1°"`...`"11°"` internamente — pero el sistema de importación (Excel) también reconoce nombres en palabras (`"Séptimo"`, `"Once"`/`"Undécimo"`, etc.) gracias a un mapa de normalización usado en `EstudiantesAdmin.jsx` y `DocentesAdmin.jsx`.

---

## 8. Variables de entorno necesarias

En `.env.local` (desarrollo local, nunca se sube a git) y en Vercel → Settings → Environment Variables (producción):

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

**Nota:** cambiar variables de entorno en Vercel requiere un **Redeploy** manual — no se aplican solas a un deployment ya existente.

---

## 9. Estado actual / pendientes conocidos

- [x] Autenticación real + RLS completo
- [x] CRUD de materias, estudiantes, docentes (manual + import Excel masivo)
- [x] Marcado de dificultades con ventana de tiempo configurable
- [x] Consolidado (matriz + boletines imprimibles + Excel)
- [x] Cambio de contraseña forzado en primer acceso
- [x] Diseño responsive del layout general (rama `mejoras-movil`, ya fusionada a `main`)
- [x] Desplegado en producción (Vercel + Supabase)
- [ ] **Dominio propio pendiente**: se intentó conectar `seguimiento.institucioneducativaandresescobarescobar.com.co`, pero el dominio (registrado en Colombia Hosting) no tiene panel de zona DNS accesible sin plan de hosting activo. Queda pendiente un ticket de soporte con Colombia Hosting pidiendo que agreguen el registro CNAME, o acceso a la zona DNS. Mientras tanto la app vive en la URL de Vercel (`https://ieanee-preinforme.vercel.app` o el dominio `.vercel.app` que corresponda).
- [ ] **Responsividad interna incompleta**: se arregló el layout general (menú, header), pero tablas/formularios internos de Materias, Docentes y Estudiantes todavía usan anchos fijos que pueden verse apretados en celulares muy angostos.
- [ ] **CORS de la Edge Function** sigue en `*` (abierto a cualquier origen). Recomendado restringirlo al dominio real una vez esté estable.
- [ ] **Sin backups automáticos** (plan gratuito de Supabase no los incluye). Recomendación: exportar el consolidado completo a Excel al final de cada periodo como respaldo manual.
- [ ] Nota de renovación de dominio: había una factura pendiente de pago en Colombia Hosting (venció ~agosto 2026) — verificar que se haya pagado, o el dominio del colegio completo (no solo esta app) podría caerse.

---

## 10. Flujo de trabajo de desarrollo (Git)

Se adoptó el patrón de **rama de pruebas → Vercel Preview → merge a main** para cambios de riesgo (ej. rediseños):

```bash
git checkout -b nombre-de-la-mejora
# ... hacer cambios, probar local con npm run dev ...
git add .
git commit -m "Descripcion del cambio"
git push origin nombre-de-la-mejora
# Vercel genera una URL de preview automática para esa rama — probar ahí primero
git checkout main
git merge nombre-de-la-mejora
git push
# Esto SÍ despliega a producción real
```

Para cambios pequeños y de bajo riesgo (texto, un botón), se ha trabajado directo sobre `main`.

---

## 11. Cómo reactivar el proyecto después de vacaciones

Supabase pausa proyectos gratuitos tras 7 días de inactividad (no borra datos). El colegio tiene vacaciones a mitad de año y en diciembre-enero, así que es probable que el proyecto se pause en esos periodos. **Antes de que arranque cada periodo/año escolar:** entrar al dashboard de Supabase y reactivar el proyecto manualmente (toma ~30 segundos).

---

## 12. Plan a futuro: venderlo a otras instituciones

Decisión de arquitectura tomada: por ahora, **una instancia separada por colegio** (nuevo proyecto de Supabase + nuevo proyecto de Vercel, mismo código de este repositorio). Migrar a una arquitectura multi-tenant (una sola base de datos para varios colegios, con columna `institucion_id` en todas las tablas) es un rediseño serio, recomendado solo después de tener varios clientes reales y entender mejor los requisitos comunes.

**Pendiente legal** (no resuelto en este documento, requiere asesoría externa): como se procesan datos de menores de edad de instituciones que no son la propia, revisar con un abogado especializado en protección de datos (Ley 1581 de 2012 en Colombia) antes de vender a un tercero — contrato de tratamiento de datos, política de privacidad.

---

## 13. Cómo retomar este proyecto en una conversación nueva con Claude

1. Sube este archivo (`CONTEXTO_PROYECTO.md`) al inicio de la conversación.
2. Si el problema es sobre un archivo específico, sube también ese archivo `.jsx` puntual (Claude no tiene memoria del código exacto entre conversaciones distintas, solo de este resumen).
3. Describe el síntoma con capturas de pantalla cuando sea posible (funcionó muy bien durante toda la construcción original).
4. Si es una función de Supabase (Edge Function) o política RLS, ten a la mano el SQL Editor de Supabase abierto para poder ejecutar lo que se sugiera.
