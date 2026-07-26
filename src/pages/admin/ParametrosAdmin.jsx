import { useState, useEffect } from 'react'
import { useConfiguracion } from '../../context/ConfiguracionContext'
import { supabase } from '../../lib/supabase'

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

// Evita el clásico 39.99999999 al sumar decimales.
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

export default function ParametrosAdmin() {
  const { config, recargar } = useConfiguracion()

  const [parametros, setParametros] = useState(null)
  const [plantilla, setPlantilla]   = useState({})   // { [parametro_id]: [{id, orden, peso}] }
  const [notaMinima, setNotaMinima] = useState('')

  const [guardandoParams, setGuardandoParams] = useState(false)
  const [guardandoPesos,  setGuardandoPesos]  = useState(false)
  const [guardandoNota,   setGuardandoNota]   = useState(false)

  const [mensaje, setMensaje] = useState('')
  const [error,   setError]   = useState('')

  const cargar = async () => {
    const [paramRes, plantRes] = await Promise.all([
      supabase.from('parametros').select('*').order('orden'),
      supabase.from('subparametro_plantilla').select('*').order('orden'),
    ])

    if (paramRes.error) {
      setError('No se pudieron cargar los parámetros: ' + paramRes.error.message)
      setParametros([])
      return
    }

    setParametros(paramRes.data || [])

    const mapa = {}
    ;(plantRes.data || []).forEach(sp => {
      if (!mapa[sp.parametro_id]) mapa[sp.parametro_id] = []
      mapa[sp.parametro_id].push({ ...sp })
    })
    setPlantilla(mapa)
  }

  useEffect(() => { cargar() }, [])

  useEffect(() => {
    if (config && config.nota_minima != null) setNotaMinima(String(config.nota_minima))
  }, [config])

  // ---- edición en memoria ----------------------------------------------
  const cambiarParametro = (id, campo, valor) => {
    setParametros(prev => prev.map(p => (p.id === id ? { ...p, [campo]: valor } : p)))
  }

  const cambiarPeso = (parametroId, spId, valor) => {
    setPlantilla(prev => ({
      ...prev,
      [parametroId]: prev[parametroId].map(sp => (sp.id === spId ? { ...sp, peso: valor } : sp)),
    }))
  }

  // ---- guardado ---------------------------------------------------------
  const guardarParametros = async () => {
    setMensaje(''); setError('')

    for (const p of parametros) {
      if (!String(p.nombre).trim()) { setError('Ningún parámetro puede quedar sin nombre.'); return }
      const n = aNumero(p.porcentaje)
      if (Number.isNaN(n) || n < 0 || n > 100) {
        setError(`El porcentaje de "${p.nombre}" debe ser un número entre 0 y 100.`)
        return
      }
    }
    if (round2(suma(parametros.map(p => p.porcentaje))) !== 100) {
      setError('Los porcentajes de Saber, Hacer y Ser deben sumar exactamente 100%.')
      return
    }

    setGuardandoParams(true)
    const resultados = await Promise.all(
      parametros.map(p =>
        supabase
          .from('parametros')
          .update({ nombre: String(p.nombre).trim(), porcentaje: aNumero(p.porcentaje) })
          .eq('id', p.id)
      )
    )
    setGuardandoParams(false)

    const fallo = resultados.find(r => r.error)
    if (fallo) { setError('Error al guardar: ' + fallo.error.message); return }

    setMensaje('Parámetros guardados.')
    cargar()
  }

  const guardarPesos = async () => {
    setMensaje(''); setError('')

    for (const p of parametros) {
      const subs = plantilla[p.id] || []
      for (const sp of subs) {
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

    setGuardandoPesos(true)
    const filas = Object.values(plantilla).flat()
    const resultados = await Promise.all(
      filas.map(sp =>
        supabase
          .from('subparametro_plantilla')
          .update({ peso: aNumero(sp.peso) })
          .eq('id', sp.id)
      )
    )
    setGuardandoPesos(false)

    const fallo = resultados.find(r => r.error)
    if (fallo) { setError('Error al guardar: ' + fallo.error.message); return }

    setMensaje('Pesos de la plantilla guardados.')
    cargar()
  }

  const guardarNotaMinima = async () => {
    setMensaje(''); setError('')
    const n = aNumero(notaMinima)
    if (Number.isNaN(n) || n < 0 || n > 100) {
      setError('La nota mínima debe ser un número entre 0 y 100.')
      return
    }

    setGuardandoNota(true)
    const { error: err } = await supabase
      .from('configuracion').update({ nota_minima: n }).eq('id', 1)
    setGuardandoNota(false)

    if (err) { setError('Error al guardar la nota mínima: ' + err.message); return }
    setMensaje(`Nota mínima para aprobar: ${n}.`)
    recargar()
  }

  if (parametros === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  if (parametros.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
        <h2 className="text-sm font-bold text-amber-900 mb-1">Falta ejecutar el SQL</h2>
        <p className="text-sm text-amber-800">
          No hay parámetros configurados. Ejecuta <code className="bg-amber-100 px-1 rounded font-mono text-xs">
          sql/2026-07-25_calificaciones-capa1.sql</code> en el SQL Editor de Supabase y vuelve a esta pantalla.
        </p>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    )
  }

  const totalPorcentajes = suma(parametros.map(p => p.porcentaje))

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------------ */}
      {/* Parámetros: Saber / Hacer / Ser                               */}
      {/* ------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <h2 className="text-lg font-bold text-slate-800">Parámetros de evaluación</h2>
          <BadgeSuma total={totalPorcentajes} />
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Son <b>globales</b>: aplican a todas las materias del colegio. La definitiva de cada
          materia se calcula ponderando estos tres porcentajes, que deben sumar 100%.
        </p>

        <div className="flex flex-col gap-3">
          {parametros.map(p => (
            <div key={p.id} className="flex flex-wrap items-end gap-3">
              <div className="w-8 h-10 flex items-center justify-center text-xs font-bold text-slate-400">
                {p.orden}
              </div>
              <div className="flex-1 min-w-[10rem]">
                <label className="text-xs font-semibold text-slate-600 block mb-1">Nombre</label>
                <input
                  value={p.nombre}
                  onChange={e => cambiarParametro(p.id, 'nombre', e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                />
              </div>
              <div className="w-32">
                <label className="text-xs font-semibold text-slate-600 block mb-1">Porcentaje</label>
                <div className="flex items-center gap-1">
                  <input
                    value={p.porcentaje}
                    onChange={e => cambiarParametro(p.id, 'porcentaje', e.target.value)}
                    inputMode="decimal"
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={guardarParametros}
          disabled={guardandoParams}
          className="mt-4 bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {guardandoParams ? 'Guardando...' : 'Guardar parámetros'}
        </button>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Plantilla de subparámetros                                    */}
      {/* ------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Pesos iniciales de los subparámetros</h2>
        <p className="text-sm text-slate-500 mb-4">
          Cada parámetro tiene 4 subparámetros cuyos pesos deben sumar 100%. Esto es solo la
          <b> plantilla de arranque</b>: cuando el docente configure su materia, se copian estos
          valores y él podrá renombrarlos y ajustarlos.
        </p>

        <div className="flex flex-col gap-5">
          {parametros.map(p => {
            const subs = plantilla[p.id] || []
            const totalPesos = suma(subs.map(sp => sp.peso))
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                    {p.nombre}
                  </p>
                  <BadgeSuma total={totalPesos} />
                </div>

                {subs.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Este parámetro no tiene subparámetros en la plantilla. Vuelve a ejecutar el SQL de la Capa 1.
                  </p>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))' }}>
                    {subs.map(sp => (
                      <div key={sp.id}>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Subparámetro {sp.orden}
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            value={sp.peso}
                            onChange={e => cambiarPeso(p.id, sp.id, e.target.value)}
                            inputMode="decimal"
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white"
                          />
                          <span className="text-sm text-slate-500">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={guardarPesos}
          disabled={guardandoPesos}
          className="mt-4 bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {guardandoPesos ? 'Guardando...' : 'Guardar pesos'}
        </button>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Nota mínima                                                   */}
      {/* ------------------------------------------------------------ */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Nota mínima para aprobar</h2>
        <p className="text-sm text-slate-500 mb-4">
          Un estudiante aprueba la materia cuando su definitiva es <b>mayor o igual</b> a este
          valor. La escala del colegio es de 0 a 100.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-32">
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nota mínima</label>
            <input
              value={notaMinima}
              onChange={e => setNotaMinima(e.target.value)}
              inputMode="decimal"
              placeholder="70"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
          <button
            onClick={guardarNotaMinima}
            disabled={guardandoNota}
            className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {guardandoNota ? 'Guardando...' : 'Guardar nota mínima'}
          </button>
        </div>
      </div>

      {error   && <p className="text-sm text-red-600">{error}</p>}
      {mensaje && <p className="text-sm text-emerald-700">{mensaje}</p>}
    </div>
  )
}
