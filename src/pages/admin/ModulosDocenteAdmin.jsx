import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Módulos controlados (feature gating): los módulos base (dificultades,
// asistencia) no están acá porque son siempre visibles para todo docente.
// Agregar un módulo futuro es solo sumar una entrada a esta lista.
const MODULOS_CONTROLADOS = [
  { slug: 'calificaciones', label: 'Calificaciones' },
]

function claveEstado(docenteId, modulo) {
  return `${docenteId}_${modulo}`
}

export default function ModulosDocenteAdmin() {
  const [docentes, setDocentes] = useState(null)
  const [estados, setEstados] = useState({}) // { [docenteId_modulo]: boolean }
  const [busqueda, setBusqueda] = useState('')
  const [guardandoKey, setGuardandoKey] = useState(null)
  const [guardandoMasivo, setGuardandoMasivo] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const cargar = async () => {
    const [docRes, modRes] = await Promise.all([
      supabase.from('docentes').select('id, nombre, email').eq('rol', 'docente').order('nombre'),
      supabase.from('docente_modulos').select('docente_id, modulo, activo'),
    ])

    if (docRes.error) {
      setError('No se pudieron cargar los docentes: ' + docRes.error.message)
      setDocentes([])
      return
    }

    setDocentes(docRes.data || [])

    const mapa = {}
    ;(modRes.data || []).forEach(m => {
      mapa[claveEstado(m.docente_id, m.modulo)] = m.activo
    })
    setEstados(mapa)
  }

  useEffect(() => { cargar() }, [])

  const docentesFiltrados = (docentes || []).filter(d =>
    d.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const toggleModulo = async (docenteId, modulo) => {
    const key = claveEstado(docenteId, modulo)
    const valorActual = estados[key] ?? false
    const nuevoValor = !valorActual

    setEstados(prev => ({ ...prev, [key]: nuevoValor }))
    setGuardandoKey(key)
    setMensaje(''); setError('')

    const { error: err } = await supabase
      .from('docente_modulos')
      .upsert({ docente_id: docenteId, modulo, activo: nuevoValor }, { onConflict: 'docente_id,modulo' })

    setGuardandoKey(null)
    if (err) {
      setEstados(prev => ({ ...prev, [key]: valorActual }))
      setError('No se pudo guardar: ' + err.message)
    }
  }

  const cambiarTodos = async (modulo, nuevoValor) => {
    const lista = docentesFiltrados
    if (lista.length === 0) return

    const accion = nuevoValor ? 'Activar' : 'Desactivar'
    const alcance = busqueda.trim() ? `los ${lista.length} docentes filtrados` : `los ${lista.length} docentes`
    const confirmado = window.confirm(`¿${accion} "${MODULOS_CONTROLADOS.find(m => m.slug === modulo)?.label}" para ${alcance}?`)
    if (!confirmado) return

    const estadosPrevios = estados
    setEstados(prev => {
      const next = { ...prev }
      lista.forEach(d => { next[claveEstado(d.id, modulo)] = nuevoValor })
      return next
    })

    setGuardandoMasivo(true)
    setMensaje(''); setError('')

    const filas = lista.map(d => ({ docente_id: d.id, modulo, activo: nuevoValor }))
    const { error: err } = await supabase
      .from('docente_modulos')
      .upsert(filas, { onConflict: 'docente_id,modulo' })

    setGuardandoMasivo(false)
    if (err) {
      setEstados(estadosPrevios)
      setError('No se pudo guardar: ' + err.message)
      return
    }
    setMensaje(`${accion === 'Activar' ? 'Activado' : 'Desactivado'} para ${lista.length} docente${lista.length !== 1 ? 's' : ''}.`)
  }

  if (docentes === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Módulos por docente</h2>
        <p className="text-sm text-slate-500">
          Llamado a lista y marcación de dificultades son siempre visibles para todos los
          docentes. Los módulos de la lista se activan uno por uno, o en bloque con los botones
          de arriba de cada columna.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Buscar docente</label>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Nombre..."
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {MODULOS_CONTROLADOS.map(m => (
              <div key={m.slug} className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500">{m.label}:</span>
                <button
                  onClick={() => cambiarTodos(m.slug, true)}
                  disabled={guardandoMasivo || docentesFiltrados.length === 0}
                  className="text-xs font-semibold text-emerald-700 border border-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition disabled:opacity-40"
                >
                  Activar todos
                </button>
                <button
                  onClick={() => cambiarTodos(m.slug, false)}
                  disabled={guardandoMasivo || docentesFiltrados.length === 0}
                  className="text-xs font-semibold text-slate-600 border border-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                >
                  Desactivar todos
                </button>
              </div>
            ))}
          </div>
        </div>

        {docentesFiltrados.length === 0 ? (
          <p className="text-sm text-slate-400">
            {docentes.length === 0 ? 'Aún no hay docentes.' : `No se encontraron docentes que coincidan con "${busqueda}".`}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {docentesFiltrados.map(d => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 rounded-lg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{d.nombre}</p>
                  <p className="text-xs text-slate-500 truncate">{d.email}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {MODULOS_CONTROLADOS.map(m => {
                    const key = claveEstado(d.id, m.slug)
                    const activo = estados[key] ?? false
                    return (
                      <button
                        key={m.slug}
                        onClick={() => toggleModulo(d.id, m.slug)}
                        disabled={guardandoKey === key}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border transition disabled:opacity-40 ${
                          activo
                            ? 'bg-emerald-800 text-white border-emerald-800'
                            : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {m.label}: {activo ? 'Activo' : 'Inactivo'}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
    </div>
  )
}
