import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { etiquetaPeriodo, etiquetaPeriodoConEstado } from '../../lib/periodos'
import { useConfiguracion } from '../../context/ConfiguracionContext'

const COLUMNAS_GRILLA = 5

export default function ConsolidadoAdmin() {
  const { config } = useConfiguracion()
  const [periodos, setPeriodos] = useState([])
  const [periodoId, setPeriodoId] = useState(null)
  const [grados, setGrados] = useState([])
  const [gradoId, setGradoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [nombre, setNombre] = useState(null)
  const [vista, setVista] = useState('matriz') // 'matriz' | 'boletines'
  const [datos, setDatos] = useState(null) // { materias, estudiantes, marcasPorEstudiante }
  const [exportandoTodo, setExportandoTodo] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    (async () => {
      const { data: periodosData } = await supabase
        .from('periodos').select('*').order('created_at', { ascending: false })
      setPeriodos(periodosData || [])
      const activo = (periodosData || []).find(p => p.activo)
      setPeriodoId(activo?.id ?? periodosData?.[0]?.id ?? null)

      const { data: gradosData } = await supabase.from('grados').select('*').order('orden')
      setGrados(gradosData || [])
      setGradoId(gradosData?.[0]?.id ?? null)
    })()
  }, [])

  // Los grupos del grado seleccionado, en su orden. Antes esta lista era una
  // constante fija con A, B y C escrita a mano; ahora sale de la tabla.
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

  const cargarDatos = async () => {
    if (!periodoId || !gradoId || !nombre) return
    setDatos(null)

    const { data: grupo } = await supabase
      .from('grupos').select('id').eq('grado_id', gradoId).eq('nombre', nombre).single()
    if (!grupo) { setDatos({ materias: [], estudiantes: [], marcasPorEstudiante: {} }); return }

    const { data: materias } = await supabase
      .from('materias').select('*').eq('grado_id', gradoId).order('orden')
    const { data: estudiantes } = await supabase
      .from('estudiantes').select('*').eq('grupo_id', grupo.id).order('nombre')

    const ids = (estudiantes || []).map(e => e.id)
    let marcas = []
    if (ids.length > 0) {
      const { data } = await supabase
        .from('marcas').select('estudiante_id, materia_id, dificultad')
        .eq('periodo_id', periodoId).in('estudiante_id', ids).eq('dificultad', true)
      marcas = data || []
    }

    const marcasPorEstudiante = {}
    ;(estudiantes || []).forEach(e => { marcasPorEstudiante[e.id] = new Set() })
    marcas.forEach(m => marcasPorEstudiante[m.estudiante_id]?.add(m.materia_id))

    setDatos({ materias: materias || [], estudiantes: estudiantes || [], marcasPorEstudiante })
  }

  useEffect(() => { cargarDatos() }, [periodoId, gradoId, nombre])

  const grado = grados.find(g => g.id === gradoId)
  const periodo = periodos.find(p => p.id === periodoId)

  const exportarGrupoExcel = () => {
    if (!datos || !grado) return
    const { materias, estudiantes, marcasPorEstudiante } = datos
    const header = ['Estudiante', ...materias.map(m => m.nombre), 'Total materias en dificultad']
    const filas = estudiantes.map(e => {
      const dif = marcasPorEstudiante[e.id] || new Set()
      const fila = [e.nombre, ...materias.map(m => dif.has(m.id) ? 'X' : ''), dif.size]
      return fila
    })
    const ws = XLSX.utils.aoa_to_sheet([header, ...filas])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${grado.nombre} ${nombre}`.slice(0, 31))
    XLSX.writeFile(wb, `Consolidado_${grado.nombre}${nombre}_${etiquetaPeriodo(periodo)}.xlsx`)
  }

  const exportarTodoExcel = async () => {
    if (!periodoId) return
    setExportandoTodo(true)
    setMensaje('')
    const wb = XLSX.utils.book_new()
    const resumenFilas = [['Grupo', 'Total estudiantes', 'Estudiantes con al menos una dificultad']]

    for (const g of grados) {
      const { data: materiasG } = await supabase
        .from('materias').select('*').eq('grado_id', g.id).order('orden')
      const { data: gruposG } = await supabase
        .from('grupos').select('id, nombre').eq('grado_id', g.id).order('orden')
      for (const grupo of gruposG || []) {
        const { data: estudiantesG } = await supabase
          .from('estudiantes').select('*').eq('grupo_id', grupo.id).order('nombre')
        if (!estudiantesG || estudiantesG.length === 0) continue

        const ids = estudiantesG.map(e => e.id)
        const { data: marcasG } = await supabase
          .from('marcas').select('estudiante_id, materia_id')
          .eq('periodo_id', periodoId).in('estudiante_id', ids).eq('dificultad', true)

        const marcasPorEst = {}
        estudiantesG.forEach(e => { marcasPorEst[e.id] = new Set() })
        ;(marcasG || []).forEach(m => marcasPorEst[m.estudiante_id]?.add(m.materia_id))

        const header = ['Estudiante', ...materiasG.map(m => m.nombre), 'Total']
        const filas = estudiantesG.map(e => {
          const dif = marcasPorEst[e.id] || new Set()
          return [e.nombre, ...materiasG.map(m => dif.has(m.id) ? 'X' : ''), dif.size]
        })
        const ws = XLSX.utils.aoa_to_sheet([header, ...filas])
        XLSX.utils.book_append_sheet(wb, ws, `${g.nombre}${grupo.nombre}`.slice(0, 31))

        const conDificultad = filas.filter(f => f[f.length - 1] > 0).length
        resumenFilas.push([`${g.nombre} ${grupo.nombre}`, estudiantesG.length, conDificultad])
      }
    }

    const resumenWs = XLSX.utils.aoa_to_sheet(resumenFilas)
    XLSX.utils.book_append_sheet(wb, resumenWs, 'Resumen')
    wb.SheetNames.unshift(wb.SheetNames.pop())
    XLSX.writeFile(wb, `Consolidado_completo_${etiquetaPeriodo(periodo)}.xlsx`)

    setExportandoTodo(false)
    setMensaje('Consolidado completo de los 36 grupos descargado.')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 no-print">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Consolidado</h2>
        <p className="text-sm text-slate-500 mb-4">
          Consulta el resumen por grupo o genera los boletines individuales listos para imprimir y entregar a los padres.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={periodoId ?? ''} onChange={e => setPeriodoId(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {periodos.map(p => (
              <option key={p.id} value={p.id}>{etiquetaPeriodoConEstado(p)}</option>
            ))}
          </select>
          <select value={gradoId ?? ''} onChange={e => setGradoId(Number(e.target.value))}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <div className="flex gap-1">
            {grupos.map(gr => (
              <button key={gr.id} onClick={() => setNombre(gr.nombre)}
                className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                  nombre === gr.nombre ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 border-slate-300'
                }`}>{gr.nombre}</button>
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            <button onClick={() => setVista('matriz')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${vista === 'matriz' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
              Vista matriz
            </button>
            <button onClick={() => setVista('boletines')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${vista === 'boletines' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}>
              Boletines
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (!periodoId || !gradoId || !nombre) return
              window.open(`/admin/consolidado/imprimir?periodo=${periodoId}&grado=${gradoId}&grupo=${encodeURIComponent(nombre)}`, '_blank')
            }}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold">
            Imprimir / Guardar PDF (boletines)
          </button>
          <button onClick={exportarGrupoExcel}
            className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            Exportar este grupo (Excel)
          </button>
          <button onClick={exportarTodoExcel} disabled={exportandoTodo}
            className="bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {exportandoTodo ? 'Generando...' : 'Exportar los 36 grupos (Excel)'}
          </button>
        </div>
        {mensaje && <p className="text-sm text-slate-600 mt-3">{mensaje}</p>}
      </div>

      <div className="print-area">
        {datos === null ? (
          <p className="text-sm text-slate-400 no-print">Cargando...</p>
        ) : datos.materias.length === 0 ? (
          <p className="text-sm text-slate-400 no-print">
            Este grado no tiene materias configuradas. Ve a "Materias por grado".
          </p>
        ) : datos.estudiantes.length === 0 ? (
          <p className="text-sm text-slate-400 no-print">
            Este grupo no tiene estudiantes cargados. Ve a "Estudiantes".
          </p>
        ) : vista === 'matriz' ? (
          <VistaMatriz grado={grado} grupoNombre={nombre} datos={datos} />
        ) : (
          <VistaBoletines
            grado={grado} grupoNombre={nombre} periodo={periodo} datos={datos}
            nombreInstitucion={config?.nombre_institucion}
            logoUrl={config?.logo_url}
          />
        )}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          .print-area { margin: 0 !important; padding: 0 !important; }
          .boletin-hoja { page-break-after: always; }
          .boletin-hoja:last-child { page-break-after: auto; }
          .boletin-card { page-break-inside: avoid; break-inside: avoid; }
          @page { size: legal; margin: 8mm; }
        }
      `}</style>
    </div>
  )
}

function VistaMatriz({ grado, grupoNombre, datos }) {
  const { materias, estudiantes, marcasPorEstudiante } = datos
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 overflow-x-auto">
      <h3 className="text-base font-bold text-slate-800 mb-4">{grado?.nombre} {grupoNombre}</h3>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-2 py-2 border-b-2 border-slate-800">Estudiante</th>
            {materias.map(m => (
              <th key={m.id} className="px-2 py-2 border-b-2 border-slate-800 text-center whitespace-nowrap">{m.nombre}</th>
            ))}
            <th className="px-2 py-2 border-b-2 border-slate-800">Total</th>
          </tr>
        </thead>
        <tbody>
          {estudiantes.map(e => {
            const dif = marcasPorEstudiante[e.id] || new Set()
            return (
              <tr key={e.id}>
                <td className="px-2 py-1.5 border-b border-slate-200 font-medium">{e.nombre}</td>
                {materias.map(m => (
                  <td key={m.id} className={`px-2 py-1.5 border-b border-slate-200 text-center font-extrabold ${
                    dif.has(m.id) ? 'text-red-600' : 'text-slate-200'
                  }`}>
                    {dif.has(m.id) ? 'X' : '·'}
                  </td>
                ))}
                <td className="px-2 py-1.5 border-b border-slate-200 text-center font-bold">{dif.size}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VistaBoletines({ grado, grupoNombre, periodo, datos, nombreInstitucion, logoUrl }) {
  const { materias, estudiantes, marcasPorEstudiante } = datos
  const estudiantesConDificultad = estudiantes.filter(e => (marcasPorEstudiante[e.id]?.size ?? 0) > 0)

  const grupos5 = []
  for (let i = 0; i < estudiantesConDificultad.length; i += 5) grupos5.push(estudiantesConDificultad.slice(i, i + 5))

  if (estudiantesConDificultad.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6 no-print">
        <p className="text-sm text-slate-400">
          Ningún estudiante de este grupo tiene materias marcadas con dificultad en este periodo — no hay boletines que generar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {grupos5.map((grupoEst, idx) => (
        <div key={idx} className="boletin-hoja bg-white rounded-xl border border-slate-200 p-4 print:border-0 print:rounded-none print:p-0">
          {grupoEst.map((est, i) => (
            <BoletinEstudiante
              key={est.id}
              esUltimo={i === grupoEst.length - 1}
              estudiante={est}
              grado={grado}
              grupoNombre={grupoNombre}
              periodo={periodo}
              materias={materias}
              dificultades={marcasPorEstudiante[est.id] || new Set()}
              nombreInstitucion={nombreInstitucion}
              logoUrl={logoUrl}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function BoletinEstudiante({ estudiante, grado, grupoNombre, periodo, materias, dificultades, nombreInstitucion, logoUrl, esUltimo }) {
  const filas = []
  for (let i = 0; i < materias.length; i += COLUMNAS_GRILLA) filas.push(materias.slice(i, i + COLUMNAS_GRILLA))
  const ultimaFila = filas[filas.length - 1]
  if (ultimaFila && ultimaFila.length < COLUMNAS_GRILLA) {
    const faltantes = COLUMNAS_GRILLA - ultimaFila.length
    for (let i = 0; i < faltantes; i++) ultimaFila.push(null)
  }

  return (
    <div
      className={`boletin-card py-2.5 text-[11px] leading-tight ${!esUltimo ? 'border-b border-dashed border-slate-400' : ''}`}
    >
      <div className="grid items-center mb-1.5" style={{ gridTemplateColumns: '56px 1fr 56px' }}>
        <div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo institución" className="h-14 w-14 object-cover rounded-full" />
          )}
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold text-slate-700 mb-0.5">{nombreInstitucion}</p>
          <p className="font-bold text-[12px]">
            INFORME PARCIAL {etiquetaPeriodo(periodo).toUpperCase() || '____________'} — {grado?.nombre?.toUpperCase()}
          </p>
        </div>
        <div />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-0.5 mb-1 text-[11px]">
        <span><b>NOMBRE:</b> {estudiante.nombre}</span>
        <span><b>GRADO:</b> {grado?.nombre} {grupoNombre}</span>
        <span><b>FECHA:</b> __________</span>
      </div>

      <p className="text-[9px] text-slate-600 mb-1.5 leading-snug">
        El estudiante presenta reportes negativos en las asignaturas marcadas con X porque no ha cumplido con sus
        responsabilidades escolares obteniendo desempeños bajos en: tareas, trabajos, actividades en clase,
        evaluaciones orales y/o escritas, participación oral; reportes negativos en el comportamiento y ausencias sin justificar.
      </p>

      <table className="w-full border-collapse mb-1.5" style={{ pageBreakInside: 'avoid' }}>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((m, j) => (
                <td key={j} className="border border-slate-800 px-1.5 py-1 text-[10px] align-top" style={{ width: `${100 / COLUMNAS_GRILLA}%` }}>
                  {m ? (
                    <div className="flex items-center justify-between gap-1">
                      <span>{m.nombre}</span>
                      {dificultades.has(m.id) && <span className="font-extrabold">X</span>}
                    </div>
                  ) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px]">DOCENTE: ______________________________</p>
    </div>
  )
}
