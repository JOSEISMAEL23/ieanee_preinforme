import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useConfiguracion } from '../context/ConfiguracionContext'
import { supabase } from '../lib/supabase'
import { etiquetaPeriodo, etiquetaPeriodoConEstado } from '../lib/periodos'


// Redondeo half-up a 2 decimales (motor de cálculo, sección 4 de la spec).
function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100
}

function promedioSimple(valores) {
  if (valores.length === 0) return null
  return round2(valores.reduce((a, b) => a + b, 0) / valores.length)
}

function formatearFecha(fechaISO) {
  const d = new Date(fechaISO)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Motor de cálculo (sección 4 de la spec):
 * 1. notaSubparametro = promedio simple de las notas del subparámetro (null si no hay ninguna).
 * 2. notaParametro = ponderado por peso de subparámetro. Si falta algún subparámetro del
 *    parámetro, el parámetro también queda "Incompleto" (null) — nunca se pondera con un
 *    vacío como si fuera 0.
 * 3. definitiva = ponderado por %parámetro, solo si los 3 parámetros están completos.
 * 4. aprueba = definitiva >= nota_minima (null si la definitiva es "Incompleta").
 */
function calcularEstudiante({ notasPorSubparametro, subparametros, subsPorParametro, parametros, notaMinima }) {
  const subPromedios = {}
  const faltantes = []

  subparametros.forEach(sp => {
    const valores = notasPorSubparametro[sp.id] || []
    const prom = promedioSimple(valores)
    subPromedios[sp.id] = prom
    if (prom === null) {
      const p = parametros.find(x => x.id === sp.parametro_id)
      faltantes.push({ parametro: p?.nombre ?? '?', subparametro: sp.nombre })
    }
  })

  const paramNotas = {}
  parametros.forEach(p => {
    const subs = subsPorParametro[p.id] || []
    const incompleto = subs.length === 0 || subs.some(sp => subPromedios[sp.id] === null)
    paramNotas[p.id] = incompleto
      ? null
      : round2(subs.reduce((acc, sp) => acc + subPromedios[sp.id] * (sp.peso / 100), 0))
  })

  const incompleta = faltantes.length > 0
  const definitiva = incompleta
    ? null
    : round2(parametros.reduce((acc, p) => acc + (paramNotas[p.id] ?? 0) * (p.porcentaje / 100), 0))
  const aprueba = definitiva !== null ? definitiva >= notaMinima : null

  return { subPromedios, paramNotas, definitiva, aprueba, incompleta, faltantes }
}

function EstadoBadge({ incompleta, aprueba }) {
  if (incompleta) {
    return <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">Incompleta</span>
  }
  return aprueba
    ? <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Aprueba</span>
    : <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">Pierde</span>
}

export default function CalificacionesInforme() {
  const { docente } = useAuth()
  const { config } = useConfiguracion()
  const esAdmin = docente?.rol === 'admin'
  const navigate = useNavigate()
  const notaMinima = config?.nota_minima ?? 70

  // Un delegado con el permiso ver_informes_notas ve el mismo consolidado
  // completo que un admin (la RLS de notas ya se lo permite, capa 1 de
  // permisos delegados). Mismo mecanismo de consulta que ProtectedRoute.
  const [verificandoPermiso, setVerificandoPermiso] = useState(!esAdmin)
  const [tienePermisoInformes, setTienePermisoInformes] = useState(false)

  useEffect(() => {
    if (esAdmin) {
      setTienePermisoInformes(true)
      setVerificandoPermiso(false)
      return
    }
    let cancelado = false
    setVerificandoPermiso(true)
    supabase
      .from('permisos_usuario')
      .select('activo')
      .eq('docente_id', docente.id)
      .eq('permiso', 'ver_informes_notas')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setTienePermisoInformes(!!data?.activo)
        setVerificandoPermiso(false)
      })
    return () => { cancelado = true }
  }, [docente.id, esAdmin])

  // puedeVerTodo reemplaza a esAdmin en toda la lógica de alcance de esta
  // pantalla (qué carga, qué se ve): admin o delegado con el permiso ven el
  // consolidado completo de todo el colegio; cualquier otro docente sigue
  // viendo únicamente sus propias asignaciones, exactamente como hoy.
  const puedeVerTodo = esAdmin || tienePermisoInformes

  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [grados, setGrados] = useState([])
  const [gradoId, setGradoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [nombre, setNombre] = useState(null)
  const [asignaciones, setAsignaciones] = useState([])
  const [asignId, setAsignId] = useState(null)

  const [parametros, setParametros] = useState([])
  const [informe, setInforme] = useState(null)
  const [vista, setVista] = useState('consolidado') // 'consolidado' | 'detallado'
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (verificandoPermiso) return // espera a saber si es delegado con el permiso, evita cargar la vista propia y luego cambiar a la completa
    (async () => {
      const [periodosRes, paramRes] = await Promise.all([
        supabase.from('periodos').select('*').order('created_at', { ascending: false }),
        supabase.from('parametros').select('*').order('orden'),
      ])

      const listaPeriodos = periodosRes.data || []
      setPeriodos(listaPeriodos)
      const activo = listaPeriodos.find(p => p.activo)
      setPeriodoId(activo?.id ?? listaPeriodos[0]?.id ?? null)
      setParametros(paramRes.data || [])

      if (puedeVerTodo) {
        const { data: gradosData } = await supabase.from('grados').select('*').order('orden')
        setGrados(gradosData || [])
        setGradoId(gradosData?.[0]?.id ?? null)
      } else {
        const { data: asignData } = await supabase
          .from('asignaciones')
          .select(`id, grupo_id, materia_id,
            grupos(nombre, grados(id, nombre)),
            materias(nombre)`)
          .eq('docente_id', docente.id)
        setAsignaciones(asignData || [])
        setAsignId(asignData?.[0]?.id ?? null)
      }
      setCargando(false)
    })()
  }, [docente.id, puedeVerTodo, verificandoPermiso])

  // Los grupos del grado, en su orden. Antes esta lista era una constante fija
  // con A, B y C escrita a mano.
  useEffect(() => {
    if (!puedeVerTodo || !gradoId) return
    ;(async () => {
      const { data } = await supabase
        .from('grupos').select('id, nombre').eq('grado_id', gradoId).order('orden')
      const lista = data || []
      setGrupos(lista)
      setNombre(prev => lista.some(g => g.nombre === prev) ? prev : (lista[0]?.nombre ?? null))
    })()
  }, [gradoId, puedeVerTodo])

  useEffect(() => {
    if (!puedeVerTodo || !gradoId || !nombre) return
    ;(async () => {
      const { data: grupo } = await supabase
        .from('grupos').select('id').eq('grado_id', gradoId).eq('nombre', nombre).single()
      if (!grupo) { setAsignId(null); setAsignaciones([]); return }
      const { data: asignData } = await supabase
        .from('asignaciones')
        .select(`id, grupo_id, materia_id, materias(nombre), docentes(nombre)`)
        .eq('grupo_id', grupo.id)
      setAsignaciones(asignData || [])
      setAsignId(asignData?.[0]?.id ?? null)
    })()
  }, [gradoId, nombre, puedeVerTodo])

  const generarInforme = async () => {
    if (!periodoId || !asignId) return
    setGenerando(true)
    setInforme(null)
    setError('')

    const asign = asignaciones.find(a => a.id === Number(asignId))
    if (!asign) { setGenerando(false); return }

    let grupoId = asign.grupo_id
    if (!grupoId && puedeVerTodo) {
      const { data: grupo } = await supabase
        .from('grupos').select('id').eq('grado_id', gradoId).eq('nombre', nombre).single()
      grupoId = grupo?.id
    }
    if (!grupoId) { setGenerando(false); return }

    if (parametros.length === 0) {
      setError('El administrador todavía no ha configurado los parámetros de evaluación (Saber/Hacer/Ser).')
      setGenerando(false)
      return
    }

    const [estRes, subRes] = await Promise.all([
      supabase.from('estudiantes').select('id, nombre').eq('grupo_id', grupoId).order('nombre'),
      supabase.from('subparametros').select('*').eq('asignacion_id', asignId),
    ])

    const estudiantes = estRes.data || []
    const subparametros = subRes.data || []

    if (subparametros.length === 0) {
      setError('Esta asignación no tiene subparámetros configurados todavía. El docente debe configurarlos primero en "Subparámetros".')
      setGenerando(false)
      return
    }

    const subsPorParametro = {}
    subparametros.forEach(sp => {
      if (!subsPorParametro[sp.parametro_id]) subsPorParametro[sp.parametro_id] = []
      subsPorParametro[sp.parametro_id].push(sp)
    })
    Object.values(subsPorParametro).forEach(lista => lista.sort((a, b) => a.orden - b.orden))

    const ids = estudiantes.map(e => e.id)
    let notas = []
    if (ids.length > 0) {
      const { data } = await supabase
        .from('notas')
        .select('estudiante_id, subparametro_id, valor, descripcion, created_at')
        .eq('periodo_id', periodoId)
        .eq('asignacion_id', asignId)
        .in('estudiante_id', ids)
        .order('created_at')
      notas = data || []
    }

    const notasPorEstudiante = {} // { estId: [{subparametro_id, valor, descripcion, created_at}] }
    estudiantes.forEach(e => { notasPorEstudiante[e.id] = [] })
    notas.forEach(n => { notasPorEstudiante[n.estudiante_id]?.push(n) })

    const resultado = estudiantes.map(e => {
      const notasEst = notasPorEstudiante[e.id] || []
      const notasPorSubparametro = {}
      notasEst.forEach(n => {
        if (!notasPorSubparametro[n.subparametro_id]) notasPorSubparametro[n.subparametro_id] = []
        notasPorSubparametro[n.subparametro_id].push(n.valor)
      })

      const calculo = calcularEstudiante({
        notasPorSubparametro, subparametros, subsPorParametro, parametros, notaMinima,
      })

      return { id: e.id, nombre: e.nombre, notas: notasEst, ...calculo }
    })

    setInforme({
      asign, total: estudiantes.length,
      subparametros, subsPorParametro,
      estudiantes: resultado,
    })
    setGenerando(false)
  }

  // Columnas del consolidado: por cada parámetro, sus subparámetros + su nota ponderada.
  const columnas = informe
    ? parametros.map(p => ({ parametro: p, subs: informe.subsPorParametro[p.id] || [] }))
    : []

  const exportarExcel = () => {
    if (!informe) return
    const periodo = periodos.find(p => p.id === periodoId)
    const a = informe.asign
    const nombreHoja = `${a.grupos?.grados?.nombre ?? ''} ${a.grupos?.nombre ?? ''} ${a.materias?.nombre ?? ''}`.trim()

    // ---- hoja 1: consolidado ----
    const headerConsolidado = ['Estudiante']
    columnas.forEach(({ parametro, subs }) => {
      subs.forEach(sp => headerConsolidado.push(`${parametro.nombre} — ${sp.nombre}`))
      headerConsolidado.push(`Nota ${parametro.nombre}`)
    })
    headerConsolidado.push('Definitiva', 'Estado')

    const filasConsolidado = informe.estudiantes.map(e => {
      const fila = [e.nombre]
      columnas.forEach(({ parametro, subs }) => {
        subs.forEach(sp => fila.push(e.subPromedios[sp.id] ?? ''))
        fila.push(e.paramNotas[parametro.id] ?? '')
      })
      fila.push(e.definitiva ?? '', e.incompleta ? 'Incompleta' : (e.aprueba ? 'Aprueba' : 'Pierde'))
      return fila
    })

    const wsConsolidado = XLSX.utils.aoa_to_sheet([headerConsolidado, ...filasConsolidado])
    wsConsolidado['!cols'] = headerConsolidado.map((_, i) => ({ wch: i === 0 ? 30 : 16 }))

    // ---- hoja 2: detallado ----
    const headerDetallado = ['Estudiante', 'Parámetro', 'Subparámetro', 'Valor', 'Descripción', 'Fecha']
    const filasDetallado = informe.estudiantes.flatMap(e =>
      e.notas.map(n => {
        const sp = informe.subparametros.find(s => s.id === n.subparametro_id)
        const p = parametros.find(x => x.id === sp?.parametro_id)
        return [e.nombre, p?.nombre ?? '', sp?.nombre ?? '', n.valor, n.descripcion ?? '', formatearFecha(n.created_at)]
      })
    )
    const wsDetallado = XLSX.utils.aoa_to_sheet([headerDetallado, ...filasDetallado])
    wsDetallado['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 12 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsConsolidado, 'Consolidado')
    XLSX.utils.book_append_sheet(wb, wsDetallado, 'Detallado')
    XLSX.writeFile(wb, `Calificaciones_${nombreHoja}_${etiquetaPeriodo(periodo)}.xlsx`.slice(0, 200))
  }

  if (cargando) return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>

  return (
    <Layout>
      <div className="max-w-6xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(puedeVerTodo ? '/admin' : '/docente')}
              className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              ← Volver
            </button>
            <h1 className="text-xl font-bold text-slate-800">Informe de calificaciones</h1>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Periodo</label>
              <select value={periodoId ?? ''} onChange={e => setPeriodoId(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {periodos.map(p => <option key={p.id} value={p.id}>{etiquetaPeriodoConEstado(p)}</option>)}
              </select>
            </div>

            {puedeVerTodo && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Grado</label>
                  <select value={gradoId ?? ''} onChange={e => setGradoId(Number(e.target.value))}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Grupo</label>
                  <div className="flex gap-1">
                    {grupos.map(gr => (
                      <button key={gr.id} onClick={() => setNombre(gr.nombre)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                          nombre === gr.nombre ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 border-slate-300'
                        }`}>{gr.nombre}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Materia</label>
              <select value={asignId ?? ''} onChange={e => setAsignId(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {asignaciones.map(a => (
                  <option key={a.id} value={a.id}>
                    {puedeVerTodo
                      ? `${a.materias?.nombre} — ${a.docentes?.nombre}`
                      : `${a.grupos?.grados?.nombre} ${a.grupos?.nombre} — ${a.materias?.nombre}`}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={generarInforme} disabled={generando || !periodoId || !asignId}
              className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
              {generando ? 'Generando...' : 'Generar informe'}
            </button>
          </div>

          <p className="text-xs text-slate-400">Nota mínima para aprobar: {notaMinima}.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {informe && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-slate-800">
                  {informe.asign.grupos?.grados?.nombre} {informe.asign.grupos?.nombre} — {informe.asign.materias?.nombre}
                  {puedeVerTodo && informe.asign.docentes?.nombre && (
                    <span className="text-slate-500 font-normal text-sm ml-2">· {informe.asign.docentes.nombre}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{informe.total} estudiantes</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button
                    onClick={() => setVista('consolidado')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      vista === 'consolidado' ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    Consolidado
                  </button>
                  <button
                    onClick={() => setVista('detallado')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                      vista === 'detallado' ? 'bg-white shadow text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    Detallado
                  </button>
                </div>
                <button onClick={exportarExcel}
                  className="bg-white border border-emerald-700 text-emerald-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-50 transition">
                  Exportar Excel
                </button>
              </div>
            </div>

            {informe.total === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">
                Este grupo no tiene estudiantes cargados todavía.
              </div>
            ) : vista === 'consolidado' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                      <th rowSpan={2} className="px-4 py-2 text-left border-b border-slate-200 sticky left-0 bg-slate-50">
                        Estudiante
                      </th>
                      {columnas.map(({ parametro, subs }) => (
                        <th key={parametro.id} colSpan={subs.length + 1}
                          className="px-3 py-2 text-center border-b border-l border-slate-200">
                          {parametro.nombre} ({parametro.porcentaje}%)
                        </th>
                      ))}
                      <th rowSpan={2} className="px-3 py-2 text-center border-b border-l border-slate-200">Definitiva</th>
                      <th rowSpan={2} className="px-3 py-2 text-center border-b border-slate-200">Estado</th>
                    </tr>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                      {columnas.map(({ parametro, subs }) => (
                        <Fragment key={parametro.id}>
                          {subs.map(sp => (
                            <th key={sp.id} className="px-2 py-2 text-center border-b border-l border-slate-200 font-normal">
                              {sp.nombre}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center border-b border-l border-slate-200 bg-slate-100">
                            Nota
                          </th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {informe.estudiantes.map(e => (
                      <tr key={e.id}>
                        <td className="px-4 py-2.5 text-slate-800 sticky left-0 bg-white">
                          <div>{e.nombre}</div>
                          {e.incompleta && (
                            <div className="text-[11px] text-amber-600 font-medium mt-0.5">
                              Faltan: {e.faltantes.map(f => `${f.parametro} → ${f.subparametro}`).join(', ')}
                            </div>
                          )}
                        </td>
                        {columnas.map(({ parametro, subs }) => (
                          <Fragment key={parametro.id}>
                            {subs.map(sp => (
                              <td key={sp.id} className="px-2 py-2.5 text-center border-l border-slate-100 text-slate-600">
                                {e.subPromedios[sp.id] ?? '—'}
                              </td>
                            ))}
                            <td className="px-2 py-2.5 text-center border-l border-slate-100 font-semibold bg-slate-50">
                              {e.paramNotas[parametro.id] ?? '—'}
                            </td>
                          </Fragment>
                        ))}
                        <td className="px-3 py-2.5 text-center border-l border-slate-100 font-bold text-slate-800">
                          {e.definitiva ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <EstadoBadge incompleta={e.incompleta} aprueba={e.aprueba} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-600 uppercase tracking-wide">
                      <th className="px-4 py-2 text-left border-b border-slate-200">Estudiante</th>
                      <th className="px-3 py-2 text-left border-b border-l border-slate-200">Parámetro</th>
                      <th className="px-3 py-2 text-left border-b border-l border-slate-200">Subparámetro</th>
                      <th className="px-3 py-2 text-center border-b border-l border-slate-200">Valor</th>
                      <th className="px-3 py-2 text-left border-b border-l border-slate-200">Descripción</th>
                      <th className="px-3 py-2 text-center border-b border-l border-slate-200">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {informe.estudiantes.flatMap(e =>
                      e.notas.length === 0
                        ? [
                          <tr key={`${e.id}-vacio`}>
                            <td className="px-4 py-2.5 text-slate-800">{e.nombre}</td>
                            <td colSpan={5} className="px-3 py-2.5 text-slate-400 border-l border-slate-100">Sin notas registradas</td>
                          </tr>,
                        ]
                        : e.notas.map((n, i) => {
                          const sp = informe.subparametros.find(s => s.id === n.subparametro_id)
                          const p = parametros.find(x => x.id === sp?.parametro_id)
                          return (
                            <tr key={n.id ?? `${e.id}-${i}`}>
                              <td className="px-4 py-2.5 text-slate-800">{i === 0 ? e.nombre : ''}</td>
                              <td className="px-3 py-2.5 text-slate-600 border-l border-slate-100">{p?.nombre ?? ''}</td>
                              <td className="px-3 py-2.5 text-slate-600 border-l border-slate-100">{sp?.nombre ?? ''}</td>
                              <td className="px-3 py-2.5 text-center border-l border-slate-100 font-semibold">{n.valor}</td>
                              <td className="px-3 py-2.5 text-slate-500 border-l border-slate-100">{n.descripcion ?? ''}</td>
                              <td className="px-3 py-2.5 text-center border-l border-slate-100 text-slate-500">{formatearFecha(n.created_at)}</td>
                            </tr>
                          )
                        })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
