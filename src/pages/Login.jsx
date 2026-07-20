import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConfiguracion } from '../context/ConfiguracionContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const { config } = useConfiguracion()
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
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-5"
      style={{ background: 'linear-gradient(160deg, #0F1F38 0%, #16294A 55%, #1D3A63 100%)' }}
    >
      <FondoAnimado />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <div className="flex flex-col items-center text-center mb-8 text-white">
          {config?.logo_url ? (
            <img src={config.logo_url} alt="Logo" className="h-20 w-20 rounded-full object-cover bg-white shadow-lg mb-4" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-white/10 border border-white/30 flex items-center justify-center text-2xl font-bold mb-4">
              {(config?.nombre_institucion || 'IE').slice(0, 2).toUpperCase()}
            </div>
          )}
          <h1 className="font-bold text-xl leading-snug">
            {config?.nombre_institucion || 'Cargando institución...'}
          </h1>
          {config?.eslogan && (
            <p className="text-amber-300 text-sm font-medium tracking-wide mt-1">{config.eslogan}</p>
          )}
          <p className="text-sky-200 text-xs mt-3 uppercase tracking-widest">Seguimiento Académico</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 w-full">
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
              className="text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: '#7C2529' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </div>

        <div className="mt-8 text-center text-sky-200/60 text-[11px] leading-relaxed">
          <p>Desarrollado por Ingeniero Especialista José Ismael Martínez Lozada</p>
          <p>316 623 0215 · ieanee.josemartinez@gmail.com</p>
        </div>
      </div>
    </div>
  )
}

function FondoAnimado() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes flotar1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-40px) scale(1.08); } }
        @keyframes flotar2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-40px,30px) scale(1.1); } }
        @keyframes flotar3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,20px) scale(0.95); } }
        .blob1 { animation: flotar1 14s ease-in-out infinite; }
        .blob2 { animation: flotar2 18s ease-in-out infinite; }
        .blob3 { animation: flotar3 16s ease-in-out infinite; }
      `}</style>
      <div className="blob1 absolute -top-24 -left-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(124,37,41,0.30)' }} />
      <div className="blob2 absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl" style={{ background: 'rgba(232,185,35,0.16)' }} />
      <div className="blob3 absolute -bottom-32 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(110,198,232,0.18)' }} />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
    </div>
  )
}
