# Estructura de `src/`

| Archivo | Qué hace |
|---|---|
| `main.jsx` | Punto de entrada, monta `App` en el DOM. |
| `App.jsx` | Define todas las rutas de la aplicación (React Router). |
| `index.css` | Importa Tailwind CSS. |
| `assets/hero.png` | Imagen usada en la pantalla de login. |
| `lib/supabase.js` | Crea y exporta el cliente de Supabase. |
| `context/AuthContext.jsx` | Maneja sesión, login/logout y datos del docente actual. |
| `context/ConfiguracionContext.jsx` | Carga y cachea la configuración de la institución. |
| `components/Header.jsx` | Encabezado con logo, nombre de institución y cierre de sesión. |
| `components/Layout.jsx` | Envoltorio visual común (Header + contenedor) para páginas. |
| `components/ProtectedRoute.jsx` | Restringe rutas según sesión y rol del usuario. |
| `pages/Login.jsx` | Formulario de inicio de sesión. |
| `pages/RoleRedirect.jsx` | Redirige al usuario a `/admin` o `/docente` según su rol. |
| `pages/CambiarPassword.jsx` | Formulario para cambiar la contraseña obligatoria. |
| `pages/DocenteDashboard.jsx` | Panel del docente para registrar bajo rendimiento académico. |
| `pages/AsistenciaDashboard.jsx` | Registro diario de asistencia por grupo/materia. |
| `pages/AsistenciaInforme.jsx` | Genera informe de faltas y excusas por grupo. |
| `pages/admin/AdminDashboard.jsx` | Layout con menú lateral para las secciones de administración. |
| `pages/admin/AjustesInstitucion.jsx` | Edita nombre, eslogan y logo de la institución. |
| `pages/admin/PeriodosAdmin.jsx` | Administra periodos académicos y sus fechas límite. |
| `pages/admin/MateriasAdmin.jsx` | Administra materias por grado, con carga masiva desde Excel. |
| `pages/admin/EstudiantesAdmin.jsx` | Administra estudiantes y grupos, con importación desde Excel. |
| `pages/admin/DocentesAdmin.jsx` | Administra cuentas de docentes y sus asignaciones. |
| `pages/admin/ConsolidadoAdmin.jsx` | Muestra matriz consolidada de bajo rendimiento y exporta boletines. |
| `pages/admin/BoletinesImprimir.jsx` | Vista imprimible de boletines individuales por estudiante. |
