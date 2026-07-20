import { useAuth } from '../context/AuthContext'
import { useConfiguracion } from '../context/ConfiguracionContext'

export default function Header() {
  const { docente, signOut } = useAuth()
  const { config } = useConfiguracion()

  return (
    <header className="bg-emerald-900 text-white no-print">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {config?.logo_url ? (
            <img
              src={config.logo_url}
              alt="Logo institución"
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover bg-white shrink-0"
            />
          ) : (
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
              {(config?.nombre_institucion || 'IE').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold leading-tight text-sm sm:text-base truncate">
              {config?.nombre_institucion || 'Cargando institución...'}
            </div>
            <div className="text-[11px] sm:text-xs text-emerald-200 leading-tight">
              Seguimiento Académico
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">{docente?.nombre}</div>
            <div className="text-xs text-emerald-200 capitalize">{docente?.rol}</div>
          </div>
          <button
            onClick={signOut}
            className="bg-emerald-800 hover:bg-emerald-700 text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg transition shrink-0"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
