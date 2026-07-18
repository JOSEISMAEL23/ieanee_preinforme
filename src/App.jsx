import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import RoleRedirect from './pages/RoleRedirect'
import AdminDashboard from './pages/AdminDashboard'
import DocenteDashboard from './pages/DocenteDashboard'

function App() {
  return (
    <AuthProvider>
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
          />
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
    </AuthProvider>
  )
}

export default App