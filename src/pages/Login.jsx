import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('Correo o contraseña incorrectos.')
      return
    }
    navigate('/redirect')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-6 text-center">
          Seguimiento Académico
        </h1>
        <div className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Correo"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-emerald-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  )
}