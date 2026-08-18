import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfiguracionProvider } from './context/ConfiguracionContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RoleRedirect from './pages/RoleRedirect'
import CambiarPassword from './pages/CambiarPassword'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminIndex from './pages/admin/AdminIndex'
import PeriodosAdmin from './pages/admin/PeriodosAdmin'
import EstructuraAdmin from './pages/admin/EstructuraAdmin'
import MateriasAdmin from './pages/admin/MateriasAdmin'
import EstudiantesAdmin from './pages/admin/EstudiantesAdmin'
import DocentesAdmin from './pages/admin/DocentesAdmin'
import ModulosDocenteAdmin from './pages/admin/ModulosDocenteAdmin'
import IncapacidadesAdmin from './pages/admin/IncapacidadesAdmin'
import ParametrosAdmin from './pages/admin/ParametrosAdmin'
import ConsolidadoAdmin from './pages/admin/ConsolidadoAdmin'
import BoletinesImprimir from './pages/admin/BoletinesImprimir'
import DocenteDashboard from './pages/DocenteDashboard'
import DificultadesDashboard from './pages/DificultadesDashboard'
import AsistenciaDashboard from './pages/AsistenciaDashboard'
import AsistenciaInforme from './pages/AsistenciaInforme'
import CalificacionesConfig from './pages/CalificacionesConfig'
import CalificacionesCaptura from './pages/CalificacionesCaptura'
import CalificacionesInforme from './pages/CalificacionesInforme'

// Catálogo de permisos delegables (spec permisos-delegados §3). Cualquiera
// de estos habilita la entrada al layout de /admin; cada ruta hija exige
// además el suyo puntual. Otorgar/quitar módulos y permisos, y crear
// docentes, quedan fuera de este catálogo a propósito: eso no se delega.
const PERMISOS_ADMIN = [
  'gestionar_incapacidades',
  'ver_informes_dificultades',
  'ver_informes_notas',
  'configurar_institucion',
  'gestionar_periodos',
  'configurar_calificaciones',
]

function App() {
  return (
    <AuthProvider>
      <ConfiguracionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/redirect" element={<RoleRedirect />} />
            <Route
              path="/cambiar-password"
              element={
                <ProtectedRoute>
                  <CambiarPassword />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute permisoRequerido={PERMISOS_ADMIN}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            >
              {/* El layout de arriba solo exige "admin o algún permiso" para
                  entrar; cada ruta hija exige el permiso puntual que le
                  corresponde. Materias/Estudiantes/Docentes/Módulos no están
                  en el catálogo de permisos a propósito — crear usuarios y
                  otorgar accesos queda exclusivo del admin. */}
              {/* El índice NO puede ser un destino fijo: antes exigía
                  configurar_institucion y devolvía a /docente a los otros 5
                  permisos del catálogo, que entraban al layout y salían
                  expulsados en el mismo instante. AdminIndex manda a cada
                  quien a la primera sección que sí puede ver, y solo
                  renderiza Ajustes institución para quien tiene el permiso. */}
              <Route index element={<AdminIndex />} />
              <Route path="periodos" element={
                <ProtectedRoute permisoRequerido="gestionar_periodos">
                  <PeriodosAdmin />
                </ProtectedRoute>
              } />
              {/* Grados y grupos son la estructura del colegio: quien la
                  toca puede dejar sin grupo a estudiantes ya matriculados.
                  Por eso va en el grupo de "solo admin", como Materias. */}
              <Route path="estructura" element={
                <ProtectedRoute rolRequerido="admin">
                  <EstructuraAdmin />
                </ProtectedRoute>
              } />
              <Route path="materias" element={
                <ProtectedRoute rolRequerido="admin">
                  <MateriasAdmin />
                </ProtectedRoute>
              } />
              <Route path="estudiantes" element={
                <ProtectedRoute rolRequerido="admin">
                  <EstudiantesAdmin />
                </ProtectedRoute>
              } />
              <Route path="docentes" element={
                <ProtectedRoute rolRequerido="admin">
                  <DocentesAdmin />
                </ProtectedRoute>
              } />
              <Route path="modulos" element={
                <ProtectedRoute rolRequerido="admin">
                  <ModulosDocenteAdmin />
                </ProtectedRoute>
              } />
              <Route path="incapacidades" element={
                <ProtectedRoute permisoRequerido="gestionar_incapacidades">
                  <IncapacidadesAdmin />
                </ProtectedRoute>
              } />
              <Route path="parametros" element={
                <ProtectedRoute permisoRequerido="configurar_calificaciones">
                  <ParametrosAdmin />
                </ProtectedRoute>
              } />
              <Route path="consolidado" element={
                <ProtectedRoute permisoRequerido="ver_informes_dificultades">
                  <ConsolidadoAdmin />
                </ProtectedRoute>
              } />
            </Route>

            {/* Ruta de impresión: fuera del layout de /admin a propósito,
                para que nunca herede el sidebar ni el header */}
            <Route
              path="/admin/consolidado/imprimir"
              element={
                <ProtectedRoute permisoRequerido="ver_informes_dificultades">
                  <BoletinesImprimir />
                </ProtectedRoute>
              }
            />

            <Route
              path="/docente"
              element={
                <ProtectedRoute rolRequerido="docente">
                  <DocenteDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dificultades"
              element={
                <ProtectedRoute>
                  <DificultadesDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/asistencia"
              element={
                <ProtectedRoute>
                  <AsistenciaDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/asistencia/informe"
              element={
                <ProtectedRoute>
                  <AsistenciaInforme />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calificaciones/config"
              element={
                <ProtectedRoute moduloRequerido="calificaciones">
                  <CalificacionesConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calificaciones"
              element={
                <ProtectedRoute moduloRequerido="calificaciones">
                  <CalificacionesCaptura />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calificaciones/informe"
              element={
                <ProtectedRoute>
                  <CalificacionesInforme />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </ConfiguracionProvider>
    </AuthProvider>
  )
}

export default App
