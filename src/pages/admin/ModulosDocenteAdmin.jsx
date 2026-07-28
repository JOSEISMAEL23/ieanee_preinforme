import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Módulos controlados (feature gating): los módulos base (dificultades,
// asistencia) no están acá porque son siempre visibles para todo docente.
// Agregar un módulo futuro es solo sumar una entrada a esta lista.
const MODULOS_CONTROLADOS = [
  { tipo: 'modulo', tabla: 'docente_modulos', campo: 'modulo', slug: 'calificaciones', label: 'Calificaciones', alto: false },
]

// Catálogo de permisos delegables (spec permisos-delegados §3). Agregar uno
// nuevo es sumar una entrada acá; su chequeo real vive en tiene_permiso()
// del lado de la base de datos.
const PERMISOS_CATALOGO = [
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'gestionar_incapacidades', label: 'Incapacidades', alto: false },
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'ver_informes_dificultades', label: 'Ver informes: dificultades', alto: false },
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'ver_informes_notas', label: 'Ver informes: notas', alto: false },
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'configurar_institucion', label: 'Config. institución', alto: false },
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'gestionar_periodos', label: 'Gestionar periodos', alto: true },
  { tipo: 'permiso', tabla: 'permisos_usuario', campo: 'permiso', slug: 'configurar_calificaciones', label: 'Config. calificaciones', alto: true },
]

const COLUMNAS = [...MODULOS_CONTROLADOS, ...PERMISOS_CATALOGO]

function claveEstado(docenteId, col) {
  return `${docenteId}_${col.tipo}_${col.slug}`
}

export default function ModulosDocenteAdmin() {
  const [docentes, setDocentes] = useState(null)
  const [estados, setEstados] = useState({}) // { [docenteId_tipo_slug]: boolean }
  const [cargos, setCargos] = useState({}) // { [docenteId]: string editable }
  const [cargoOriginal, setCargoOriginal] = useState({}) // { [docenteId]: string ya guardado }
  const [busqueda, setBusqueda] = useState('')
  const [guardandoKey, setGuardandoKey] = useState(null)
  const [guardandoMasivo, setGuardandoMasivo] = useState(false)
  const [guardandoCargoId, setGuardandoCargoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const cargar = async () => {
    const [docRes, modRes, permRes] = await Promise.all([
      supabase.from('docentes').select('id, nombre, email, cargo').eq('rol', 'docente').order('nombre'),
      supabase.from('docente_modulos').select('docente_id, modulo, activo'),
      supabase.from('permisos_usuario').select('docente_id, permiso, activo'),
    ])

    if (docRes.error) {
      setError('No se pudieron cargar los docentes: ' + docRes.error.message)
      setDocentes([])
      return
    }

    setDocentes(docRes.data || [])

    const cargosIniciales = {}
    ;(docRes.data || []).forEach(d => { cargosIniciales[d.id] = d.cargo || '' })
    setCargos(cargosIniciales)
    setCargoOriginal(cargosIniciales)

    const mapa = {}
    ;(modRes.data || []).forEach(m => { mapa[`${m.docente_id}_modulo_${m.modulo}`] = m.activo })
    ;(permRes.data || []).forEach(p => { mapa[`${p.docente_id}_permiso_${p.permiso}`] = p.activo })
    setEstados(mapa)
  }

  useEffect(() => { cargar() }, [])

  const docentesFiltrados = (docentes || []).filter(d =>
    d.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const toggle = async (docenteId, col) => {
    const key = claveEstado(docenteId, col)
    const valorActual = estados[key] ?? false
    const nuevoValor = !valorActual

    setEstados(prev => ({ ...prev, [key]: nuevoValor }))
    setGuardandoKey(key)
    setMensaje(''); setError('')

    const { error: err } = await supabase
      .from(col.tabla)
      .upsert({ docente_id: docenteId, [col.campo]: col.slug, activo: nuevoValor }, { onConflict: `docente_id,${col.campo}` })

    setGuardandoKey(null)
    if (err) {
      setEstados(prev => ({ ...prev, [key]: valorActual }))
      setError('No se pudo guardar: ' + err.message)
    }
  }

  const cambiarTodos = async (col, nuevoValor) => {
    const lista = docentesFiltrados
    if (lista.length === 0) return

    const accion = nuevoValor ? 'Activar' : 'Desactivar'
    const alcance = busqueda.trim() ? `los ${lista.length} docentes filtrados` : `los ${lista.length} docentes`
    const confirmado = window.confirm(`¿${accion} "${col.label}" para ${alcance}?`)
    if (!confirmado) return

    const estadosPrevios = estados
    setEstados(prev => {
      const next = { ...prev }
      lista.forEach(d => { next[claveEstado(d.id, col)] = nuevoValor })
      return next
    })

    setGuardandoMasivo(true)
    setMensaje(''); setError('')

    const filas = lista.map(d => ({ docente_id: d.id, [col.campo]: col.slug, activo: nuevoValor }))
    const { error: err } = await supabase
      .from(col.tabla)
      .upsert(filas, { onConflict: `docente_id,${col.campo}` })

    setGuardandoMasivo(false)
    if (err) {
      setEstados(estadosPrevios)
      setError('No se pudo guardar: ' + err.message)
      return
    }
    setMensaje(`${accion === 'Activar' ? 'Activado' : 'Desactivado'} "${col.label}" para ${lista.length} docente${lista.length !== 1 ? 's' : ''}.`)
  }

  const guardarCargo = async (docenteId) => {
    const valor = (cargos[docenteId] ?? '').trim()
    if (valor === (cargoOriginal[docenteId] ?? '')) return // sin cambios, no llamar a la base

    setGuardandoCargoId(docenteId)
    setMensaje(''); setError('')

    const { error: err } = await supabase.from('docentes').update({ cargo: valor || null }).eq('id', docenteId)

    setGuardandoCargoId(null)
    if (err) {
      setError('No se pudo guardar el cargo: ' + err.message)
      setCargos(prev => ({ ...prev, [docenteId]: cargoOriginal[docenteId] ?? '' }))
      return
    }
    setCargoOriginal(prev => ({ ...prev, [docenteId]: valor }))
  }

  if (docentes === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Accesos y permisos</h2>
        <p className="text-sm text-slate-500 mb-2">
          Llamado a lista y marcación de dificultades son siempre visibles para todos los
          docentes. Acá se delega todo lo demás: módulos y permisos se activan por persona, uno
          por uno o en bloque con los enlaces "Todos"/"Ninguno" de cada columna. El cargo es solo
          una etiqueta para identificar quién es quién — no afecta ningún permiso.
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ Las columnas marcadas con advertencia (<b>Gestionar periodos</b>, <b>Config.
          calificaciones</b>) tienen alto impacto: pueden afectar a todo el colegio de una sola
          vez. Delégalas solo a quien tenga criterio académico para usarlas.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-600 block mb-1">Buscar docente</label>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Nombre..."
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {docentesFiltrados.length === 0 ? (
          <p className="text-sm text-slate-400">
            {docentes.length === 0 ? 'Aún no hay docentes.' : `No se encontraron docentes que coincidan con "${busqueda}".`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">
                    Docente
                  </th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">
                    Cargo
                  </th>
                  {COLUMNAS.map(col => (
                    <th
                      key={`${col.tipo}_${col.slug}`}
                      className={`px-3 py-2 text-center font-bold text-xs uppercase tracking-wide whitespace-nowrap ${
                        col.alto ? 'bg-amber-50 text-amber-800' : 'text-slate-600'
                      }`}
                    >
                      <div>{col.alto && '⚠️ '}{col.label}</div>
                      <div className="flex justify-center items-center gap-1 mt-1 font-normal normal-case text-[10px]">
                        <button
                          onClick={() => cambiarTodos(col, true)}
                          disabled={guardandoMasivo || docentesFiltrados.length === 0}
                          className="text-emerald-700 hover:underline disabled:opacity-40"
                        >
                          Todos
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          onClick={() => cambiarTodos(col, false)}
                          disabled={guardandoMasivo || docentesFiltrados.length === 0}
                          className="text-slate-500 hover:underline disabled:opacity-40"
                        >
                          Ninguno
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docentesFiltrados.map(d => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 align-top">
                      <p className="font-semibold text-slate-800 whitespace-nowrap">{d.nombre}</p>
                      <p className="text-xs text-slate-500 whitespace-nowrap">{d.email}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <input
                        value={cargos[d.id] ?? ''}
                        onChange={e => setCargos(prev => ({ ...prev, [d.id]: e.target.value }))}
                        onBlur={() => guardarCargo(d.id)}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                        placeholder="Ej. Secretaria"
                        disabled={guardandoCargoId === d.id}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs w-32 disabled:opacity-50"
                      />
                    </td>
                    {COLUMNAS.map(col => {
                      const key = claveEstado(d.id, col)
                      const activo = estados[key] ?? false
                      return (
                        <td key={key} className={`px-3 py-2 text-center align-top ${col.alto && activo ? 'bg-amber-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={() => toggle(d.id, col)}
                            disabled={guardandoKey === key}
                            className="w-4 h-4 accent-emerald-700 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
    </div>
  )
}
