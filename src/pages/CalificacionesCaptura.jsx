import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Acepta coma decimal ("85,5") además de punto.
function aNumero(v) {
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : NaN
}

// Redondeo half-up a 2 decimales (motor de cálculo, sección 4 de la spec).
function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100
}

function promedioSimple(valores) {
  if (valores.length === 0) return null
  return round2(valores.reduce((a, b) => a + b, 0) / valores.length)
}

/**
 * Ventana de calificaciones: activa=true del periodo + dentro de
 * calificacion_fecha_inicio/limite (si están definidas). El admin no tiene
 * esta restricción, igual que en marcas/asistencias.
 */
function calificacionAbierta(periodo, esAdmin) {
  if (esAdmin) return true
  if (!periodo || !periodo.activo) return false
  const ahora = new Date()
  if (periodo.calificacion_fecha_inicio && ahora < new Date(periodo.calificacion_fecha_inicio)) return false
  if (periodo.calificacion_fecha_limite && ahora > new Date(periodo.calificacion_fecha_limite)) return false
  return true
}

function mensajeVentanaCerrada(periodo) {
  if (!periodo) return 'No hay periodo activo.'
  const ahora = new Date()
  if (periodo.calificacion_fecha_inicio && ahora < new Date(periodo.calificacion_fecha_inicio)) {
    return `La ventana de calificaciones abre el ${new Date(periodo.calificacion_fecha_inicio).toLocaleString('es-CO')}.`
  }
  if (periodo.calificacion_fecha_limite && ahora > new Date(periodo.calificacion_fecha_limite)) {
    return `La ventana de calificaciones cerró el ${new Date(periodo.calificacion_fecha_limite).toLocaleString('es-CO')}.`
  }
  return 'El periodo no está activo.'
}

export default function CalificacionesCaptura() {
  const { docente } = useAuth()
  const esAdmin = docente?.rol === 'admin'
  const navigate = useNavigate()

  const [periodos, setPeriodos]     = useState([])
  const [periodoId, setPeriodoId]   = useState(null)
  const [periodoObj, setPeriodoObj] = useState(null)

  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx, setSelIdx] = useState(0)

  const [parametros, setParametros]       = useState(null)
  const [subparametros, setSubparametros] = useState(null) // lista plana de la asignación actual
  const [subparametroId, setSubparametroId] = useState(null)

  const [descripcion, setDescripcion] = useState('')
  const [estudiantes, setEstudiantes] = useState(null)
  const [notasPorEstudiante, setNotasPorEstudiante] = useState({}) // { [est_id]: [{id, valor, descripcion}] }
  const [valoresNuevos, setValoresNuevos] = useState({}) // { [est_id]: string }

  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [error, setError]     = useState('')

  // ---- carga inicial: periodos, asignaciones propias, parametros globales ----
  useEffect(() => {
    (async () => {
      const [periodosRes, asignRes, paramRes] = await Promise.all([
        supabase.from('periodos').select('*').order('created_at', { ascending: false }),
        supabase
          .from('asignaciones')
          .select(`id, grupo_id, materia_id,
            grupos(letra, grados(nombre)),
            materias(nombre)`)
          .eq('docente_id', docente.id),
        supabase.from('parametros').select('*').order('orden'),
      ])

      const listaPeriodos = periodosRes.data || []
      setPeriodos(listaPeriodos)
      const activo = listaPeriodos.find(p => p.activo)
      const inicial = activo ?? listaPeriodos[0] ?? null
      setPeriodoId(inicial?.id ?? null)
      setPeriodoObj(inicial)

      setAsignaciones(asignRes.data || [])
      setParametros(paramRes.data || [])
      setCargando(false)
    })()
  }, [docente.id])

  const handleCambioPeriodo = (id) => {
    const num = Number(id)
    setPeriodoId(num)
    setPeriodoObj(periodos.find(p => p.id === num) ?? null)
  }

  const asign = asignaciones?.[selIdx]

  // ---- al cambiar de asignación: cargar sus subparámetros y sus estudiantes ----
  useEffect(() => {
    if (!asign) return
    (async () => {
      setSubparametros(null)
      setSubparametroId(null)
      setEstudiantes(null)

      const [subRes, estRes] = await Promise.all([
        supabase.from('subparametros').select('*').eq('asignacion_id', asign.id).order('orden'),
        supabase.from('estudiantes').select('*').eq('grupo_id', asign.grupo_id).order('nombre'),
      ])

      const subs = subRes.data || []
      setSubparametros(subs)
      setSubparametroId(subs[0]?.id ?? null)
      setEstudiantes(estRes.data || [])
    })()
  }, [asign?.id])

  // ---- al cambiar periodo/asignación/subparámetro: cargar las notas existentes ----
  useEffect(() => {
    if (!asign || !periodoId || !subparametroId || !estudiantes) return
    cargarNotas()
  }, [asign?.id, periodoId, subparametroId, estudiantes])

  const cargarNotas = async () => {
    setMensaje(''); setError('')
    const ids = (estudiantes || []).map(e => e.id)
    if (ids.length === 0) { setNotasPorEstudiante({}); return }

    const { data, error: err } = await supabase
      .from('notas')
      .select('id, estudiante_id, valor, descripcion, created_at')
      .eq('periodo_id', periodoId)
      .eq('asignacion_id', asign.id)
      .eq('subparametro_id', subparametroId)
      .in('estudiante_id', ids)
      .order('created_at')

    if (err) { setError('No se pudieron cargar las notas: ' + err.message); return }

    const mapa = {}
    ;(data || []).forEach(n => {
      if (!mapa[n.estudiante_id]) mapa[n.estudiante_id] = []
      mapa[n.estudiante_id].push(n)
    })
    setNotasPorEstudiante(mapa)
    setValoresNuevos({})
  }

  const cambiarValorNuevo = (estId, valor) => {
    setValoresNuevos(prev => ({ ...prev, [estId]: valor }))
  }

  const guardarNotas = async () => {
    setMensaje(''); setError('')

    if (!calificacionAbierta(periodoObj, esAdmin)) {
      setError(mensajeVentanaCerrada(periodoObj))
      return
    }

    const entradas = Object.entries(valoresNuevos).filter(([, v]) => String(v).trim() !== '')
    if (entradas.length === 0) {
      setError('No has escrito ninguna nota nueva.')
      return
    }

    // Validar TODO antes de guardar nada (todo o nada).
    for (const [estId, valor] of entradas) {
      const n = aNumero(valor)
      if (Number.isNaN(n) || n < 30 || n > 100) {
        const est = estudiantes.find(e => e.id === Number(estId))
        setError(`La nota de ${est?.nombre ?? 'un estudiante'} debe ser un número entre 30 y 100.`)
        return
      }
    }

    setGuardando(true)
    const filas = entradas.map(([estId, valor]) => ({
      periodo_id:      periodoId,
      asignacion_id:   asign.id,
      estudiante_id:   Number(estId),
      subparametro_id: subparametroId,
      valor:           aNumero(valor),
      descripcion:     descripcion.trim() || null,
      registrado_por:  docente.id,
    }))

    const { error: err } = await supabase.from('notas').insert(filas)
    setGuardando(false)

    if (err) { setError('Error al guardar: ' + err.message); return }

    setMensaje(`${filas.length} nota${filas.length !== 1 ? 's' : ''} guardada${filas.length !== 1 ? 's' : ''}.`)
    cargarNotas()
  }

  const borrarNota = async (nota, estId) => {
    if (!calificacionAbierta(periodoObj, esAdmin)) {
      setError(mensajeVentanaCerrada(periodoObj))
      return
    }
    const est = estudiantes.find(e => e.id === estId)
    const ok = window.confirm(`¿Eliminar la nota ${nota.valor} de ${est?.nombre ?? 'este estudiante'}?`)
    if (!ok) return

    setBorrandoId(nota.id)
    const { error: err } = await supabase.from('notas').delete().eq('id', nota.id)
    setBorrandoId(null)

    if (err) { setError('Error al eliminar: ' + err.message); return }
    cargarNotas()
  }

  if (cargando || parametros === null) return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>

  if (!asignaciones || asignaciones.length === 0) {
    return (
      <Layout>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Sin asignaciones</h2>
          <p className="text-sm text-slate-500">Pídele al administrador que te asigne un grupo y materia.</p>
        </div>
      </Layout>
    )
  }

  if (parametros.length === 0) {
    return (
      <Layout>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 max-w-lg mx-auto">
          <h2 className="text-sm font-bold text-amber-900 mb-1">Config de calificaciones no lista</h2>
          <p className="text-sm text-amber-800">
            El administrador todavía no ha configurado los parámetros de evaluación (Saber/Hacer/Ser).
          </p>
        </div>
      </Layout>
    )
  }

  const ventanaOk = calificacionAbierta(periodoObj, esAdmin)

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/docente')}
            className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            ← Volver
          </button>
          <h1 className="text-xl font-bold text-slate-800">Captura de notas</h1>
        </div>

        {!ventanaOk && periodoObj && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-800 font-medium">
            ⚠️ {mensajeVentanaCerrada(periodoObj)} Solo puedes consultar las notas ya registradas.
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Periodo</label>
              <select
                value={periodoId ?? ''}
                onChange={e => handleCambioPeriodo(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>
                ))}
              </select>
            </div>

            {asignaciones.length > 1 && (
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Grupo y materia</label>
                <select value={selIdx} onChange={e => setSelIdx(Number(e.target.value))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full">
                  {asignaciones.map((a, i) => (
                    <option key={a.id} value={i}>
                      {a.grupos.grados.nombre} {a.grupos.letra} — {a.materias.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {asign && (
            <div className="font-bold text-slate-800">
              {asign.grupos.grados.nombre} {asign.grupos.letra} · {asign.materias.nombre}
            </div>
          )}

          {subparametros === null ? (
            <p className="text-sm text-slate-400">Cargando subparámetros...</p>
          ) : subparametros.length === 0 ? (
            <p className="text-sm text-amber-700">
              Esta asignación no tiene subparámetros configurados todavía. Ve a "Subparámetros" para crearlos.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Subparámetro a calificar</label>
                <select
                  value={subparametroId ?? ''}
                  onChange={e => setSubparametroId(Number(e.target.value))}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                >
                  {parametros.map(p => {
                    const subs = subparametros.filter(sp => sp.parametro_id === p.id)
                    if (subs.length === 0) return null
                    return (
                      <optgroup key={p.id} label={p.nombre}>
                        {subs.map(sp => (
                          <option key={sp.id} value={sp.id}>{sp.nombre} ({sp.peso}%)</option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Descripción de esta actividad <span className="font-normal text-slate-400">(opcional, aplica a las notas que guardes ahora)</span>
                </label>
                <input
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder='Ej. "Quiz 1", "Tarea de repaso"'
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
            </>
          )}
        </div>

        {subparametros && subparametros.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
              <div className="col-span-2 px-4 py-2">Estudiante</div>
              <div className="col-span-2 px-4 py-2">Notas registradas</div>
              <div className="px-4 py-2 text-center">Nueva nota</div>
            </div>

            {estudiantes === null ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">Cargando estudiantes...</div>
            ) : estudiantes.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-400 text-sm">
                Este grupo no tiene estudiantes cargados todavía.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {estudiantes.map(e => {
                  const notas = notasPorEstudiante[e.id] || []
                  const promedio = promedioSimple(notas.map(n => n.valor))
                  return (
                    <div key={e.id} className="grid grid-cols-5 items-center px-4 py-3 gap-2">
                      <div className="col-span-2 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{e.nombre}</p>
                        {promedio !== null && (
                          <p className="text-xs font-semibold text-emerald-700">Promedio: {promedio}</p>
                        )}
                      </div>

                      <div className="col-span-2 flex flex-wrap gap-1.5">
                        {notas.length === 0 ? (
                          <span className="text-xs text-slate-400">Sin notas todavía</span>
                        ) : (
                          notas.map(n => (
                            <span
                              key={n.id}
                              title={n.descripcion || undefined}
                              className="inline-flex items-center gap-1 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded-full"
                            >
                              {n.valor}
                              <button
                                onClick={() => borrarNota(n, e.id)}
                                disabled={borrandoId === n.id || !ventanaOk}
                                title={!ventanaOk ? mensajeVentanaCerrada(periodoObj) : 'Eliminar'}
                                className="text-slate-400 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      <div>
                        <input
                          value={valoresNuevos[e.id] ?? ''}
                          onChange={ev => cambiarValorNuevo(e.id, ev.target.value)}
                          disabled={!ventanaOk}
                          inputMode="decimal"
                          placeholder="30-100"
                          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full text-center disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {estudiantes && estudiantes.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
                <button
                  onClick={guardarNotas}
                  disabled={guardando || !ventanaOk}
                  className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {guardando ? 'Guardando...' : 'Guardar notas nuevas'}
                </button>
              </div>
            )}
          </div>
        )}

        {error   && <p className="text-sm text-red-600">{error}</p>}
        {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
      </div>
    </Layout>
  )
}
