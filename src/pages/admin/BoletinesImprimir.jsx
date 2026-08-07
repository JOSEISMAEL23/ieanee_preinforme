import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { etiquetaPeriodo } from '../../lib/periodos'

const COLUMNAS_GRILLA = 5

export default function BoletinesImprimir() {
  const [searchParams] = useSearchParams()
  const periodoId = Number(searchParams.get('periodo'))
  const gradoId = Number(searchParams.get('grado'))
  const grupoNombre = searchParams.get('grupo')

  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)

  useEffect(() => {
    (async () => {
      const { data: config } = await supabase.from('configuracion').select('*').eq('id', 1).single()
      const { data: periodo } = await supabase.from('periodos').select('*').eq('id', periodoId).single()
      const { data: grado } = await supabase.from('grados').select('*').eq('id', gradoId).single()
      const { data: grupo } = await supabase.from('grupos').select('id').eq('grado_id', gradoId).eq('nombre', grupoNombre).single()

      const { data: materias } = await supabase
        .from('materias').select('*').eq('grado_id', gradoId).order('orden')

      let estudiantes = []
      let marcasPorEstudiante = {}
      if (grupo) {
        const { data: estData } = await supabase
          .from('estudiantes').select('*').eq('grupo_id', grupo.id).order('nombre')
        estudiantes = estData || []

        const ids = estudiantes.map(e => e.id)
        if (ids.length > 0) {
          const { data: marcas } = await supabase
            .from('marcas').select('estudiante_id, materia_id')
            .eq('periodo_id', periodoId).in('estudiante_id', ids).eq('dificultad', true)
          estudiantes.forEach(e => { marcasPorEstudiante[e.id] = new Set() })
          ;(marcas || []).forEach(m => marcasPorEstudiante[m.estudiante_id]?.add(m.materia_id))
        }
      }

      setDatos({
        config, periodo, grado,
        materias: materias || [],
        estudiantes,
        marcasPorEstudiante,
      })
      setCargando(false)
    })()
  }, [periodoId, gradoId, grupoNombre])

  useEffect(() => {
    if (!cargando && datos) {
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [cargando, datos])

  if (cargando || !datos) {
    return <p style={{ fontFamily: 'sans-serif', padding: 20, fontSize: 14, color: '#64748b' }}>Generando boletines...</p>
  }

  const { config, periodo, grado, materias, estudiantes, marcasPorEstudiante } = datos
  const estudiantesConDificultad = estudiantes.filter(e => (marcasPorEstudiante[e.id]?.size ?? 0) > 0)

  const grupos5 = []
  for (let i = 0; i < estudiantesConDificultad.length; i += 5) grupos5.push(estudiantesConDificultad.slice(i, i + 5))

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#1e293b' }}>
      <style>{`
        @media print {
          body { margin: 0 !important; }
          @page { size: legal; margin: 8mm; }
        }
        .boletin-hoja { page-break-after: always; }
        .boletin-hoja:last-child { page-break-after: auto; }
        .boletin-card { page-break-inside: avoid; break-inside: avoid; }
      `}</style>

      {estudiantesConDificultad.length === 0 ? (
        <p style={{ padding: 20, fontSize: 14 }}>
          Ningún estudiante de este grupo tiene materias marcadas con dificultad en este periodo.
        </p>
      ) : (
        grupos5.map((grupoEst, idx) => (
          <div key={idx} className="boletin-hoja">
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
                nombreInstitucion={config?.nombre_institucion}
                logoUrl={config?.logo_url}
              />
            ))}
          </div>
        ))
      )}
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
      className="boletin-card"
      style={{
        padding: '10px 4px', fontSize: 11, lineHeight: 1.25,
        borderBottom: esUltimo ? 'none' : '1px dashed #94a3b8',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 56px', alignItems: 'center', marginBottom: 6 }}>
        <div>
          {logoUrl && (
            <img src={logoUrl} alt="Logo" style={{ height: 56, width: 56, objectFit: 'cover', borderRadius: '50%' }} />
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 10, fontWeight: 600, margin: 0, marginBottom: 2 }}>{nombreInstitucion}</p>
          <p style={{ fontWeight: 700, fontSize: 12, margin: 0 }}>
            INFORME PARCIAL {etiquetaPeriodo(periodo).toUpperCase() || '____________'} — {grado?.nombre?.toUpperCase()}
          </p>
        </div>
        <div />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px', marginBottom: 4, fontSize: 11 }}>
        <span><b>NOMBRE:</b> {estudiante.nombre}</span>
        <span><b>GRADO:</b> {grado?.nombre} {grupoNombre}</span>
        <span><b>FECHA:</b> __________</span>
      </div>

      <p style={{ fontSize: 9, color: '#475569', marginBottom: 6, lineHeight: 1.3 }}>
        El estudiante presenta reportes negativos en las asignaturas marcadas con X porque no ha cumplido con sus
        responsabilidades escolares obteniendo desempeños bajos en: tareas, trabajos, actividades en clase,
        evaluaciones orales y/o escritas, participación oral; reportes negativos en el comportamiento y ausencias sin justificar.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((m, j) => (
                <td key={j} style={{
                  border: '1px solid #1e293b', padding: '4px 6px', fontSize: 10, verticalAlign: 'top',
                  width: `${100 / COLUMNAS_GRILLA}%`,
                }}>
                  {m ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                      <span>{m.nombre}</span>
                      {dificultades.has(m.id) && <span style={{ fontWeight: 800 }}>X</span>}
                    </div>
                  ) : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 11, margin: 0 }}>DOCENTE: ______________________________</p>
    </div>
  )
}
