import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, rolRequerido }) {
  const { docente, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-slate-500 text-sm">Cargando...</p>
      </div>
    )
  }

  if (!docente) {
    return <Navigate to="/" replace />
  }

  if (rolRequerido && docente.rol !== rolRequerido) {
    return <Navigate to="/redirect" replace />
  }

  return children
}