import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfiguracionProvider } from './context/ConfiguracionContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RoleRedirect from './pages/RoleRedirect'
import CambiarPassword from './pages/CambiarPassword'
import AdminDashboard from './pages/admin/AdminDashboard'
import AjustesInstitucion from './pages/admin/AjustesInstitucion'
import PeriodosAdmin from './pages/admin/PeriodosAdmin'
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
                <ProtectedRoute rolRequerido="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            >
              <Route index element={<AjustesInstitucion />} />
              <Route path="periodos" element={<PeriodosAdmin />} />
              <Route path="materias" element={<MateriasAdmin />} />
              <Route path="estudiantes" element={<EstudiantesAdmin />} />
              <Route path="docentes" element={<DocentesAdmin />} />
              <Route path="modulos" element={<ModulosDocenteAdmin />} />
              <Route path="incapacidades" element={<IncapacidadesAdmin />} />
              <Route path="parametros" element={<ParametrosAdmin />} />
              <Route path="consolidado" element={<ConsolidadoAdmin />} />
            </Route>

            {/* Ruta de impresión: fuera del layout de /admin a propósito,
                para que nunca herede el sidebar ni el header */}
            <Route
              path="/admin/consolidado/imprimir"
              element={
                <ProtectedRoute rolRequerido="admin">
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
                <ProtectedRoute>
                  <CalificacionesConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calificaciones"
              element={
                <ProtectedRoute>
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
