import { Navigate, useOutletContext } from 'react-router-dom'
import AjustesInstitucion from './AjustesInstitucion'

// Pantalla de aterrizaje de /admin. El admin (y quien tenga
// configurar_institucion) sigue cayendo en Ajustes institución; cualquier
// otro delegado se redirige a la primera sección que SÍ puede ver. Antes el
// índice era un destino fijo protegido con configurar_institucion, así que
// expulsaba del panel a 5 de los 6 permisos del catálogo: entraban al layout
// y la ruta hija los devolvía a /docente (el "parpadeo").
//
// Reusa seccionesVisibles del AdminDashboard (llega por el context del
// Outlet) en vez de recalcular: el catálogo de secciones vive en un solo
// sitio y no se hace una segunda consulta de permisos.
export default function AdminIndex() {
  const { seccionesVisibles, esAdmin, cargando } = useOutletContext()

  // Para un delegado, permisos arranca en null y seccionesVisibles sale
  // vacío: sin este estado se vería un instante el mensaje de "no tienes
  // secciones" antes de redirigir. Mismo cuidado que el filtro del menú.
  if (cargando) return <p className="text-slate-500 text-sm">Cargando...</p>

  const puedeAjustes = esAdmin || seccionesVisibles.some(s => s.to === '/admin')
  if (puedeAjustes) return <AjustesInstitucion />

  const primera = seccionesVisibles.find(s => s.to !== '/admin')
  if (primera) return <Navigate to={primera.to} replace />

  return (
    <p className="text-slate-500 text-sm">
      No tienes ninguna sección administrativa asignada. Pídele al administrador que te active un
      permiso desde Accesos y permisos.
    </p>
  )
}
