import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const Cargando = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-100">
    <p className="text-slate-500 text-sm">Cargando...</p>
  </div>
)

/**
 * moduloRequerido: slug de un módulo controlado (ver docente_modulos). El
 * admin siempre pasa. Se verifica ANTES de renderizar children, para que
 * pantallas con efectos de escritura al montar (ej. CalificacionesConfig
 * creando su config inicial) no alcancen a dispararse sin el módulo activo.
 * La protección real sigue viviendo en RLS (tiene_modulo()); esto es UX.
 */
export default function ProtectedRoute({ children, rolRequerido, moduloRequerido }) {
  const { docente, loading } = useAuth()
  const location = useLocation()

  const [verificandoModulo, setVerificandoModulo] = useState(!!moduloRequerido)
  const [tieneModulo, setTieneModulo] = useState(false)

  useEffect(() => {
    if (!moduloRequerido || !docente) return
    if (docente.rol === 'admin') {
      setTieneModulo(true)
      setVerificandoModulo(false)
      return
    }

    let cancelado = false
    setVerificandoModulo(true)
    supabase
      .from('docente_modulos')
      .select('activo')
      .eq('docente_id', docente.id)
      .eq('modulo', moduloRequerido)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setTieneModulo(!!data?.activo)
        setVerificandoModulo(false)
      })
    return () => { cancelado = true }
  }, [moduloRequerido, docente?.id, docente?.rol])

  if (loading) return <Cargando />

  if (!docente) {
    return <Navigate to="/" replace />
  }

  if (docente.debe_cambiar_password && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />
  }

  if (rolRequerido && docente.rol !== rolRequerido) {
    return <Navigate to="/redirect" replace />
  }

  if (moduloRequerido) {
    if (verificandoModulo) return <Cargando />
    if (!tieneModulo) return <Navigate to="/docente" replace />
  }

  return children
}
