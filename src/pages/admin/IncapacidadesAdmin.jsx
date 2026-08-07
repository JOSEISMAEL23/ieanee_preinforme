import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

const SELECT_INCAPACIDAD = `
  id, estudiante_id, fecha_inicio, fecha_fin, motivo, created_at,
  estudiantes(nombre, grupo_id, grupos(nombre, grados(nombre)))
`

function hoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return ''
  const [y, m, d] = fechaISO.split('-')
  return `${d}/${m}/${y}`
}

// Días calendario que cubre el rango, ambos extremos incluidos.
function diasRango(inicio, fin) {
  const ms = new Date(fin) - new Date(inicio)
  return Math.round(ms / 86400000) + 1
}

function nombreGrupo(est) {
  if (!est?.grupos) return ''
  return `${est.grupos.grados?.nombre ?? ''} ${est.grupos.nombre ?? ''}`.trim()
}

export default function IncapacidadesAdmin() {
  const { docente } = useAuth()

  const [grados, setGrados]           = useState([])
  const [gradoId, setGradoId]         = useState(null)
  const [grupos, setGrupos]           = useState([])
  const [nombre, setNombre]           = useState(null)
  const [estudiantes, setEstudiantes] = useState([])

  // Formulario de creación
  const [estudianteId, setEstudianteId] = useState('')
  const [fechaInicio, setFechaInicio]   = useState(hoy())
  const [fechaFin, setFechaFin]         = useState(hoy())
  const [motivo, setMotivo]             = useState('')
  const [guardando, setGuardando]       = useState(false)

  // Listado
  const [incapacidades, setIncapacidades] = useState([])
  const [soloEsteGrupo, setSoloEsteGrupo] = useState(true)
  const [busqueda, setBusqueda]           = useState('')

  // Edición en línea
  const [editandoId, setEditandoId] = useState(null)
  const [eInicio, setEInicio]       = useState('')
  const [eFin, setEFin]             = useState('')
  const [eMotivo, setEMotivo]       = useState('')

  const [mensaje, setMensaje]   = useState('')
  const [cargando, setCargando] = useState(true)

  const cargarGrados = async () => {
    const { data } = await supabase.from('grados').select('*').order('orden')
    setGrados(data || [])
    if (data && data.length && !gradoId) setGradoId(data[0].id)
  }

  const cargarIncapacidades = async () => {
    const { data, error } = await supabase
      .from('incapacidades')
      .select(SELECT_INCAPACIDAD)
      .order('fecha_inicio', { ascending: false })
    if (error) { setMensaje('Error al cargar incapacidades: ' + error.message); return }
    setIncapacidades(data || [])
  }

  useEffect(() => {
    (async () => {
      await Promise.all([cargarGrados(), cargarIncapacidades()])
      setCargando(false)
    })()
  }, [])

  // Los grupos del grado, en su orden. Antes esta lista era una constante fija
  // con A, B y C escrita a mano.
  useEffect(() => {
    if (!gradoId) { setGrupos([]); return }
    ;(async () => {
      const { data } = await supabase
        .from('grupos').select('id, nombre').eq('grado_id', gradoId).order('orden')
      const lista = data || []
      setGrupos(lista)
      setNombre(prev => lista.some(g => g.nombre === prev) ? prev : (lista[0]?.nombre ?? null))
    })()
  }, [gradoId])

  // Al cambiar de grupo, recargar los estudiantes de ese grupo
  useEffect(() => {
    const grupo = grupos.find(g => g.nombre === nombre)
    if (!grupo) { setEstudiantes([]); setEstudianteId(''); return }
    ;(async () => {
      const { data } = await supabase
        .from('estudiantes').select('id, nombre').eq('grupo_id', grupo.id).order('nombre')
      setEstudiantes(data || [])
      setEstudianteId('')
    })()
  }, [grupos, nombre])

  const crearIncapacidad = async () => {
    setMensaje('')
    if (!estudianteId) { setMensaje('Selecciona un estudiante.'); return }
    if (!fechaInicio || !fechaFin) { setMensaje('Indica la fecha de inicio y la de fin.'); return }
    if (fechaFin < fechaInicio) {
      setMensaje('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }

    setGuardando(true)
    const { error } = await supabase.from('incapacidades').insert({
      estudiante_id:  Number(estudianteId),
      fecha_inicio:   fechaInicio,
      fecha_fin:      fechaFin,
      motivo:         motivo.trim() || null,
      registrado_por: docente?.id ?? null,
    })
    setGuardando(false)

    if (error) { setMensaje('Error al guardar: ' + error.message); return }

    const est = estudiantes.find(e => e.id === Number(estudianteId))
    setMensaje(
      `Incapacidad registrada para ${est?.nombre ?? 'el estudiante'} ` +
      `(${formatearFecha(fechaInicio)} — ${formatearFecha(fechaFin)}).`
    )
    setEstudianteId('')
    setMotivo('')
    cargarIncapacidades()
  }

  const iniciarEdicion = (inc) => {
    setEditandoId(inc.id)
    setEInicio(inc.fecha_inicio)
    setEFin(inc.fecha_fin)
    setEMotivo(inc.motivo ?? '')
    setMensaje('')
  }

  const guardarEdicion = async (id) => {
    if (!eInicio || !eFin) { setMensaje('Indica la fecha de inicio y la de fin.'); return }
    if (eFin < eInicio) {
      setMensaje('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }
    const { error } = await supabase
      .from('incapacidades')
      .update({ fecha_inicio: eInicio, fecha_fin: eFin, motivo: eMotivo.trim() || null })
      .eq('id', id)
    if (error) { setMensaje('Error al actualizar: ' + error.message); return }
    setEditandoId(null)
    setMensaje('')
    cargarIncapacidades()
  }

  const eliminarIncapacidad = async (inc) => {
    const nombreEst = inc.estudiantes?.nombre ?? 'este estudiante'
    const ok = window.confirm(
      `¿Eliminar la incapacidad de ${nombreEst} ` +
      `(${formatearFecha(inc.fecha_inicio)} — ${formatearFecha(inc.fecha_fin)})?`
    )
    if (!ok) return
    const { error } = await supabase.from('incapacidades').delete().eq('id', inc.id)
    if (error) { setMensaje('Error al eliminar: ' + error.message); return }
    setMensaje('')
    cargarIncapacidades()
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando...</p>

  const gradoActual = grados.find(g => g.id === gradoId)
  const etiquetaGrupo = `${gradoActual?.nombre ?? ''} ${nombre ?? ''}`.trim()

  const visibles = incapacidades.filter(inc => {
    const est = inc.estudiantes
    if (soloEsteGrupo) {
      const coincide =
        est?.grupos?.grados?.nombre === gradoActual?.nombre &&
        est?.grupos?.nombre === nombre
      if (!coincide) return false
    }
    const texto = busqueda.trim().toLowerCase()
    if (texto && !(est?.nombre ?? '').toLowerCase().includes(texto)) return false
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------------- */}
      {/* Registro de una incapacidad                                       */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Registrar incapacidad</h2>
        <p className="text-sm text-slate-500 mb-4">
          Los días cubiertos por una incapacidad <b>no se cuentan como fallas</b>. El docente
          verá al estudiante marcado como incapacitado y no podrá registrarle asistencia esos días.
        </p>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-48 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto md:max-h-96">
            {grados.map(g => (
              <button
                key={g.id}
                onClick={() => setGradoId(g.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 ${
                  gradoId === g.id ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {g.nombre}
              </button>
            ))}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {grupos.map(gr => (
                <button
                  key={gr.id}
                  onClick={() => setNombre(gr.nombre)}
                  className={`w-10 h-10 rounded-lg text-sm font-bold border ${
                    nombre === gr.nombre
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-700'
                  }`}
                >
                  {gr.nombre}
                </button>
              ))}
              <span className="text-sm text-slate-500 ml-2">
                {estudiantes.length} estudiante{estudiantes.length !== 1 ? 's' : ''} en {etiquetaGrupo}
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Estudiante</label>
              <select
                value={estudianteId}
                onChange={e => setEstudianteId(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                <option value="">— Selecciona un estudiante —</option>
                {estudiantes.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
              {estudiantes.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">Este grupo no tiene estudiantes cargados.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaInicio}
                  onChange={e => setFechaInicio(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaFin}
                  onChange={e => setFechaFin(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[12rem]">
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Motivo <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej. incapacidad médica EPS"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
            </div>

            {fechaInicio && fechaFin && fechaFin >= fechaInicio && (
              <p className="text-xs text-slate-500">
                Cubre {diasRango(fechaInicio, fechaFin)} día
                {diasRango(fechaInicio, fechaFin) !== 1 ? 's' : ''} calendario.
              </p>
            )}

            <div>
              <button
                onClick={crearIncapacidad}
                disabled={guardando || !estudianteId}
                className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {guardando ? 'Guardando...' : 'Registrar incapacidad'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Histórico                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Incapacidades registradas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {visibles.length} registro{visibles.length !== 1 ? 's' : ''}
              {soloEsteGrupo ? ` en ${etiquetaGrupo}` : ' en toda la institución'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Buscar estudiante</label>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre..."
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 h-[38px]">
              <input
                type="checkbox"
                checked={soloEsteGrupo}
                onChange={e => setSoloEsteGrupo(e.target.checked)}
                className="accent-emerald-700"
              />
              Solo {etiquetaGrupo}
            </label>
          </div>
        </div>

        {visibles.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-400 text-sm">
            No hay incapacidades registradas con estos filtros.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibles.map(inc => (
              <div key={inc.id} className="px-6 py-4">
                {editandoId === inc.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="font-semibold text-slate-800 text-sm">
                      {inc.estudiantes?.nombre}
                      <span className="text-slate-400 font-normal ml-2">
                        {nombreGrupo(inc.estudiantes)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Desde</label>
                        <input type="date" value={eInicio} onChange={e => setEInicio(e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Hasta</label>
                        <input type="date" value={eFin} onChange={e => setEFin(e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="flex-1 min-w-[12rem]">
                        <label className="text-xs font-semibold text-slate-600 block mb-1">Motivo</label>
                        <input value={eMotivo} onChange={e => setEMotivo(e.target.value)}
                          placeholder="Opcional"
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => guardarEdicion(inc.id)}
                        className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditandoId(null)}
                        className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 text-sm">
                        {inc.estudiantes?.nombre}
                        <span className="text-slate-400 font-normal ml-2">
                          {nombreGrupo(inc.estudiantes)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                          🩹 {formatearFecha(inc.fecha_inicio)} — {formatearFecha(inc.fecha_fin)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {diasRango(inc.fecha_inicio, inc.fecha_fin)} día
                          {diasRango(inc.fecha_inicio, inc.fecha_fin) !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {inc.motivo && (
                        <p className="text-xs text-slate-500 mt-1.5">{inc.motivo}</p>
                      )}
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => iniciarEdicion(inc)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarIncapacidad(inc)}
                        className="text-xs font-semibold text-red-500 hover:text-red-700"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}
