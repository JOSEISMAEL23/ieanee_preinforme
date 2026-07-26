import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function formatearFecha(fechaISO) {
  const [y, m, d] = fechaISO.split('-')
  return `${d}/${m}/${y}`
}

// timestamptz → 'YYYY-MM-DD' en hora local, para poder comparar con las
// columnas `date` de incapacidades (que no llevan zona horaria).
function aFechaLocal(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Días calendario del rango, ambos extremos incluidos.
function diasRango(inicio, fin) {
  return Math.round((new Date(fin) - new Date(inicio)) / 86400000) + 1
}

// Une rangos solapados para no contar dos veces el mismo día cuando un
// estudiante tiene varias incapacidades que se pisan.
function fusionarRangos(rangos) {
  const ordenados = [...rangos].sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
  const salida = []
  ordenados.forEach(r => {
    const ultimo = salida[salida.length - 1]
    if (ultimo && r.inicio <= ultimo.fin) {
      if (r.fin > ultimo.fin) ultimo.fin = r.fin
    } else {
      salida.push({ ...r })
    }
  })
  return salida
}

function cubiertaPorIncapacidad(fecha, rangos) {
  return rangos.some(r => fecha >= r.inicio && fecha <= r.fin)
}

function formatearRango(r) {
  return `${formatearFecha(r.inicio)} — ${formatearFecha(r.fin)}`
}

export default function AsistenciaInforme() {
  const { docente } = useAuth()
  const esAdmin = docente?.rol === 'admin'
  const navigate = useNavigate()

  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [grados, setGrados] = useState([])
  const [gradoId, setGradoId] = useState(null)
  const [letra, setLetra] = useState('A')
  const [asignaciones, setAsignaciones] = useState([]) // asignaciones disponibles para el filtro
  const [asignId, setAsignId] = useState(null)
  const [informe, setInforme] = useState(null) // [{ nombre, faltas: [{fecha}], excusas: [{fecha}] }]
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)

  const LETRAS = ['A', 'B', 'C']

  useEffect(() => {
    (async () => {
      const { data: periodosData } = await supabase
        .from('periodos').select('*').order('created_at', { ascending: false })
      setPeriodos(periodosData || [])
      const activo = (periodosData || []).find(p => p.activo)
      setPeriodoId(activo?.id ?? periodosData?.[0]?.id ?? null)

      if (esAdmin) {
        const { data: gradosData } = await supabase.from('grados').select('*').order('orden')
        setGrados(gradosData || [])
        setGradoId(gradosData?.[0]?.id ?? null)
      } else {
        const { data: asignData } = await supabase
          .from('asignaciones')
          .select(`id, grupo_id, materia_id,
            grupos(letra, grados(id, nombre)),
            materias(nombre)`)
          .eq('docente_id', docente.id)
        setAsignaciones(asignData || [])
        setAsignId(asignData?.[0]?.id ?? null)
      }
      setCargando(false)
    })()
  }, [docente.id, esAdmin])

  useEffect(() => {
    if (!esAdmin || !gradoId) return
    ;(async () => {
      const { data: grupo } = await supabase
        .from('grupos').select('id').eq('grado_id', gradoId).eq('letra', letra).single()
      if (!grupo) { setAsignId(null); setAsignaciones([]); return }
      const { data: asignData } = await supabase
        .from('asignaciones')
        .select(`id, materia_id, materias(nombre), docentes(nombre)`)
        .eq('grupo_id', grupo.id)
      setAsignaciones(asignData || [])
      setAsignId(asignData?.[0]?.id ?? null)
    })()
  }, [gradoId, letra, esAdmin])

  const generarInforme = async () => {
    if (!periodoId || !asignId) return
    setGenerando(true)
    setInforme(null)

    const asign = asignaciones.find(a => a.id === Number(asignId))
    if (!asign) { setGenerando(false); return }

    let grupoId = asign.grupo_id
    if (!grupoId && esAdmin) {
      const { data: grupo } = await supabase
        .from('grupos').select('id').eq('grado_id', gradoId).eq('letra', letra).single()
      grupoId = grupo?.id
    }
    if (!grupoId) { setGenerando(false); return }

    const { data: estudiantes } = await supabase
      .from('estudiantes').select('id, nombre').eq('grupo_id', grupoId).order('nombre')

    // Ventana de asistencia del periodo: acota qué incapacidades "caen" en él.
    // Si el admin no definió fechas, no hay recorte y se cuentan completas.
    const periodo = periodos.find(p => p.id === periodoId)
    const desde = periodo?.asistencia_fecha_inicio ? aFechaLocal(periodo.asistencia_fecha_inicio) : null
    const hasta = periodo?.asistencia_fecha_limite ? aFechaLocal(periodo.asistencia_fecha_limite) : null

    const ids = (estudiantes || []).map(e => e.id)
    let registros = []
    let incaps = []
    if (ids.length > 0) {
      let queryIncap = supabase
        .from('incapacidades')
        .select('estudiante_id, fecha_inicio, fecha_fin')
        .in('estudiante_id', ids)
      if (hasta) queryIncap = queryIncap.lte('fecha_inicio', hasta)
      if (desde) queryIncap = queryIncap.gte('fecha_fin', desde)

      const [asistRes, incapRes] = await Promise.all([
        supabase
          .from('asistencias')
          .select('estudiante_id, fecha, estado')
          .eq('periodo_id', periodoId)
          .eq('asignacion_id', asignId)
          .in('estudiante_id', ids)
          .in('estado', ['falta', 'excusa'])
          .order('fecha'),
        queryIncap,
      ])
      registros = asistRes.data || []
      incaps = incapRes.data || []
    }

    const mapaFaltas = {}
    const mapaExcusas = {}
    const mapaIncap = {}
    ;(estudiantes || []).forEach(e => {
      mapaFaltas[e.id] = []; mapaExcusas[e.id] = []; mapaIncap[e.id] = []
    })
    registros.forEach(r => {
      if (r.estado === 'falta') mapaFaltas[r.estudiante_id]?.push(r.fecha)
      if (r.estado === 'excusa') mapaExcusas[r.estudiante_id]?.push(r.fecha)
    })
    incaps.forEach(i => {
      // Recortar el rango a la ventana del periodo antes de contar días
      const inicio = desde && i.fecha_inicio < desde ? desde : i.fecha_inicio
      const fin    = hasta && i.fecha_fin    > hasta ? hasta : i.fecha_fin
      if (fin < inicio) return
      mapaIncap[i.estudiante_id]?.push({ inicio, fin })
    })
    Object.keys(mapaIncap).forEach(k => { mapaIncap[k] = fusionarRangos(mapaIncap[k]) })

    const resultado = (estudiantes || [])
      .map(e => {
        const rangos = mapaIncap[e.id] || []
        return {
          id: e.id,
          nombre: e.nombre,
          // Regla central: un día cubierto por incapacidad NO cuenta como falla.
          faltas:  (mapaFaltas[e.id]  || []).filter(f => !cubiertaPorIncapacidad(f, rangos)),
          excusas: (mapaExcusas[e.id] || []).filter(f => !cubiertaPorIncapacidad(f, rangos)),
          incapacidades: rangos,
          diasIncapacidad: rangos.reduce((n, r) => n + diasRango(r.inicio, r.fin), 0),
        }
      })
      .filter(e => e.faltas.length > 0 || e.excusas.length > 0 || e.incapacidades.length > 0)
      .sort((a, b) => b.faltas.length - a.faltas.length)

    setInforme({ estudiantes: resultado, asign, total: estudiantes?.length ?? 0 })
    setGenerando(false)
  }

  const exportarExcel = () => {
    if (!informe) return
    const header = [
      'Estudiante', 'Total Fallas', 'Fechas de Fallas', 'Total Excusas', 'Fechas de Excusas',
      'Total Días Incapacidad', 'Rangos de Incapacidad',
    ]
    const filas = informe.estudiantes.map(e => [
      e.nombre,
      e.faltas.length,
      e.faltas.map(formatearFecha).join(', '),
      e.excusas.length,
      e.excusas.map(formatearFecha).join(', '),
      e.diasIncapacidad,
      e.incapacidades.map(formatearRango).join(', '),
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...filas])
    ws['!cols'] = [
      { wch: 35 }, { wch: 12 }, { wch: 50 }, { wch: 14 }, { wch: 50 },
      { wch: 20 }, { wch: 50 },
    ]
    const wb = XLSX.utils.book_new()
    const periodo = periodos.find(p => p.id === periodoId)
    const a = informe.asign
    const sheetName = `${a.grupos?.grados?.nombre ?? ''} ${a.grupos?.letra ?? ''} ${a.materias?.nombre ?? ''}`.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `Asistencia_${sheetName}_${periodo?.nombre ?? ''}.xlsx`)
  }

  if (cargando) return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>

  return (
    <Layout>
      <div className="max-w-4xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(esAdmin ? '/admin' : '/asistencia')}
              className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              ← Volver
            </button>
            <h1 className="text-xl font-bold text-slate-800">Informe de asistencia</h1>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Periodo</label>
              <select value={periodoId ?? ''} onChange={e => setPeriodoId(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' (activo)' : ''}</option>)}
              </select>
            </div>

            {esAdmin && (
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
                    {LETRAS.map(l => (
                      <button key={l} onClick={() => setLetra(l)}
                        className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                          letra === l ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 border-slate-300'
                        }`}>{l}</button>
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
                    {esAdmin
                      ? `${a.materias?.nombre} — ${a.docentes?.nombre}`
                      : `${a.grupos?.grados?.nombre} ${a.grupos?.letra} — ${a.materias?.nombre}`}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={generarInforme} disabled={generando || !periodoId || !asignId}
              className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
              {generando ? 'Generando...' : 'Generar informe'}
            </button>
          </div>
        </div>

        {informe && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-slate-800">
                  {informe.asign.grupos?.grados?.nombre} {informe.asign.grupos?.letra} — {informe.asign.materias?.nombre}
                  {esAdmin && informe.asign.docentes?.nombre && (
                    <span className="text-slate-500 font-normal text-sm ml-2">· {informe.asign.docentes.nombre}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {informe.estudiantes.length} de {informe.total} estudiantes con fallas, excusas o incapacidades
                </div>
              </div>
              <button onClick={exportarExcel}
                className="bg-white border border-emerald-700 text-emerald-800 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-50 transition">
                Exportar Excel
              </button>
            </div>

            {informe.estudiantes.length === 0 ? (
              <div className="px-5 py-10 text-center text-slate-400 text-sm">
                Ningún estudiante tiene fallas, excusas o incapacidades registradas en este periodo para esta materia.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {informe.estudiantes.map(e => (
                  <div key={e.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="font-semibold text-slate-800 text-sm">{e.nombre}</div>
                      <div className="flex gap-3 shrink-0">
                        <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full">
                          {e.faltas.length} falla{e.faltas.length !== 1 ? 's' : ''}
                        </span>
                        {e.excusas.length > 0 && (
                          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full">
                            {e.excusas.length} excusa{e.excusas.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {e.diasIncapacidad > 0 && (
                          <span className="bg-sky-100 text-sky-800 text-xs font-bold px-3 py-1 rounded-full">
                            🩹 {e.diasIncapacidad} día{e.diasIncapacidad !== 1 ? 's' : ''} incapacidad
                          </span>
                        )}
                      </div>
                    </div>
                    {e.faltas.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {e.faltas.map(f => (
                          <span key={f} className="bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-0.5 rounded-md">
                            {formatearFecha(f)}
                          </span>
                        ))}
                      </div>
                    )}
                    {e.excusas.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.excusas.map(f => (
                          <span key={f} className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-2 py-0.5 rounded-md">
                            {formatearFecha(f)}
                          </span>
                        ))}
                      </div>
                    )}
                    {e.incapacidades.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.incapacidades.map(r => (
                          <span key={`${r.inicio}-${r.fin}`} className="bg-sky-50 border border-sky-200 text-sky-800 text-xs px-2 py-0.5 rounded-md">
                            🩹 {formatearRango(r)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
