import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ESTADOS = [
  { key: 'asiste', label: 'Asiste', bg: 'bg-emerald-100', texto: 'text-emerald-800', borde: 'border-emerald-500', activo: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'falta', label: 'Falta', bg: 'bg-red-100', texto: 'text-red-800', borde: 'border-red-400', activo: 'bg-red-500 text-white border-red-500' },
  { key: 'excusa', label: 'Excusa', bg: 'bg-amber-100', texto: 'text-amber-800', borde: 'border-amber-400', activo: 'bg-amber-500 text-white border-amber-500' },
]

function hoy() {
  return new Date().toISOString().split('T')[0]
}

function formatearFecha(fechaISO) {
  const [y, m, d] = fechaISO.split('-')
  return `${d}/${m}/${y}`
}

export default function AsistenciaDashboard() {
  const { docente } = useAuth()
  const navigate = useNavigate()

  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx, setSelIdx] = useState(0)
  const [fecha, setFecha] = useState(hoy())
  const [estudiantes, setEstudiantes] = useState(null)
  const [registros, setRegistros] = useState({}) // { estudiante_id: estado }
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: periodosData } = await supabase
        .from('periodos').select('*').order('created_at', { ascending: false })
      setPeriodos(periodosData || [])
      const activo = (periodosData || []).find(p => p.activo)
      setPeriodoId(activo?.id ?? periodosData?.[0]?.id ?? null)

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

  const asign = asignaciones?.[selIdx]

  useEffect(() => {
    if (!asign || !periodoId) return
    cargarEstudiantesYRegistros()
  }, [asign?.id, periodoId, fecha])

  const cargarEstudiantesYRegistros = async () => {
    setEstudiantes(null)
    setRegistros({})

    const { data: estData } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('grupo_id', asign.grupo_id)
      .order('nombre')

    const ids = (estData || []).map(e => e.id)
    let asistData = []
    if (ids.length > 0) {
      const { data } = await supabase
        .from('asistencias')
        .select('estudiante_id, estado')
        .eq('periodo_id', periodoId)
        .eq('asignacion_id', asign.id)
        .eq('fecha', fecha)
        .in('estudiante_id', ids)
      asistData = data || []
    }

    const mapa = {}
    asistData.forEach(r => { mapa[r.estudiante_id] = r.estado })
    setEstudiantes(estData || [])
    setRegistros(mapa)
  }

  const marcarEstado = async (estId, nuevoEstado) => {
    const estadoAnterior = registros[estId]
    const estadoFinal = estadoAnterior === nuevoEstado ? null : nuevoEstado

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
          periodo_id: periodoId,
          asignacion_id: asign.id,
          estudiante_id: estId,
          fecha,
          estado: estadoFinal,
          registrado_por: docente.id,
          updated_at: new Date().toISOString(),
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

  const resumen = () => {
    const vals = Object.values(registros)
    return {
      asiste: vals.filter(v => v === 'asiste').length,
      falta: vals.filter(v => v === 'falta').length,
      excusa: vals.filter(v => v === 'excusa').length,
      sinRegistro: (estudiantes?.length ?? 0) - vals.length,
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

  const r = resumen()

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

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Periodo</label>
              <select value={periodoId ?? ''} onChange={e => setPeriodoId(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full">
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
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
                {r.sinRegistro > 0 && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{r.sinRegistro} sin marcar</span>}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
                const bgFila = estadoActual === 'falta' ? 'bg-red-50'
                  : estadoActual === 'excusa' ? 'bg-amber-50'
                  : estadoActual === 'asiste' ? 'bg-emerald-50'
                  : ''
                return (
                  <div key={e.id} className={`flex items-center justify-between px-4 py-3 gap-3 ${bgFila}`}>
                    <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">{e.nombre}</span>
                    <div className="flex gap-1.5 shrink-0">
                      {ESTADOS.map(est => {
                        const isActivo = estadoActual === est.key
                        return (
                          <button
                            key={est.key}
                            onClick={() => marcarEstado(e.id, est.key)}
                            disabled={guardandoId === e.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                              isActivo ? est.activo : `bg-white ${est.texto} ${est.borde} hover:${est.bg}`
                            } disabled:opacity-40`}
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
