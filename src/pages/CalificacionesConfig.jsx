import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// Acepta coma decimal ("12,5") además de punto: los docentes escriben con coma.
function aNumero(v) {
  const n = Number(String(v ?? '').replace(',', '.').trim())
  return Number.isFinite(n) ? n : NaN
}

function suma(valores) {
  return valores.reduce((acc, v) => {
    const n = aNumero(v)
    return acc + (Number.isNaN(n) ? 0 : n)
  }, 0)
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100
}

function BadgeSuma({ total }) {
  const ok = round2(total) === 100
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
      }`}
    >
      Suma: {round2(total)}%{ok ? '' : ' — debe ser 100%'}
    </span>
  )
}

export default function CalificacionesConfig() {
  const { docente } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx, setSelIdx] = useState(0)
  const [parametros, setParametros] = useState(null)
  // { [parametro_id]: [{id, orden, nombre, peso}] }
  const [subparametros, setSubparametros] = useState(null)

  const [cargandoSub, setCargandoSub] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const [asignRes, paramRes] = await Promise.all([
        supabase
          .from('asignaciones')
          .select(`id, grupo_id, materia_id,
            grupos(nombre, grados(nombre)),
            materias(nombre)`)
          .eq('docente_id', docente.id),
        supabase.from('parametros').select('*').order('orden'),
      ])
      const listaAsign = asignRes.data || []
      setAsignaciones(listaAsign)
      setParametros(paramRes.data || [])

      const asignacionId = location.state?.asignacionId
      if (asignacionId) {
        const idx = listaAsign.findIndex(a => a.id === asignacionId)
        if (idx >= 0) setSelIdx(idx)
      }
    })()
  }, [docente.id])

  const asign = asignaciones?.[selIdx]

  useEffect(() => {
    if (!asign) return
    cargarSubparametros()
  }, [asign?.id])

  const agrupar = (filas) => {
    const mapa = {}
    filas.forEach(sp => {
      if (!mapa[sp.parametro_id]) mapa[sp.parametro_id] = []
      mapa[sp.parametro_id].push({ ...sp })
    })
    Object.values(mapa).forEach(lista => lista.sort((a, b) => a.orden - b.orden))
    return mapa
  }

  const cargarSubparametros = async () => {
    setCargandoSub(true)
    setSubparametros(null)
    setMensaje(''); setError('')

    const { data, error: err } = await supabase
      .from('subparametros')
      .select('*')
      .eq('asignacion_id', asign.id)

    if (err) {
      setError('No se pudieron cargar los subparámetros: ' + err.message)
      setCargandoSub(false)
      return
    }

    if ((data || []).length === 0) {
      await instanciarDesdeplantilla()
      return
    }

    setSubparametros(agrupar(data))
    setCargandoSub(false)
  }

  // Primera vez que se abre la config de esta asignación: copiar la plantilla.
  const instanciarDesdeplantilla = async () => {
    const { data: plantilla, error: errPlantilla } = await supabase
      .from('subparametro_plantilla')
      .select('*')

    if (errPlantilla) {
      setError('No se pudo cargar la plantilla: ' + errPlantilla.message)
      setCargandoSub(false)
      return
    }

    const filas = (plantilla || []).map(sp => ({
      asignacion_id: asign.id,
      parametro_id: sp.parametro_id,
      orden: sp.orden,
      peso: sp.peso,
      nombre: `Subparámetro ${sp.orden}`,
    }))

    if (filas.length === 0) {
      setError('No hay una plantilla configurada. Pídele al administrador que revise Config → Calificaciones.')
      setSubparametros({})
      setCargandoSub(false)
      return
    }

    const { error: errInsert } = await supabase.from('subparametros').insert(filas)
    if (errInsert) {
      setError('No se pudo crear la configuración inicial: ' + errInsert.message)
      setCargandoSub(false)
      return
    }

    const { data: nuevos } = await supabase
      .from('subparametros').select('*').eq('asignacion_id', asign.id)
    setSubparametros(agrupar(nuevos || []))
    setCargandoSub(false)
  }

  const cambiarCampo = (parametroId, spId, campo, valor) => {
    setSubparametros(prev => ({
      ...prev,
      [parametroId]: prev[parametroId].map(sp => (sp.id === spId ? { ...sp, [campo]: valor } : sp)),
    }))
  }

  const guardarCambios = async () => {
    setMensaje(''); setError('')

    for (const p of parametros) {
      const subs = subparametros[p.id] || []
      for (const sp of subs) {
        if (!String(sp.nombre).trim()) {
          setError(`El subparámetro ${sp.orden} de "${p.nombre}" no puede quedar sin nombre.`)
          return
        }
        const n = aNumero(sp.peso)
        if (Number.isNaN(n) || n < 0 || n > 100) {
          setError(`El peso del subparámetro ${sp.orden} de "${p.nombre}" debe ser un número entre 0 y 100.`)
          return
        }
      }
      if (round2(suma(subs.map(sp => sp.peso))) !== 100) {
        setError(`Los pesos de los subparámetros de "${p.nombre}" deben sumar exactamente 100%.`)
        return
      }
    }

    setGuardando(true)
    const filas = Object.values(subparametros).flat()
    const resultados = await Promise.all(
      filas.map(sp =>
        supabase
          .from('subparametros')
          .update({ nombre: String(sp.nombre).trim(), peso: aNumero(sp.peso) })
          .eq('id', sp.id)
      )
    )
    setGuardando(false)

    const fallo = resultados.find(r => r.error)
    if (fallo) { setError('Error al guardar: ' + fallo.error.message); return }

    setMensaje('Subparámetros guardados.')
    cargarSubparametros()
  }

  if (asignaciones === null || parametros === null) {
    return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>
  }

  if (asignaciones.length === 0) {
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

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/docente')}
            className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            ← Volver
          </button>
          <h1 className="text-xl font-bold text-slate-800">Subparámetros de mi materia</h1>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          {asignaciones.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Grupo y materia</label>
              <select value={selIdx} onChange={e => setSelIdx(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full">
                {asignaciones.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.grupos.grados.nombre} {a.grupos.nombre} — {a.materias.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {asign && (
            <div className="font-bold text-slate-800">
              {asign.grupos.grados.nombre} {asign.grupos.nombre} · {asign.materias.nombre}
            </div>
          )}

          <p className="text-sm text-slate-500">
            Cada parámetro tiene 4 subparámetros cuyos pesos deben sumar 100%. Puedes cambiar el
            nombre (ej. "Tareas", "Quiz") y el peso de cada uno para esta materia.
          </p>
        </div>

        {cargandoSub || subparametros === null ? (
          <p className="text-slate-500 text-sm">Cargando subparámetros...</p>
        ) : (
          <div className="flex flex-col gap-4">
            {parametros.map(p => {
              const subs = subparametros[p.id] || []
              const totalPesos = suma(subs.map(sp => sp.peso))
              return (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{p.nombre}</p>
                      <p className="text-xs text-slate-400">{p.porcentaje}% de la definitiva</p>
                    </div>
                    <BadgeSuma total={totalPesos} />
                  </div>

                  {subs.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      Este parámetro no tiene subparámetros todavía. Recarga la página.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {subs.map(sp => (
                        <div key={sp.id} className="flex flex-wrap items-end gap-3">
                          <div className="w-6 text-xs font-bold text-slate-400 pb-2">{sp.orden}</div>
                          <div className="flex-1 min-w-[10rem]">
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Nombre</label>
                            <input
                              value={sp.nombre}
                              onChange={e => cambiarCampo(p.id, sp.id, 'nombre', e.target.value)}
                              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                            />
                          </div>
                          <div className="w-28">
                            <label className="text-xs font-semibold text-slate-600 block mb-1">Peso</label>
                            <div className="flex items-center gap-1">
                              <input
                                value={sp.peso}
                                onChange={e => cambiarCampo(p.id, sp.id, 'peso', e.target.value)}
                                inputMode="decimal"
                                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                              />
                              <span className="text-sm text-slate-500">%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            <div>
              <button
                onClick={guardarCambios}
                disabled={guardando}
                className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}

        {error   && <p className="text-sm text-red-600">{error}</p>}
        {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
      </div>
    </Layout>
  )
}
