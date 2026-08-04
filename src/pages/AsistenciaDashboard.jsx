import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { etiquetaPeriodoConEstado } from '../lib/periodos'

const ESTADOS = [
  { key: 'asiste', label: 'Asiste', bg: 'bg-emerald-100', texto: 'text-emerald-800', borde: 'border-emerald-500', activo: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'falta',  label: 'Falta',  bg: 'bg-red-100',     texto: 'text-red-800',     borde: 'border-red-400',     activo: 'bg-red-500 text-white border-red-500'         },
  { key: 'excusa', label: 'Excusa', bg: 'bg-amber-100',   texto: 'text-amber-800',   borde: 'border-amber-400',   activo: 'bg-amber-500 text-white border-amber-500'     },
]

function hoy() {
  return new Date().toISOString().split('T')[0]
}

function formatearFecha(fechaISO) {
  const [y, m, d] = fechaISO.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Devuelve true si el periodo de asistencia está activo y dentro de su ventana.
 * Usa asistencia_fecha_inicio / asistencia_fecha_limite (independiente de dificultades).
 */
function asistenciaAbierta(periodo) {
  if (!periodo || !periodo.activo) return false
  const ahora = new Date()
  if (periodo.asistencia_fecha_inicio && ahora < new Date(periodo.asistencia_fecha_inicio)) return false
  if (periodo.asistencia_fecha_limite && ahora > new Date(periodo.asistencia_fecha_limite)) return false
  return true
}

function mensajeVentanaCerrada(periodo) {
  if (!periodo) return 'No hay periodo activo.'
  const ahora = new Date()
  if (periodo.asistencia_fecha_inicio && ahora < new Date(periodo.asistencia_fecha_inicio)) {
    return `La ventana de asistencia abre el ${new Date(periodo.asistencia_fecha_inicio).toLocaleString('es-CO')}.`
  }
  if (periodo.asistencia_fecha_limite && ahora > new Date(periodo.asistencia_fecha_limite)) {
    return `La ventana de asistencia cerró el ${new Date(periodo.asistencia_fecha_limite).toLocaleString('es-CO')}.`
  }
  return 'El periodo no está activo.'
}

export default function AsistenciaDashboard() {
  const { docente } = useAuth()
  const navigate    = useNavigate()

  const [periodos,    setPeriodos]    = useState([])
  const [periodoId,   setPeriodoId]   = useState(null)
  const [periodoObj,  setPeriodoObj]  = useState(null)   // ← objeto completo del periodo seleccionado
  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx,      setSelIdx]      = useState(0)
  const [fecha,       setFecha]       = useState(hoy())
  const [estudiantes, setEstudiantes] = useState(null)
  const [registros,   setRegistros]   = useState({})
  // { [estudiante_id]: incapacidad } — solo las que cubren la `fecha` seleccionada
  const [incapacidades, setIncapacidades] = useState({})
  const [guardandoId, setGuardandoId] = useState(null)
  const [marcandoTodos, setMarcandoTodos] = useState(false)
  const [mensaje,     setMensaje]     = useState('')
  const [cargando,    setCargando]    = useState(true)

  useEffect(() => {
    (async () => {
      const { data: periodosData } = await supabase
        .from('periodos').select('*').order('created_at', { ascending: false })
      setPeriodos(periodosData || [])
      const activo = (periodosData || []).find(p => p.activo)
      const inicial = activo ?? periodosData?.[0] ?? null
      setPeriodoId(inicial?.id ?? null)
      setPeriodoObj(inicial)

      const { data: asignData } = await supabase
        .from('asignaciones')
        .select(`id, grupo_id, materia_id,
          grupos(letra, grados(nombre)),
          materias(nombre)`)
        .eq('docente_id', docente.id)
      setAsignaciones(asignData || [])
      setCargando(false)
    })()
  }, [docente.id])

  // Actualizar periodoObj cuando cambia el selector
  const handleCambioPeriodo = (id) => {
    const num = Number(id)
    setPeriodoId(num)
    setPeriodoObj(periodos.find(p => p.id === num) ?? null)
  }

  const asign = asignaciones?.[selIdx]

  useEffect(() => {
    if (!asign || !periodoId) return
    cargarEstudiantesYRegistros()
  }, [asign?.id, periodoId, fecha])

  const cargarEstudiantesYRegistros = async () => {
    setEstudiantes(null)
    setRegistros({})
    setIncapacidades({})

    const { data: estData } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('grupo_id', asign.grupo_id)
      .order('nombre')

    const ids = (estData || []).map(e => e.id)
    let asistData = []
    let incapData = []
    if (ids.length > 0) {
      const [asistRes, incapRes] = await Promise.all([
        supabase
          .from('asistencias')
          .select('estudiante_id, estado')
          .eq('periodo_id', periodoId)
          .eq('asignacion_id', asign.id)
          .eq('fecha', fecha)
          .in('estudiante_id', ids),
        // Incapacidades que cubren la fecha seleccionada: inicio <= fecha <= fin
        supabase
          .from('incapacidades')
          .select('estudiante_id, fecha_inicio, fecha_fin, motivo')
          .in('estudiante_id', ids)
          .lte('fecha_inicio', fecha)
          .gte('fecha_fin', fecha),
      ])
      asistData = asistRes.data || []
      incapData = incapRes.data || []
    }

    const mapa = {}
    asistData.forEach(r => { mapa[r.estudiante_id] = r.estado })

    const mapaIncap = {}
    incapData.forEach(i => { mapaIncap[i.estudiante_id] = i })

    setEstudiantes(estData || [])
    setRegistros(mapa)
    setIncapacidades(mapaIncap)
  }

  const textoIncapacidad = (inc) => {
    const rango = `Incapacitado del ${formatearFecha(inc.fecha_inicio)} al ${formatearFecha(inc.fecha_fin)}`
    return inc.motivo ? `${rango} · ${inc.motivo}` : rango
  }

  const marcarEstado = async (estId, nuevoEstado) => {
    // Verificar ventana antes de intentar guardar
    if (!asistenciaAbierta(periodoObj)) {
      setMensaje(mensajeVentanaCerrada(periodoObj))
      return
    }

    // Un día incapacitado no admite asiste/falta/excusa (prioridad: incapacidad > estado)
    if (incapacidades[estId]) return

    const estadoAnterior = registros[estId]
    const estadoFinal    = estadoAnterior === nuevoEstado ? null : nuevoEstado

    setRegistros(prev => {
      const next = { ...prev }
      if (estadoFinal === null) delete next[estId]
      else next[estId] = estadoFinal
      return next
    })

    setGuardandoId(estId)
    setMensaje('')

    if (estadoFinal === null) {
      await supabase
        .from('asistencias')
        .delete()
        .eq('periodo_id', periodoId)
        .eq('asignacion_id', asign.id)
        .eq('estudiante_id', estId)
        .eq('fecha', fecha)
    } else {
      const { error } = await supabase
        .from('asistencias')
        .upsert({
          periodo_id:     periodoId,
          asignacion_id:  asign.id,
          estudiante_id:  estId,
          fecha,
          estado:         estadoFinal,
          registrado_por: docente.id,
          updated_at:     new Date().toISOString(),
        }, { onConflict: 'periodo_id,asignacion_id,estudiante_id,fecha' })

      if (error) {
        setRegistros(prev => {
          const next = { ...prev }
          if (estadoAnterior) next[estId] = estadoAnterior
          else delete next[estId]
          return next
        })
        setMensaje('Error al guardar: ' + error.message)
      }
    }
    setGuardandoId(null)
  }

  /**
   * Estudiantes que hoy no tienen ningún estado registrado y sí admiten marcación.
   * Los incapacitados en `fecha` quedan fuera: su fila está en solo lectura.
   */
  const sinMarcar = () =>
    (estudiantes || []).filter(e => !registros[e.id] && !incapacidades[e.id])

  const marcarTodosAsisten = async () => {
    if (!asistenciaAbierta(periodoObj)) {
      setMensaje(mensajeVentanaCerrada(periodoObj))
      return
    }

    const pendientes = sinMarcar()
    if (pendientes.length === 0) return

    const confirmado = window.confirm(
      `¿Marcar como "asiste" a los ${pendientes.length} estudiantes sin marcar? ` +
      `Las faltas y excusas ya registradas no se modifican.`
    )
    if (!confirmado) return

    const registrosPrevios = registros

    setRegistros(prev => {
      const next = { ...prev }
      pendientes.forEach(e => { next[e.id] = 'asiste' })
      return next
    })

    setMarcandoTodos(true)
    setMensaje('')

    const ahora = new Date().toISOString()
    const filas = pendientes.map(e => ({
      periodo_id:     periodoId,
      asignacion_id:  asign.id,
      estudiante_id:  e.id,
      fecha,
      estado:         'asiste',
      registrado_por: docente.id,
      updated_at:     ahora,
    }))

    const { error } = await supabase
      .from('asistencias')
      .upsert(filas, { onConflict: 'periodo_id,asignacion_id,estudiante_id,fecha' })

    if (error) {
      setRegistros(registrosPrevios)
      setMensaje('Error al marcar todos: ' + error.message)
    }
    setMarcandoTodos(false)
  }

  const resumen = () => {
    const vals = Object.values(registros)
    const incapacitados = (estudiantes || []).filter(e => incapacidades[e.id]).length
    return {
      asiste:      vals.filter(v => v === 'asiste').length,
      falta:       vals.filter(v => v === 'falta').length,
      excusa:      vals.filter(v => v === 'excusa').length,
      incapacitados,
      // Los incapacitados no cuentan como "sin marcar": no se les puede registrar estado.
      sinRegistro: sinMarcar().length,
    }
  }

  if (cargando) return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>

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

  const r          = resumen()
  const ventanaOk  = asistenciaAbierta(periodoObj)
  const pendientes = sinMarcar()

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              ← Volver
            </button>
            <h1 className="text-xl font-bold text-slate-800">Llamado a lista</h1>
          </div>
          <button
            onClick={() => navigate('/asistencia/informe')}
            className="text-sm font-semibold text-emerald-800 border border-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition"
          >
            Ver informe de fallas
          </button>
        </div>

        {/* Aviso si la ventana de asistencia está cerrada */}
        {!ventanaOk && periodoObj && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-800 font-medium">
            ⚠️ {mensajeVentanaCerrada(periodoObj)} Solo puedes consultar registros anteriores.
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Periodo</label>
              <select
                value={periodoId ?? ''}
                onChange={e => handleCambioPeriodo(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{etiquetaPeriodoConEstado(p)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              />
            </div>
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

          {asign && (
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">
                  {asign.grupos.grados.nombre} {asign.grupos.letra} · {asign.materias.nombre}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{formatearFecha(fecha)}</div>
              </div>
              <div className="flex gap-2 text-xs font-semibold">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">{r.asiste} asisten</span>
                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">{r.falta} faltan</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{r.excusa} excusas</span>
                {r.incapacitados > 0 && (
                  <span className="bg-sky-100 text-sky-800 px-2 py-1 rounded-full">{r.incapacitados} incapacitados</span>
                )}
                {r.sinRegistro > 0 && (
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{r.sinRegistro} sin marcar</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {estudiantes !== null && estudiantes.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
              <span className="text-xs text-slate-500">
                {pendientes.length > 0
                  ? `${pendientes.length} sin marcar`
                  : 'Todos los estudiantes tienen estado'}
              </span>
              <button
                onClick={marcarTodosAsisten}
                disabled={!ventanaOk || marcandoTodos || pendientes.length === 0}
                title={!ventanaOk ? mensajeVentanaCerrada(periodoObj) : undefined}
                className="shrink-0 min-h-[38px] bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {marcandoTodos ? 'Marcando...' : '✓ Marcar todos asisten'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
            <div className="col-span-1 px-4 py-2">Estudiante</div>
            <div className="col-span-2 px-4 py-2 text-center">Estado</div>
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
                const estadoActual = registros[e.id] ?? null
                const incap        = incapacidades[e.id] ?? null
                const bgFila = incap                     ? 'bg-sky-50'
                             : estadoActual === 'falta'  ? 'bg-red-50'
                             : estadoActual === 'excusa' ? 'bg-amber-50'
                             : estadoActual === 'asiste' ? 'bg-emerald-50'
                             : ''
                return (
                  <div key={e.id} className={`flex items-center justify-between px-4 py-3 gap-3 ${bgFila}`}>
                    {/* El badge va DEBAJO del nombre: en celular, ponerlo al lado
                        desalineaba los botones cuando el nombre es largo. */}
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-800 truncate">{e.nombre}</span>
                      {incap && (
                        <span
                          title={textoIncapacidad(incap)}
                          className="mt-1 inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-300 text-xs font-semibold px-2 py-0.5 rounded-full"
                        >
                          🩹 Incapacitado
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {ESTADOS.map(est => {
                        const isActivo = estadoActual === est.key
                        return (
                          <button
                            key={est.key}
                            onClick={() => marcarEstado(e.id, est.key)}
                            disabled={guardandoId === e.id || marcandoTodos || !ventanaOk || Boolean(incap)}
                            title={
                              incap      ? textoIncapacidad(incap)
                              : !ventanaOk ? mensajeVentanaCerrada(periodoObj)
                              : undefined
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                              isActivo
                                ? est.activo
                                : `bg-white ${est.texto} ${est.borde} hover:${est.bg}`
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {est.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {mensaje && <p className="text-sm text-red-600">{mensaje}</p>}
      </div>
    </Layout>
  )
}
