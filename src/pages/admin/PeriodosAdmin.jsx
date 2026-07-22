import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function aInputLocal(fechaISO) {
  if (!fechaISO) return ''
  const d = new Date(fechaISO)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function estadoModulo(activo, fechaInicio, fechaLimite) {
  const ahora = new Date()
  if (!activo) return { texto: 'Inactivo', tono: 'gris' }
  if (fechaInicio && ahora < new Date(fechaInicio)) return { texto: 'Aún no inicia', tono: 'ambar' }
  if (fechaLimite && ahora > new Date(fechaLimite)) return { texto: 'Plazo cerrado', tono: 'rojo' }
  return { texto: 'Abierto', tono: 'verde' }
}

const COLORES = {
  verde: 'bg-emerald-100 text-emerald-700',
  rojo:  'bg-red-100 text-red-700',
  ambar: 'bg-amber-100 text-amber-700',
  gris:  'bg-slate-200 text-slate-600',
}

function BadgeEstado({ activo, fechaInicio, fechaLimite }) {
  const e = estadoModulo(activo, fechaInicio, fechaLimite)
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COLORES[e.tono]}`}>
      {e.texto}
    </span>
  )
}

function ResumenFechas({ inicio, limite }) {
  return (
    <span className="text-xs text-slate-400">
      {inicio ? `Desde ${new Date(inicio).toLocaleString('es-CO')}` : 'Sin fecha de inicio'}
      {' · '}
      {limite ? `Hasta ${new Date(limite).toLocaleString('es-CO')}` : 'Sin plazo límite'}
    </span>
  )
}

export default function PeriodosAdmin() {
  const [periodos, setPeriodos]       = useState(null)
  const [nombre, setNombre]           = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [mensaje, setMensaje]         = useState('')
  const [editandoId, setEditandoId]   = useState(null)

  // Fechas del formulario de creación
  const [cDifInicio,  setCDifInicio]  = useState('')
  const [cDifLimite,  setCDifLimite]  = useState('')
  const [cAsisInicio, setCAsisInicio] = useState('')
  const [cAsisLimite, setCAsisLimite] = useState('')

  // Fechas del formulario de edición
  const [eDifInicio,  setEDifInicio]  = useState('')
  const [eDifLimite,  setEDifLimite]  = useState('')
  const [eAsisInicio, setEAsisInicio] = useState('')
  const [eAsisLimite, setEAsisLimite] = useState('')

  const cargar = async () => {
    const { data } = await supabase
      .from('periodos')
      .select('*')
      .order('created_at', { ascending: false })
    setPeriodos(data || [])
  }

  useEffect(() => { cargar() }, [])

  const activar = async (id) => {
    setMensaje('')
    await supabase.from('periodos').update({ activo: false }).eq('activo', true)
    const { error } = await supabase.from('periodos').update({ activo: true }).eq('id', id)
    if (error) { setMensaje('Error al activar: ' + error.message); return }
    cargar()
  }

  const crearYActivar = async () => {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return
    setGuardando(true)
    setMensaje('')

    const { data: existente } = await supabase
      .from('periodos').select('id').eq('nombre', nombreLimpio).single()

    if (existente) {
      setGuardando(false)
      setMensaje('Ya existe un periodo con ese nombre.')
      return
    }

    await supabase.from('periodos').update({ activo: false }).eq('activo', true)
    const { error } = await supabase.from('periodos').insert({
      nombre: nombreLimpio,
      activo: true,
      fecha_inicio:              cDifInicio  ? new Date(cDifInicio).toISOString()  : null,
      fecha_limite:              cDifLimite  ? new Date(cDifLimite).toISOString()  : null,
      asistencia_fecha_inicio:   cAsisInicio ? new Date(cAsisInicio).toISOString() : null,
      asistencia_fecha_limite:   cAsisLimite ? new Date(cAsisLimite).toISOString() : null,
    })
    setGuardando(false)

    if (error) { setMensaje('Error al crear: ' + error.message); return }
    setNombre('')
    setCDifInicio(''); setCDifLimite('')
    setCAsisInicio(''); setCAsisLimite('')
    setMensaje(`Periodo "${nombreLimpio}" creado y activado.`)
    cargar()
  }

  const iniciarEdicion = (p) => {
    setEditandoId(p.id)
    setEDifInicio(aInputLocal(p.fecha_inicio))
    setEDifLimite(aInputLocal(p.fecha_limite))
    setEAsisInicio(aInputLocal(p.asistencia_fecha_inicio))
    setEAsisLimite(aInputLocal(p.asistencia_fecha_limite))
  }

  const guardarFechas = async (p) => {
    const { error } = await supabase
      .from('periodos')
      .update({
        fecha_inicio:            eDifInicio  ? new Date(eDifInicio).toISOString()  : null,
        fecha_limite:            eDifLimite  ? new Date(eDifLimite).toISOString()  : null,
        asistencia_fecha_inicio: eAsisInicio ? new Date(eAsisInicio).toISOString() : null,
        asistencia_fecha_limite: eAsisLimite ? new Date(eAsisLimite).toISOString() : null,
      })
      .eq('id', p.id)
    if (error) { setMensaje('Error al guardar fechas: ' + error.message); return }
    setEditandoId(null)
    cargar()
  }

  if (periodos === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Periodos académicos</h2>
        <p className="text-sm text-slate-500 mb-5">
          Solo un periodo puede estar activo a la vez. Las ventanas de <b>dificultades</b> y <b>asistencia</b> son independientes:
          cada módulo respeta sus propias fechas de apertura y cierre.
        </p>

        {/* ── Formulario de creación ── */}
        <div className="flex flex-col gap-3 mb-2">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder='Ej: "Periodo 1 - 2026"'
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm max-w-xs"
          />

          {/* Dificultades */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              📋 Ventana — Marcas de dificultad
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Inicio (opcional)</label>
                <input type="datetime-local" value={cDifInicio}
                  onChange={e => setCDifInicio(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Plazo límite (opcional)</label>
                <input type="datetime-local" value={cDifLimite}
                  onChange={e => setCDifLimite(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
              </div>
            </div>
          </div>

          {/* Asistencia */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex flex-col gap-2">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
              🗓 Ventana — Asistencia
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Inicio (opcional)</label>
                <input type="datetime-local" value={cAsisInicio}
                  onChange={e => setCAsisInicio(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Plazo límite (opcional)</label>
                <input type="datetime-local" value={cAsisLimite}
                  onChange={e => setCAsisLimite(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={crearYActivar}
          disabled={guardando || !nombre.trim()}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 mb-6"
        >
          {guardando ? 'Creando...' : 'Crear y activar'}
        </button>

        {/* ── Lista de periodos ── */}
        {periodos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay periodos. Crea el primero arriba.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {periodos.map(p => (
              <div key={p.id}
                className={`px-4 py-3 rounded-lg border ${p.activo ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>

                {/* Cabecera */}
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">{p.nombre}</div>
                  <div className="flex items-center gap-2">
                    {!p.activo && (
                      <button onClick={() => activar(p.id)}
                        className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold">
                        Activar
                      </button>
                    )}
                    <button onClick={() => editandoId === p.id ? setEditandoId(null) : iniciarEdicion(p)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold">
                      {editandoId === p.id ? 'Cerrar' : 'Editar fechas'}
                    </button>
                  </div>
                </div>

                {/* Resumen de los dos módulos */}
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-28 shrink-0">📋 Dificultades</span>
                    <BadgeEstado activo={p.activo} fechaInicio={p.fecha_inicio} fechaLimite={p.fecha_limite} />
                    <ResumenFechas inicio={p.fecha_inicio} limite={p.fecha_limite} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-28 shrink-0">🗓 Asistencia</span>
                    <BadgeEstado activo={p.activo} fechaInicio={p.asistencia_fecha_inicio} fechaLimite={p.asistencia_fecha_limite} />
                    <ResumenFechas inicio={p.asistencia_fecha_inicio} limite={p.asistencia_fecha_limite} />
                  </div>
                </div>

                {/* Panel de edición inline */}
                {editandoId === p.id && (
                  <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col gap-3">

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                        📋 Ventana — Marcas de dificultad
                      </p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Inicio</label>
                          <input type="datetime-local" value={eDifInicio}
                            onChange={e => setEDifInicio(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Plazo límite</label>
                          <input type="datetime-local" value={eDifLimite}
                            onChange={e => setEDifLimite(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                        🗓 Ventana — Asistencia
                      </p>
                      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Inicio</label>
                          <input type="datetime-local" value={eAsisInicio}
                            onChange={e => setEAsisInicio(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Plazo límite</label>
                          <input type="datetime-local" value={eAsisLimite}
                            onChange={e => setEAsisLimite(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => guardarFechas(p)}
                        className="bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-semibold">
                        Guardar cambios
                      </button>
                      <button onClick={() => setEditandoId(null)}
                        className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg text-xs font-semibold">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}
