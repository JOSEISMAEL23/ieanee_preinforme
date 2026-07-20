import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function CambiarPassword() {
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const { docente, recargarDocente, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async () => {
    setError('')
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden.'); return }

    setGuardando(true)

    const { error: updErr } = await supabase.auth.updateUser({ password: nueva })
    if (updErr) {
      setGuardando(false)
      setError('No se pudo actualizar: ' + updErr.message)
      return
    }

    const { error: rpcErr } = await supabase.rpc('marcar_password_cambiada')
    if (rpcErr) {
      setGuardando(false)
      setError('La contraseña se actualizó, pero hubo un problema al confirmar: ' + rpcErr.message)
      return
    }

    await recargarDocente()
    setGuardando(false)
    navigate('/redirect')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">Cambia tu contraseña</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          {docente?.nombre ? `Hola, ${docente.nombre}. ` : ''}
          Por seguridad, debes establecer una contraseña propia antes de continuar.
        </p>
        <div className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={nueva}
            onChange={e => setNueva(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmar}
            onChange={e => setConfirmar(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={guardando}
            className="bg-emerald-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar y continuar'}
          </button>
          <button onClick={signOut} className="text-xs text-slate-400 underline mx-auto">
            Cancelar y cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}
