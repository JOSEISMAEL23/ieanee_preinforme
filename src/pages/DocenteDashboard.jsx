import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function DocenteDashboard() {
  const { docente } = useAuth()
  const [periodo, setPeriodo] = useState(null)
  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx, setSelIdx] = useState(0)
  const [estudiantes, setEstudiantes] = useState(null)
  const [marcados, setMarcados] = useState({})
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    (async () => {
      const { data: periodoData } = await supabase
        .from('periodos').select('*').eq('activo', true).single()
      setPeriodo(periodoData || null)

      const { data: asignData } = await supabase
        .from('asignaciones')
        .select(`
          id, grupo_id, materia_id,
          grupos ( letra, grados ( nombre ) ),
          materias ( nombre )
        `)
        .eq('docente_id', docente.id)
      setAsignaciones(asignData || [])
    })()
  }, [docente.id])

  const asign = asignaciones?.[selIdx]

  useEffect(() => {
    if (!asign || !periodo) return
    (async () => {
      setEstudiantes(null)
      const { data: estData } = await supabase
        .from('estudiantes')
        .select('*')
        .eq('grupo_id', asign.grupo_id)
        .order('nombre')

      const ids = (estData || []).map(e => e.id)
      let marcasData = []
      if (ids.length > 0) {
        const { data } = await supabase
          .from('marcas')
          .select('*')
          .eq('periodo_id', periodo.id)
          .eq('materia_id', asign.materia_id)
          .in('estudiante_id', ids)
        marcasData = data || []
      }

      setEstudiantes(estData || [])
      const m = {}
      ;(estData || []).forEach(e => {
        const fila = marcasData.find(x => x.estudiante_id === e.id)
        m[e.id] = fila?.dificultad ?? false
      })
      setMarcados(m)
    })()
  }, [asign?.grupo_id, asign?.materia_id, periodo?.id])

  const toggle = async (estId) => {
    const nuevoValor = !marcados[estId]
    setMarcados(prev => ({ ...prev, [estId]: nuevoValor }))
    setGuardandoId(estId)
    setMensaje('')

    const { error } = await supabase.from('marcas').upsert(
      {
        periodo_id: periodo.id,
        estudiante_id: estId,
        materia_id: asign.materia_id,
        dificultad: nuevoValor,
        actualizado_por: docente.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'periodo_id,estudiante_id,materia_id' }
    )

    setGuardandoId(null)
    if (error) {
      setMarcados(prev => ({ ...prev, [estId]: !nuevoValor }))
      setMensaje('No se pudo guardar: ' + error.message)
    }
  }

  if (asignaciones === null) {
    return (
      <Layout>
        <p className="text-slate-500 text-sm">Cargando...</p>
      </Layout>
    )
  }

  if (!periodo) {
    return (
      <Layout>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-bold text-slate-800 mb-2">No hay un periodo activo</h2>
          <p className="text-sm text-slate-500">
            Pídele al administrador que active un periodo desde Configuración → Periodos.
          </p>
        </div>
      </Layout>
    )
  }

  if (asignaciones.length === 0) {
    return (
      <Layout>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-bold text-slate-800 mb-2">No tienes asignaciones todavía</h2>
          <p className="text-sm text-slate-500">
            Pídele al administrador que te asigne un grupo y materia en Configuración → Docentes.
          </p>
        </div>
      </Layout>
    )
  }

  const marcadosCount = Object.values(marcados).filter(Boolean).length

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
            {periodo.nombre}
          </p>
          <h1 className="text-xl font-bold text-slate-800 mb-5">Hola, {docente.nombre}</h1>

          {asignaciones.length > 1 && (
            <div className="mb-5">
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Grupo y materia</label>
              <select
                value={selIdx}
                onChange={e => setSelIdx(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
              >
                {asignaciones.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.grupos.grados.nombre} {a.grupos.letra} — {a.materias.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between mb-1">
            <div className="text-lg font-bold text-slate-800">
              {asign.grupos.grados.nombre} {asign.grupos.letra} · {asign.materias.nombre}
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              marcadosCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {marcadosCount} con dificultad
            </span>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Marca únicamente a los estudiantes con dificultad académica en esta materia durante este periodo.
            Los cambios se guardan automáticamente.
          </p>

          {estudiantes === null ? (
            <p className="text-sm text-slate-400">Cargando estudiantes...</p>
          ) : estudiantes.length === 0 ? (
            <p className="text-sm text-slate-400">
              Este grupo no tiene estudiantes cargados todavía. Pídele al administrador que los importe.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {estudiantes.map(e => (
                <button
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  disabled={guardandoId === e.id}
                  className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-left transition ${
                    marcados[e.id] ? 'bg-red-50' : 'bg-slate-50'
                  }`}
                >
                  <span className="text-sm text-slate-800">{e.nombre}</span>
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-extrabold border-2 ${
                      marcados[e.id]
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-slate-300 text-transparent'
                    }`}
                  >
                    X
                  </span>
                </button>
              ))}
            </div>
          )}

          {mensaje && <p className="text-sm text-red-600 mt-3">{mensaje}</p>}
        </div>
      </div>
    </Layout>
  )
}
