import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ConfiguracionProvider } from './context/ConfiguracionContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RoleRedirect from './pages/RoleRedirect'
import AdminDashboard from './pages/admin/AdminDashboard'
import AjustesInstitucion from './pages/admin/AjustesInstitucion'
import MateriasAdmin from './pages/admin/MateriasAdmin'
import EstudiantesAdmin from './pages/admin/EstudiantesAdmin'
import DocenteDashboard from './pages/DocenteDashboard'
import DocentesAdmin from './pages/admin/DocentesAdmin'
import PeriodosAdmin from './pages/admin/PeriodosAdmin'

function App() {
  return (
    <AuthProvider>
      <ConfiguracionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/redirect" element={<RoleRedirect />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute rolRequerido="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            >
              <Route index element={<AjustesInstitucion />} />
              <Route path="materias" element={<MateriasAdmin />} />
              <Route path="estudiantes" element={<EstudiantesAdmin />} />
              <Route path="docentes" element={<DocentesAdmin />} />
              <Route path="periodos" element={<PeriodosAdmin />} />
            </Route>
            <Route
              path="/docente"
              element={
                <ProtectedRoute rolRequerido="docente">
                  <DocenteDashboard />
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