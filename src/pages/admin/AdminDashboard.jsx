import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import Layout from '../../components/Layout'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// permiso: undefined = visible para cualquiera que haya entrado al layout
// (ya sea admin o delegado, ver ProtectedRoute del /admin en App.jsx).
// soloAdmin: true = nunca se delega, ni siquiera con permisos — coincide
// con las rutas que en App.jsx exigen rolRequerido="admin" a secas.
const secciones = [
  { to: '/admin', label: 'Ajustes institución', end: true, permiso: 'configurar_institucion' },
  { to: '/admin/periodos', label: 'Periodos', permiso: 'gestionar_periodos' },
  { to: '/admin/materias', label: 'Materias por grado', soloAdmin: true },
  { to: '/admin/estudiantes', label: 'Estudiantes', soloAdmin: true },
  { to: '/admin/docentes', label: 'Docentes', soloAdmin: true },
  { to: '/admin/modulos', label: 'Accesos y permisos', soloAdmin: true },
  { to: '/admin/incapacidades', label: 'Incapacidades', permiso: 'gestionar_incapacidades' },
  { to: '/admin/parametros', label: 'Config. calificaciones', permiso: 'configurar_calificaciones' },
  { to: '/calificaciones/informe', label: 'Informe calificaciones', permiso: 'ver_informes_notas' },
  { to: '/admin/consolidado', label: 'Consolidado', permiso: 'ver_informes_dificultades' },
  { to: '/asistencia/informe', label: 'Asistencia', soloAdmin: true },
]

export default function AdminDashboard() {
  const { docente } = useAuth()
  const esAdmin = docente?.rol === 'admin'
  const [permisos, setPermisos] = useState(null) // null = cargando (delegados)

  useEffect(() => {
    if (esAdmin) return
    (async () => {
      const { data } = await supabase
        .from('permisos_usuario')
        .select('permiso, activo')
        .eq('docente_id', docente.id)
      setPermisos(new Set((data || []).filter(p => p.activo).map(p => p.permiso)))
    })()
  }, [docente?.id, esAdmin])

  const seccionesVisibles = secciones.filter(s => {
    if (esAdmin) return true
    if (s.soloAdmin) return false
    if (permisos === null) return false // evita mostrar y luego ocultar
    return permisos.has(s.permiso)
  })

  return (
    <Layout>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <nav className="no-print flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-56 md:flex-shrink-0 -mx-5 px-5 md:mx-0 md:px-0 pb-2 md:pb-0">
          {seccionesVisibles.map(s => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </Layout>
  )
}
