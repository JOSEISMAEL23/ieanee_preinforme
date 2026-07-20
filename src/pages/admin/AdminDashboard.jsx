import { NavLink, Outlet } from 'react-router-dom'
import Layout from '../../components/Layout'

const secciones = [
  { to: '/admin', label: 'Ajustes institución', end: true },
  { to: '/admin/periodos', label: 'Periodos' },
  { to: '/admin/materias', label: 'Materias por grado' },
  { to: '/admin/estudiantes', label: 'Estudiantes' },
  { to: '/admin/docentes', label: 'Docentes' },
  { to: '/admin/consolidado', label: 'Consolidado' },
  { to: '/asistencia/informe', label: 'Asistencia' },
]

export default function AdminDashboard() {
  return (
    <Layout>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <nav className="no-print flex md:flex-col gap-1 overflow-x-auto md:overflow-visible md:w-56 md:flex-shrink-0 -mx-5 px-5 md:mx-0 md:px-0 pb-2 md:pb-0">
          {secciones.map(s => (
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
