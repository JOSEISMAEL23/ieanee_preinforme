import { NavLink, Outlet } from 'react-router-dom'
import Layout from '../../components/Layout'

const secciones = [
  { to: '/admin', label: 'Ajustes institución', end: true },
  { to: '/admin/periodos', label: 'Periodos' },
  { to: '/admin/materias', label: 'Materias por grado' },
  { to: '/admin/estudiantes', label: 'Estudiantes' },
  { to: '/admin/docentes', label: 'Docentes' },
  { to: '/admin/consolidado', label: 'Consolidado' },
]

export default function AdminDashboard() {
  return (
    <Layout>
      <div className="flex gap-6">
        <nav className="w-56 shrink-0 flex flex-col gap-1">
          {secciones.map(s => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-semibold transition ${
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