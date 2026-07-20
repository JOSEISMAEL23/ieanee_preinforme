# Guía Técnica Completa — Sistema de Seguimiento Académico
### Para José Ismael Martínez Lozada — Ingeniero Especialista

> Este documento complementa `CONTEXTO_PROYECTO.md`. Mientras ese archivo es el "qué existe y en qué estado está", este es el "cómo funciona todo por dentro y cómo seguir creciendo como desarrollador con este stack".

---

## PARTE 1: Qué hace cada archivo y cómo interactúa con los demás

---

### `src/main.jsx`
**Qué hace:** Es el punto de entrada real de la aplicación. Cuando el navegador carga la app, este es el primer archivo que se ejecuta. Su único trabajo es montar el componente raíz (`App`) dentro del `div#root` que está en `index.html`.

**Interactúa con:** `App.jsx` directamente. No hace casi nada más — es solo el "enchufe" que conecta React con el HTML.

```jsx
// Lo que hace en esencia:
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

---

### `src/App.jsx`
**Qué hace:** Define TODAS las rutas de la aplicación — es el "mapa" que le dice a React qué página mostrar según la URL del navegador. También envuelve toda la app con los Providers globales (`AuthProvider`, `ConfiguracionProvider`) para que cualquier componente hijo pueda acceder a la sesión y a la configuración institucional.

**Interactúa con:**
- `AuthContext.jsx` — lo envuelve para dar acceso a la sesión en toda la app
- `ConfiguracionContext.jsx` — lo envuelve para dar acceso al nombre/logo en toda la app
- `ProtectedRoute.jsx` — lo usa para proteger las rutas que requieren autenticación
- Todas las páginas (`Login`, `AdminDashboard`, `DocenteDashboard`, etc.) — las importa y las asigna a rutas

**Concepto clave:** Las rutas de `/admin` son **rutas anidadas** — `AdminDashboard` es el "shell" (el contenedor con el menú), y las páginas internas (`AjustesInstitucion`, `MateriasAdmin`, etc.) se renderizan dentro de él a través de `<Outlet/>`. Esto es lo que hace que el menú lateral siempre esté visible mientras cambias de sección.

---

### `src/lib/supabase.js`
**Qué hace:** Crea y exporta el cliente de Supabase — el objeto que permite hablar con la base de datos, la autenticación y el storage. Es un singleton (se crea una sola vez y se reutiliza en toda la app).

**Interactúa con:** Casi todos los demás archivos lo importan. Es el "puente" entre tu código React y tu base de datos en la nube.

**Concepto clave:** Las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se leen aquí. `VITE_` es obligatorio al inicio del nombre porque Vite solo expone variables con ese prefijo al código del navegador.

---

### `src/context/AuthContext.jsx`
**Qué hace:** Maneja todo lo relacionado con la sesión del usuario. Expone:
- `session` — el objeto de sesión de Supabase (incluye el JWT/token)
- `docente` — los datos del usuario logueado (nombre, rol, debe_cambiar_password, etc.)
- `loading` — true mientras espera saber si hay sesión activa
- `signIn(email, password)` — inicia sesión
- `signOut()` — cierra sesión
- `recargarDocente()` — recarga los datos del docente desde la BD (usado después de cambiar contraseña)

**Interactúa con:**
- `supabase.js` — para escuchar cambios de sesión y cargar datos del docente
- `App.jsx` — lo envuelve con `AuthProvider`
- Casi todas las páginas — las usan con el hook `useAuth()`

**Concepto clave:** Usa `supabase.auth.onAuthStateChange()` — un listener que dispara cada vez que la sesión cambia (login, logout, expiración del token). Esto es lo que hace que la app "sepa" automáticamente si alguien cerró sesión en otra pestaña.

---

### `src/context/ConfiguracionContext.jsx`
**Qué hace:** Carga desde Supabase la fila de configuración institucional (nombre, eslogan, logo_url) y la expone globalmente. También expone `recargar()` para que cuando el admin guarde cambios, el Header se actualice instantáneamente sin recargar la página.

**Interactúa con:**
- `supabase.js` — para leer la tabla `configuracion`
- `App.jsx` — lo envuelve con `ConfiguracionProvider`
- `Header.jsx` — lee `config.nombre_institucion` y `config.logo_url`
- `Login.jsx` — lee `config.nombre_institucion`, `config.eslogan` y `config.logo_url`
- `AjustesInstitucion.jsx` — lee y escribe la configuración, llama `recargar()` al guardar
- `ConsolidadoAdmin.jsx` y `BoletinesImprimir.jsx` — leen `config.logo_url` para el boletín

**Por qué es un Context y no solo un hook:** Si fuera un hook simple (`useConfiguracion`), cada componente que lo usara haría su propia llamada a Supabase y tendría su propia copia del estado. Usando Context, hay una sola fuente de verdad compartida — cuando el admin cambia el nombre y llama `recargar()`, tanto el Header como cualquier otro componente ven el cambio al mismo tiempo.

---

### `src/components/ProtectedRoute.jsx`
**Qué hace:** Un "guardia" de seguridad en el nivel de React. Verifica tres cosas antes de dejar pasar a una página:
1. ¿Hay sesión activa? Si no → redirige a `/` (login)
2. ¿El usuario tiene `debe_cambiar_password = true`? Si sí → redirige a `/cambiar-password`
3. ¿El rol del usuario coincide con el `rolRequerido` de la ruta? Si no → redirige a `/redirect`

**Interactúa con:**
- `AuthContext.jsx` — lee `docente` y `loading`
- `App.jsx` — se usa como envoltorio de cada ruta protegida

**Importante:** Esto solo es una protección en el navegador (experiencia de usuario). La seguridad real está en las políticas RLS de Supabase — aunque alguien saltara esta protección de React, la base de datos rechazaría peticiones no autorizadas.

---

### `src/components/Header.jsx`
**Qué hace:** La barra verde superior que aparece en todas las páginas después del login. Muestra el logo, el nombre de la institución, el nombre y rol del usuario logueado, y el botón "Salir".

**Interactúa con:**
- `AuthContext.jsx` — lee `docente.nombre`, `docente.rol`, y usa `signOut()`
- `ConfiguracionContext.jsx` — lee `config.logo_url` y `config.nombre_institucion`

**Nota de diseño:** Tiene la clase `no-print` que lo oculta al imprimir. Esto es crítico para que el PDF de boletines salga limpio (sin la barra verde arriba).

---

### `src/components/Layout.jsx`
**Qué hace:** Un componente "envoltorio" muy simple. Pone el `Header` arriba y debajo monta el contenido que se le pase como `children`, con el fondo gris claro y el padding correcto. Lo usan tanto el panel admin como el panel del docente.

**Interactúa con:** `Header.jsx` directamente. Todas las páginas lo usan como contenedor.

---

### `src/pages/Login.jsx`
**Qué hace:** La primera pantalla que ve cualquier usuario. Muestra el fondo animado con los colores institucionales (azul marino, rojo vinotinto, dorado), el logo, nombre y eslogan del colegio, el formulario de correo + contraseña, y el crédito del desarrollador al pie.

**Interactúa con:**
- `AuthContext.jsx` — usa `signIn()` para iniciar sesión
- `ConfiguracionContext.jsx` — lee los datos institucionales para mostrarlos
- Al hacer login exitoso → navega a `/redirect`

---

### `src/pages/RoleRedirect.jsx`
**Qué hace:** Una página "transparente" que nadie ve realmente — solo detecta el rol del usuario logueado y lo manda al lugar correcto: `/admin` si es admin, `/docente` si es docente.

**Interactúa con:** `AuthContext.jsx` — lee `docente.rol`.

---

### `src/pages/CambiarPassword.jsx`
**Qué hace:** Formulario de cambio de contraseña obligatorio. Aparece la primera vez que un docente nuevo inicia sesión (o cuando el admin le resetea la contraseña). No puede saltarse — `ProtectedRoute` lo intercepta.

**Interactúa con:**
- `supabase.js` — usa `supabase.auth.updateUser({ password: nueva })` (el propio usuario cambia su contraseña)
- `supabase.js` — llama a la función SQL `marcar_password_cambiada()` via `supabase.rpc()`
- `AuthContext.jsx` — llama `recargarDocente()` para que `debe_cambiar_password` se actualice en memoria y `ProtectedRoute` deje pasar

---

### `src/pages/DocenteDashboard.jsx`
**Qué hace:** El panel principal del docente. Muestra el periodo activo (con fechas de inicio y límite), un selector de grupo+materia (si tiene más de una asignación), la lista de estudiantes del grupo, y permite marcar/desmarcar con un clic. Guarda automáticamente en Supabase con cada clic. Bloquea la marcación si el periodo no ha iniciado o ya cerró.

**Interactúa con:**
- `AuthContext.jsx` — lee `docente.id` para saber de quién cargar asignaciones
- `supabase.js` — lee `periodos`, `asignaciones`, `estudiantes`, `marcas`
- `supabase.js` — escribe en `marcas` usando `upsert` (inserta o actualiza si ya existe)
- `Layout.jsx` — como contenedor visual

---

### `src/pages/admin/AdminDashboard.jsx`
**Qué hace:** El "shell" del panel de administración. Contiene el menú de navegación lateral (en desktop) o horizontal deslizable (en móvil) y el `<Outlet/>` donde se renderizan las secciones internas según la URL.

**Interactúa con:**
- `Layout.jsx` — como contenedor visual
- Todas las páginas admin — a través de `<Outlet/>` de react-router-dom

---

### `src/pages/admin/AjustesInstitucion.jsx`
**Qué hace:** Permite al admin cambiar el nombre de la institución, el eslogan (que aparece en el login) y subir el logo (se sube al Storage de Supabase en el bucket `logos`).

**Interactúa con:**
- `supabase.js` — actualiza la tabla `configuracion` y sube archivos a Storage
- `ConfiguracionContext.jsx` — llama `recargar()` después de guardar para que Header/Login se actualicen

---

### `src/pages/admin/PeriodosAdmin.jsx`
**Qué hace:** CRUD de periodos académicos. Permite crear un periodo nuevo (con nombre, fecha de inicio opcional y fecha límite opcional), activarlo, y editar las fechas de uno existente. El periodo activo es el que ven los docentes para marcar.

**Interactúa con:** `supabase.js` — lee/escribe la tabla `periodos`.

---

### `src/pages/admin/MateriasAdmin.jsx`
**Qué hace:** Configura las materias de cada grado. Permite agregar una por una, varias separadas por coma, o importar masivamente desde un Excel (columnas: `Grado` y `Materia`). También permite eliminar materias individuales.

**Interactúa con:** `supabase.js` — lee/escribe la tabla `materias`.

---

### `src/pages/admin/EstudiantesAdmin.jsx`
**Qué hace:** Gestiona los estudiantes por grupo. Permite agregar uno por uno, importar desde Excel (columnas: `Grupo` y `Nombre`), y borrar todos los estudiantes de todos los grupos de una vez (con confirmación de texto para evitar borrados accidentales). El importador reconoce nombres de grado tanto en números (`7°`) como en palabras (`Séptimo`, `Once`, `Undécimo`).

**Interactúa con:** `supabase.js` — lee/escribe las tablas `grados`, `grupos`, `estudiantes`.

---

### `src/pages/admin/DocentesAdmin.jsx`
**Qué hace:** El más complejo del panel admin. Permite:
- Crear un docente (llama a la Edge Function, no directo a Supabase)
- Importar docentes masivamente desde Excel
- Ver lista de docentes con sus asignaciones expandibles
- Editar nombre de un docente (UPDATE directo a la tabla)
- Cambiar correo (llama Edge Function)
- Resetear contraseña (llama Edge Function, marca `debe_cambiar_password=true`)
- Eliminar docente (llama Edge Function)
- Quitar una asignación individual (DELETE directo a `asignaciones`)

**Interactúa con:**
- `supabase.functions.invoke('admin-docentes', ...)` — para operaciones que requieren `service_role`
- `supabase.js` — para la lista de docentes, asignaciones, grados, materias

---

### `src/pages/admin/ConsolidadoAdmin.jsx`
**Qué hace:** Vista central para el administrador. Tiene dos modos:
- **Vista matriz**: tabla con estudiantes en filas y materias en columnas, X donde hay dificultad
- **Vista boletines**: previsualización del formato imprimible, solo estudiantes con al menos una X

Botones: "Imprimir/Guardar PDF" (abre `BoletinesImprimir` en pestaña nueva), "Exportar este grupo (Excel)", "Exportar los 36 grupos (Excel)".

**Interactúa con:**
- `supabase.js` — lee `periodos`, `grados`, `grupos`, `materias`, `estudiantes`, `marcas`
- `ConfiguracionContext.jsx` — lee `config.logo_url` y `config.nombre_institucion` para los boletines
- `BoletinesImprimir.jsx` — la "abre" con `window.open(url, '_blank')`

---

### `src/pages/admin/BoletinesImprimir.jsx`
**Qué hace:** Página completamente aislada (SIN Header, SIN Layout, SIN menú) que solo contiene los boletines. Lee los parámetros de la URL (`?periodo=X&grado=Y&letra=Z`), carga los datos de Supabase, construye el HTML de los boletines y dispara `window.print()` automáticamente al terminar de cargar.

Usa estilos CSS inline (no Tailwind) porque necesita un control preciso del layout en papel — Tailwind en `@media print` a veces tiene comportamientos inesperados.

**Interactúa con:**
- `supabase.js` — carga todos los datos que necesita directamente (sin pasar por Context ni Auth)
- Es abierto por `ConsolidadoAdmin.jsx` como ventana nueva

**Por qué es una página separada y no un modal o un componente:** Si fuera parte del mismo DOM que el panel admin, el Header, el menú lateral y todos los botones de la interfaz podrían colarse en el PDF aunque se ocultaran con `display:none`. Al ser una página totalmente separada, la garantía es absoluta.

---

## PARTE 2: Flujo completo de la app paso a paso

---

### Flujo 1: Primera vez que un usuario carga la app

```
1. Navegador pide la URL (ej. ieanee-preinforme.vercel.app)
2. Vercel sirve index.html + los archivos JS compilados
3. React se monta → main.jsx renderiza <App/>
4. App.jsx renderiza: AuthProvider > ConfiguracionProvider > BrowserRouter > Routes
5. AuthContext inicia:
   - Llama supabase.auth.getSession() para ver si hay sesión guardada
   - Si no hay sesión → docente = null, loading = false
   - Si hay sesión → carga el docente de la tabla 'docentes' usando su user_id
6. ConfiguracionContext inicia:
   - Llama a Supabase para cargar la tabla 'configuracion' (nombre, logo, eslogan)
7. URL es "/" → se renderiza Login.jsx
   - Muestra el logo y nombre (ya disponibles porque ConfiguracionContext los cargó)
   - Espera que el usuario escriba correo y contraseña
```

---

### Flujo 2: Login exitoso (admin)

```
1. Usuario escribe correo/contraseña y da clic en "Entrar"
2. Login.jsx llama signIn(email, password) del AuthContext
3. AuthContext llama supabase.auth.signInWithPassword()
4. Supabase verifica las credenciales → responde con session + user
5. onAuthStateChange dispara (está escuchando todo el tiempo)
6. AuthContext llama loadDocente(user.id):
   - Busca en la tabla 'docentes' donde user_id = user.id
   - Carga: nombre, rol, debe_cambiar_password, etc.
7. Login.jsx detecta que no hubo error → navega a /redirect
8. RoleRedirect.jsx lee docente.rol:
   - Si 'admin' → navega a /admin
   - Si 'docente' → navega a /docente
9. ProtectedRoute verifica:
   - ¿Hay docente? Sí ✓
   - ¿debe_cambiar_password? No ✓ (el admin nunca tiene este flag)
   - ¿Rol coincide con 'admin'? Sí ✓
   → Deja pasar → renderiza AdminDashboard
10. AdminDashboard muestra el menú + la sección por defecto (AjustesInstitucion, ruta index)
```

---

### Flujo 3: Login de un docente nuevo (primer acceso)

```
1-6. (Igual que el flujo de admin hasta cargar el docente)
7. Login.jsx navega a /redirect
8. RoleRedirect lee docente.rol = 'docente' → navega a /docente
9. ProtectedRoute verifica:
   - ¿Hay docente? Sí ✓
   - ¿debe_cambiar_password? SÍ ← aquí cambia el flujo
   → Redirige a /cambiar-password (en vez de dejar pasar al panel)
10. CambiarPassword.jsx se renderiza:
    - Muestra formulario para la nueva contraseña
    - Al guardar: llama supabase.auth.updateUser({ password: nueva })
    - Llama supabase.rpc('marcar_password_cambiada') → pone false en la BD
    - Llama recargarDocente() → actualiza el docente en memoria (debe_cambiar_password ahora = false)
    - Navega a /redirect
11. RoleRedirect vuelve a correr → ahora sí llega a /docente sin obstáculos
```

---

### Flujo 4: Un docente marca un estudiante

```
1. Docente está en DocenteDashboard, ve la lista del grupo 9°B - Tecnología
2. Hace clic en un estudiante
3. toggle(estudiante_id) se ejecuta:
   a. Actualiza el estado local inmediatamente (la X aparece/desaparece al instante, sin esperar a Supabase)
   b. Llama supabase.from('marcas').upsert({ periodo_id, estudiante_id, materia_id, dificultad: nuevoValor, actualizado_por: docente.id })
   c. Si Supabase responde con error (ej. el plazo ya cerró → RLS rechaza):
      - Revierte el estado local a como estaba antes
      - Muestra un mensaje de error
   d. Si Supabase responde bien → la marca queda guardada permanentemente
4. El contador "X con dificultad" se actualiza automáticamente (es un Object.values(marcados).filter(Boolean).length en el render)
```

---

### Flujo 5: El admin genera un PDF de boletines

```
1. Admin va a Consolidado → selecciona periodo, grado y letra → vista "Boletines"
2. Ve la previsualización en pantalla
3. Hace clic en "Imprimir / Guardar PDF (boletines)"
4. ConsolidadoAdmin llama window.open('/admin/consolidado/imprimir?periodo=1&grado=5&letra=A', '_blank')
5. El navegador abre una pestaña nueva con esa URL
6. Vercel recibe la petición → lee vercel.json → ve la regla de rewrite → sirve index.html
7. React se monta en la pestaña nueva → detecta la ruta /admin/consolidado/imprimir
8. ProtectedRoute verifica que hay sesión (Supabase guarda la sesión en localStorage del navegador, compartida entre pestañas del mismo dominio)
9. BoletinesImprimir.jsx se renderiza:
   a. Lee los query params de la URL (periodo=1, grado=5, letra=A)
   b. Hace TODAS las consultas a Supabase que necesita (configuracion, periodo, grado, grupo, materias, estudiantes, marcas)
   c. Filtra solo los estudiantes con al menos una dificultad marcada
   d. Construye el HTML de los boletines (grupos de 5)
   e. setTimeout(() => window.print(), 400) → espera un momento a que el DOM esté listo → dispara el diálogo de impresión
10. El usuario elige "Guardar como PDF" y elige tamaño de página "Legal/Oficio"
```

---

### Flujo 6: El admin crea un docente nuevo

```
1. Admin llena el formulario en DocentesAdmin: nombre, contraseña, correo, asignaciones
2. NuevoDocenteForm llama guardar()
3. guardar() llama supabase.functions.invoke('admin-docentes', { body: { accion: 'crear', ... } })
4. Supabase envía la petición a la Edge Function con el JWT del admin en el header
5. La Edge Function (código Deno en los servidores de Supabase) recibe la petición:
   a. Verifica que el JWT es válido y que el usuario tiene rol='admin' en la tabla docentes
   b. Si pasa → usa supabaseAdmin (con service_role key) para:
      - Crear el usuario en auth.users con email_confirm: true
      - Insertar una fila en docentes con debe_cambiar_password: true
      - Insertar las filas en asignaciones
   c. Responde con { ok: true, docente: {...} }
6. DocentesAdmin recibe la respuesta → llama cargarDocentes() → la lista se actualiza
```

---

## PARTE 3: Conceptos clave del stack para seguir creciendo

---

### Sobre React

**Estado (useState) vs Props vs Context — cuándo usar cada uno:**

| Necesidad | Solución |
|---|---|
| Dato que cambia y solo lo usa un componente | `useState` dentro de ese componente |
| Dato que un padre pasa a un hijo | Props |
| Dato que muchos componentes en distintos niveles necesitan | Context (`createContext` + `useContext`) |
| Dato del servidor que varios necesitan a la vez | Context que hace la petición y comparte el resultado |

En este proyecto: `docente` y `config` son Context porque los usan Header, ProtectedRoute, DocenteDashboard, ConsolidadoAdmin y más — pasarlos como props sería un caos.

**useEffect — el más importante y el más confuso:**
```jsx
useEffect(() => {
  // Código que se ejecuta DESPUÉS de que el componente se renderiza
  cargarDatos()
}, [gradoId, letra]) // ← dependencias: se vuelve a ejecutar cuando estos cambian
```
La lista de dependencias vacía `[]` significa "solo la primera vez". Sin el arreglo, se ejecutaría en CADA render (rara vez lo que quieres).

**Por qué upsert en vez de insert para las marcas:**
Un docente puede hacer clic varias veces en el mismo estudiante. La primera vez no existe esa fila → `insert`. Las siguientes veces ya existe → `update`. `upsert` maneja ambos casos automáticamente con `onConflict`.

---

### Sobre Supabase

**Row Level Security (RLS) — el concepto más importante:**
Imagina que la base de datos tiene un guardia en cada tabla que pregunta "¿quién eres y qué quieres hacer?". Las políticas son las instrucciones que le das a ese guardia. Si no hay política que permita algo → se deniega automáticamente. El cliente de Supabase en el navegador (con la `anon key`) respeta esas políticas. El cliente con `service_role key` (solo en Edge Functions) las ignora.

**`security definer` en funciones SQL:**
Cuando una función tiene `security definer`, se ejecuta con los permisos de quien la creó (normalmente postgres, el superusuario), no con los permisos del usuario que la llama. Es lo que permite que `marcar_password_cambiada()` haga un UPDATE en la tabla `docentes` aunque la política RLS no se lo permitiría directamente al docente.

**Cuándo usar Edge Functions vs el cliente de Supabase directo:**
- **Cliente directo** (en React): cuando RLS puede proteger la operación. Leer datos, escribir marcas, actualizar configuración.
- **Edge Function**: cuando necesitas la `service_role key` (crear usuarios en Auth, leer filas de otros usuarios, hacer operaciones que RLS bloquearía).

**La diferencia entre `.eq()` y `.in()`:**
```javascript
// .eq(): filtra donde una columna IGUAL A un valor
.eq('periodo_id', 1)

// .in(): filtra donde una columna está EN una lista de valores
.in('estudiante_id', [101, 102, 103, 104])
```

**`.single()` vs `.maybeSingle()`:**
- `.single()` → espera exactamente 1 resultado; lanza error si hay 0 o más de 1
- `.maybeSingle()` → devuelve null si no hay resultado (no lanza error)

---

### Sobre el enrutamiento (react-router-dom)

**Rutas anidadas y `<Outlet/>`:**
Cuando tienes una ruta padre que contiene rutas hijas, el componente padre necesita un `<Outlet/>` para decir "aquí es donde se renderiza el componente hijo según la URL". Sin el Outlet, los hijos no aparecen aunque la URL cambie.

```jsx
// En App.jsx
<Route path="/admin" element={<AdminDashboard />}>
  <Route index element={<AjustesInstitucion />} /> // /admin
  <Route path="materias" element={<MateriasAdmin />} /> // /admin/materias
</Route>

// En AdminDashboard.jsx
<div className="contenedor">
  <nav>...</nav>
  <Outlet /> {/* ← AjustesInstitucion o MateriasAdmin se renderizan aquí */}
</div>
```

**`<Route index>` vs `<Route path="algo">`:**
La ruta con `index` se activa cuando la URL es exactamente el path del padre (sin nada más). Es la "página por defecto" cuando entras a `/admin`.

**`<NavLink>` vs `<Link>`:**
`NavLink` agrega automáticamente una clase `active` cuando su URL coincide con la URL actual. Es lo que hace que el ítem del menú se resalte. `Link` es lo mismo pero sin ese comportamiento.

---

### Sobre Vite y el proceso de build

**¿Qué pasa cuando ejecutas `npm run build`?**
Vite toma todos tus archivos `.jsx`, `.js`, `.css` y los transforma en unos pocos archivos optimizados que el navegador puede cargar muy rápido:
- Todo el JS de React + tu código → 1-2 archivos `.js` (minimizados, sin espacios, nombres de variables acortados)
- Todo el CSS → 1 archivo `.css`
- El resultado va a la carpeta `dist/`

Vercel ejecuta este proceso automáticamente cada vez que detecta un push a `main`.

**Por qué `VITE_` en las variables de entorno:**
Vite tiene una característica de seguridad: solo expone al navegador las variables de entorno que empiezan con `VITE_`. Así evita que secretos del servidor (como claves de base de datos) se filtren al código que el usuario puede ver.

---

### Sobre Git y el flujo de trabajo

**El flujo de ramas que adoptamos:**
```bash
git checkout -b nombre-mejora  # crea y cambia a la nueva rama
# ... hacer cambios ...
git add .
git commit -m "Descripción clara de qué cambió y por qué"
git push origin nombre-mejora  # sube la rama a GitHub (Vercel crea Preview URL)
# ... probar en la Preview URL ...
git checkout main
git merge nombre-mejora  # trae los cambios a main
git push                 # esto SÍ despliega a producción
git branch -d nombre-mejora  # limpieza opcional
```

**Por qué commits con mensajes descriptivos:**
```bash
# Mal:
git commit -m "cambios"
git commit -m "fix"

# Bien:
git commit -m "Forzar cambio de contraseña en primer acceso del docente"
git commit -m "Agregar fecha límite de marcación por periodo"
```
Cuando en 6 meses algo deje de funcionar, los mensajes de commit son el rastro que te dice qué cambió y cuándo.

---

### Sobre CSS y Tailwind

**Por qué algunos componentes mezclan Tailwind con `style={{}}`:**
Tailwind tiene clases predefinidas (`text-sm`, `rounded-lg`, etc.), pero hay valores que no están en esa lista predefinida (colores específicos del escudo del colegio como `#7C2529`, tamaños de grid exactos). Para esos, se usa el atributo `style={{}}` directamente en el JSX.

**`@media print` — cómo funciona la impresión:**
```css
@media print {
  .no-print { display: none !important; }
}
```
Cuando el usuario elige "Imprimir" o "Guardar como PDF", el navegador aplica estas reglas en vez de las normales. `!important` es necesario para asegurarse de que esta regla gana sobre cualquier otra que también pueda afectar ese elemento.

**`page-break-inside: avoid`:**
Le dice al navegador/PDF "nunca cortes este elemento en medio de una página". Es lo que evita que un boletín aparezca partido (mitad en una hoja, mitad en la siguiente).

---

## PARTE 4: Errores comunes y cómo resolverlos

---

### Error: pantalla en blanco al abrir la app

**Causa más probable:** un error de JavaScript está bloqueando toda la app.
**Qué hacer:** Abrir DevTools (F12) → pestaña Console → ver el error rojo → buscar el archivo y línea que menciona.

---

### Error: 404 al navegar directo a una URL (ej. `/admin/docentes`)

**Causa:** Vercel no tiene la regla de rewrite configurada.
**Solución:** Verificar que existe el archivo `vercel.json` en la raíz del proyecto con el contenido correcto (ver CONTEXTO_PROYECTO.md).

---

### Error: "Correo o contraseña incorrectos" cuando sí son correctos

**Causas posibles:**
1. La `VITE_SUPABASE_URL` en `.env.local` tiene un pedazo extra (`/rest/v1/` al final)
2. El usuario existe en Auth pero no tiene fila en la tabla `docentes` (falta el registro)
3. La contraseña fue cambiada directo en la BD sin actualizar Auth (o viceversa)

---

### Error: las marcas no se guardan (o se guardan y se pierden)

**Qué revisar:**
1. ¿El periodo tiene `activo = true`?
2. ¿La hora actual está dentro de `fecha_inicio` y `fecha_limite`?
3. ¿El docente tiene una `asignación` para ese grupo + materia? (RLS lo rechazaría si no)
4. Abrir DevTools → Network → buscar la petición a Supabase → ver la respuesta exacta

---

### Error: al importar Excel no se reconocen los grados

**Causa:** El nombre del grado en el Excel no coincide exactamente con ninguna de las palabras del mapa de normalización.
**Qué revisar:** El mapa en `EstudiantesAdmin.jsx` (y en `DocentesAdmin.jsx`) — busca `MAPA_GRADOS_PALABRA`. Si el Excel usa una variante distinta (ej. "Transicion" sin tilde, o "Onceno"), agrégala ahí.

---

### El Header muestra "Cargando institución..."

**Causa:** `ConfiguracionContext` todavía no terminó de cargar (es normal por un instante), o la fila en la tabla `configuracion` no existe / está vacía.
**Solución:** Verificar que existe la fila con `id = 1` en la tabla `configuracion` en Supabase.

---

## PARTE 5: Lo que deberías aprender next para seguir creciendo

En orden de prioridad para alguien con este proyecto como base:

1. **TypeScript** — el mismo React y JavaScript que ya sabes, pero con tipos. Previene el 80% de los bugs más frustrantes ("cannot read property of undefined"). Vite lo soporta nativamente.

2. **React Query (TanStack Query)** — una librería para manejar datos del servidor en React. Reemplaza los `useEffect` + `useState` para cargar datos con algo mucho más poderoso: caché automático, revalidación, estados de carga/error estandarizados. Es lo que se usa en proyectos serios.

3. **Zod** — validación de datos en JavaScript. En vez de `if (!nombre.trim()) return`, describes la forma que deben tener los datos y Zod los valida automáticamente. Muy útil al procesar los Excel de importación.

4. **Supabase Realtime** — permite que la app se actualice en tiempo real cuando cambia la base de datos, sin que el usuario tenga que recargar. Útil si en un futuro el admin quiere ver en vivo cómo van marcando los docentes durante el periodo.

5. **React Hook Form** — librería para manejar formularios en React. Los formularios de Docentes y Ajustes en tu app los manejaste "a mano" con `useState` por cada campo — con React Hook Form serían más simples y con mejor manejo de errores.

6. **Vitest** — el framework de testing que se lleva mejor con Vite. Escribir aunque sea un test por función crítica (como el mapa de normalización de grados) te ahorra horas de depuración cuando algo falla en producción.
