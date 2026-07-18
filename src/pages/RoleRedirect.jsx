import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RoleRedirect() {
  const { docente, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!docente) { navigate('/'); return }
    navigate(docente.rol === 'admin' ? '/admin' : '/docente')
  }, [docente, loading])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-slate-500 text-sm">Cargando...</p>
    </div>
  )
}