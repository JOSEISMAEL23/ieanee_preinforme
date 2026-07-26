import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function IconClipboardCheck({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  )
}

function IconSearch({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function IconAlertTriangle({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

function IconX({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconSliders({ className }) {
  return (
    <svg className={className} {...iconProps}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

export default function DocenteDashboard() {
  const { docente } = useAuth()
  const [periodo, setPeriodo] = useState(null)
  const [asignaciones, setAsignaciones] = useState(null)
  const [selIdx, setSelIdx] = useState(0)
  const [estudiantes, setEstudiantes] = useState(null)
  const [marcados, setMarcados] = useState({})
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const navigate = useNavigate()

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
      setBusqueda('')
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
        ; (estData || []).forEach(e => {
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

  const totalEstudiantes = estudiantes?.length ?? 0
  const marcadosCount = Object.values(marcados).filter(Boolean).length
  const sinDificultadCount = Math.max(totalEstudiantes - marcadosCount, 0)

  const estudiantesFiltrados = (estudiantes || []).filter(e =>
    e.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const ahora = new Date()
  const aunNoInicia = periodo.fecha_inicio && ahora < new Date(periodo.fecha_inicio)
  const plazoCerrado = periodo.fecha_limite && ahora > new Date(periodo.fecha_limite)
  const puedeMarcar = !aunNoInicia && !plazoCerrado

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {/* Cabecera: periodo activo + saludo + acceso al módulo de asistencia */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                {periodo.nombre}
              </p>
              {(periodo.fecha_inicio || periodo.fecha_limite) && (
                <p className="text-xs text-slate-500 mb-1">
                  {periodo.fecha_inicio && <>Inicia: {new Date(periodo.fecha_inicio).toLocaleString('es-CO')}</>}
                  {periodo.fecha_inicio && periodo.fecha_limite && ' · '}
                  {periodo.fecha_limite && <>Cierra: <b>{new Date(periodo.fecha_limite).toLocaleString('es-CO')}</b></>}
                </p>
              )}
              <h1 className="text-xl font-bold text-slate-800">Hola, {docente.nombre}</h1>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 self-start">
              <button
                onClick={() => navigate('/asistencia')}
                className="flex items-center gap-3 min-h-[44px] bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 hover:bg-emerald-100 transition"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white shrink-0">
                  <IconClipboardCheck className="w-5 h-5" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-bold text-emerald-800">Llamado a lista</span>
                  <span className="block text-xs text-emerald-600">Módulo de asistencia →</span>
                </span>
              </button>

              <button
                onClick={() => navigate('/calificaciones/config')}
                className="flex items-center gap-3 min-h-[44px] bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 hover:bg-violet-100 transition"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600 text-white shrink-0">
                  <IconSliders className="w-5 h-5" />
                </span>
                <span className="text-left">
                  <span className="block text-sm font-bold text-violet-800">Subparámetros</span>
                  <span className="block text-xs text-violet-600">Configurar mi materia →</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Área principal: marcación de dificultades académicas (preinformes) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <IconAlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <h2 className="text-base font-bold text-slate-800">Marcación de Dificultades Académicas</h2>
          </div>

          {asignaciones.length > 1 && (
            <div className="mb-4">
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Grupo y materia</label>
              <select
                value={selIdx}
                onChange={e => setSelIdx(Number(e.target.value))}
                className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm w-full min-h-[44px]"
              >
                {asignaciones.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.grupos.grados.nombre} {a.grupos.letra} — {a.materias.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-lg font-bold text-slate-800 mb-4">
            {asign.grupos.grados.nombre} {asign.grupos.letra} · {asign.materias.nombre}
          </div>

          {/* Resumen compacto con insignias */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2.5 text-center">
              <div className="text-lg font-bold text-slate-800">{totalEstudiantes}</div>
              <div className="text-[11px] text-slate-500 font-medium leading-tight">Total<br />estudiantes</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-2 py-2.5 text-center">
              <div className="text-lg font-bold text-red-700">{marcadosCount}</div>
              <div className="text-[11px] text-red-600 font-medium leading-tight">Con<br />dificultad</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-2.5 text-center">
              <div className="text-lg font-bold text-emerald-700">{sinDificultadCount}</div>
              <div className="text-[11px] text-emerald-600 font-medium leading-tight">Sin<br />dificultad</div>
            </div>
          </div>

          <p className="text-sm text-slate-500 mb-4">
            Marca únicamente a los estudiantes con dificultad académica en esta materia durante este periodo.
            Los cambios se guardan automáticamente.
          </p>

          {aunNoInicia && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
              El plazo para marcar este periodo aún no ha comenzado. Podrás hacerlo a partir del{' '}
              {new Date(periodo.fecha_inicio).toLocaleString('es-CO')}.
            </div>
          )}
          {plazoCerrado && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3 mb-4">
              El plazo para marcar este periodo se cerró el {new Date(periodo.fecha_limite).toLocaleString('es-CO')}.
              Si necesitas hacer un ajuste, contacta al administrador.
            </div>
          )}

          {estudiantes === null ? (
            <p className="text-sm text-slate-400">Cargando estudiantes...</p>
          ) : estudiantes.length === 0 ? (
            <p className="text-sm text-slate-400">
              Este grupo no tiene estudiantes cargados todavía. Pídele al administrador que los importe.
            </p>
          ) : (
            <>
              <div className="relative mb-3">
                <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar estudiante por nombre..."
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 text-sm min-h-[44px]"
                />
              </div>

              {estudiantesFiltrados.length === 0 ? (
                <p className="text-sm text-slate-400 px-1 py-3">
                  No se encontraron estudiantes que coincidan con "{busqueda}".
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {estudiantesFiltrados.map(e => (
                    <button
                      key={e.id}
                      onClick={() => puedeMarcar && toggle(e.id)}
                      disabled={guardandoId === e.id || !puedeMarcar}
                      className={`flex items-center justify-between gap-3 w-full min-h-[56px] px-4 py-3 rounded-xl border text-left transition ${marcados[e.id]
                          ? 'bg-red-50 border-red-200'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                        } ${!puedeMarcar ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{e.nombre}</p>
                        <p className={`text-xs font-semibold ${marcados[e.id] ? 'text-red-600' : 'text-slate-400'}`}>
                          {marcados[e.id] ? 'Con dificultad' : 'Sin dificultad'}
                        </p>
                      </div>
                      <span
                        className={`flex items-center justify-center w-11 h-11 rounded-lg border-2 shrink-0 transition ${marcados[e.id]
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'bg-white border-slate-300 text-slate-300'
                          }`}
                      >
                        <IconX className="w-5 h-5" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {mensaje && <p className="text-sm text-red-600 mt-3">{mensaje}</p>}
        </div>
      </div>
    </Layout>
  )
}
