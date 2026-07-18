import { useAuth } from '../context/AuthContext'
import { useConfiguracion } from '../context/ConfiguracionContext'

export default function Header() {
  const { docente, signOut } = useAuth()
  const { config } = useConfiguracion()

  return (
    <header className="bg-emerald-900 text-white">
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {config?.logo_url ? (
            <img
              src={config.logo_url}
              alt="Logo institución"
              className="h-10 w-10 rounded-full object-cover bg-white"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-emerald-700 flex items-center justify-center text-sm font-bold">
              {(config?.nombre_institucion || 'IE').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-semibold leading-tight">
              {config?.nombre_institucion || 'Cargando institución...'}
            </div>
            <div className="text-xs text-emerald-200 leading-tight">
              Seguimiento Académico
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">{docente?.nombre}</div>
            <div className="text-xs text-emerald-200 capitalize">{docente?.rol}</div>
          </div>
          <button
            onClick={signOut}
            className="bg-emerald-800 hover:bg-emerald-700 text-sm px-3 py-1.5 rounded-lg transition"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}