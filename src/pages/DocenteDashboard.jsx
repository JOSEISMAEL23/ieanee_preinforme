import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function IconClipboardCheck({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  )
}

function IconSliders({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

function IconPencil({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function IconAlertTriangle({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function IconShieldCheck({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

// requiereAsignacion: son los módulos "de docencia" — sin un grupo/materia
// asignado no tienen sentido (llevarían a pantallas vacías). Quien no dicta
// clase (ej. secretaria, coordinador) no debe verlos, aunque tenga permisos
// administrativos delegados.
const MODULOS = [
  {
    ruta: '/asistencia',
    icono: IconClipboardCheck,
    titulo: 'Llamado a lista',
    descripcion: 'Módulo de asistencia',
    color: 'emerald',
    requiereAsignacion: true,
  },
  {
    ruta: '/calificaciones/config',
    icono: IconSliders,
    titulo: 'Subparámetros',
    descripcion: 'Configurar mi materia',
    color: 'violet',
    controlado: 'calificaciones',
    requiereAsignacion: true,
  },
  {
    ruta: '/calificaciones',
    icono: IconPencil,
    titulo: 'Notas',
    descripcion: 'Capturar calificaciones',
    color: 'sky',
    controlado: 'calificaciones',
    requiereAsignacion: true,
  },
  {
    ruta: '/dificultades',
    icono: IconAlertTriangle,
    titulo: 'Marcación de dificultades',
    descripcion: 'Dificultades académicas',
    color: 'red',
    requiereAsignacion: true,
  },
]

const COLORES = {
  emerald: {
    bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    icono: 'bg-emerald-600',
    titulo: 'text-emerald-800',
    descripcion: 'text-emerald-600',
  },
  violet: {
    bg: 'bg-violet-50 hover:bg-violet-100 border-violet-200',
    icono: 'bg-violet-600',
    titulo: 'text-violet-800',
    descripcion: 'text-violet-600',
  },
  sky: {
    bg: 'bg-sky-50 hover:bg-sky-100 border-sky-200',
    icono: 'bg-sky-600',
    titulo: 'text-sky-800',
    descripcion: 'text-sky-600',
  },
  red: {
    bg: 'bg-red-50 hover:bg-red-100 border-red-200',
    icono: 'bg-red-600',
    titulo: 'text-red-800',
    descripcion: 'text-red-600',
  },
  slate: {
    bg: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
    icono: 'bg-slate-700',
    titulo: 'text-slate-800',
    descripcion: 'text-slate-600',
  },
}

export default function DocenteDashboard() {
  const { docente } = useAuth()
  const esAdmin = docente.rol === 'admin'
  const navigate = useNavigate()
  const [modulosActivos, setModulosActivos] = useState(null) // null = cargando
  const [tieneAsignaciones, setTieneAsignaciones] = useState(null) // null = cargando
  const [permisos, setPermisos] = useState(null) // null = cargando

  useEffect(() => {
    if (esAdmin) {
      setModulosActivos(new Set(MODULOS.map(m => m.controlado).filter(Boolean)))
      setTieneAsignaciones(true)
      setPermisos(new Set())
      return
    }
    (async () => {
      const [modRes, asignRes, permRes] = await Promise.all([
        supabase.from('docente_modulos').select('modulo, activo').eq('docente_id', docente.id),
        supabase.from('asignaciones').select('id', { count: 'exact', head: true }).eq('docente_id', docente.id),
        supabase.from('permisos_usuario').select('permiso, activo').eq('docente_id', docente.id),
      ])
      setModulosActivos(new Set((modRes.data || []).filter(m => m.activo).map(m => m.modulo)))
      setTieneAsignaciones((asignRes.count ?? 0) > 0)
      setPermisos(new Set((permRes.data || []).filter(p => p.activo).map(p => p.permiso)))
    })()
  }, [docente.id, esAdmin])

  if (modulosActivos === null || tieneAsignaciones === null || permisos === null) {
    return (
      <Layout>
        <p className="text-slate-500 text-sm">Cargando...</p>
      </Layout>
    )
  }

  const tarjetas = MODULOS.filter(m =>
    (!m.controlado || modulosActivos.has(m.controlado)) &&
    (!m.requiereAsignacion || tieneAsignaciones)
  )

  if (!esAdmin && permisos.size > 0) {
    tarjetas.push({
      ruta: '/admin',
      icono: IconShieldCheck,
      titulo: 'Panel de administración',
      descripcion: 'Accesos delegados',
      color: 'slate',
    })
  }

  if (tarjetas.length === 0) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-8 text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Todavía no tienes accesos asignados</h2>
          <p className="text-sm text-slate-500">
            Pídele al administrador que te asigne un grupo y materia, o que te active algún
            permiso desde Accesos y permisos.
          </p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-800">Hola, {docente.nombre}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tarjetas.map(({ ruta, icono: Icono, titulo, descripcion, color }) => {
            const c = COLORES[color]
            return (
              <button
                key={ruta}
                onClick={() => navigate(ruta)}
                className={`flex items-center gap-4 min-h-[72px] border rounded-xl px-4 py-3.5 text-left transition ${c.bg}`}
              >
                <span className={`flex items-center justify-center w-11 h-11 rounded-lg text-white shrink-0 ${c.icono}`}>
                  <Icono className="w-6 h-6" />
                </span>
                <span>
                  <span className={`block text-sm font-bold ${c.titulo}`}>{titulo}</span>
                  <span className={`block text-xs ${c.descripcion}`}>{descripcion} →</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
