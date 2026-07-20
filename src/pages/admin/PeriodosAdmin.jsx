import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function aInputLocal(fechaISO) {
  if (!fechaISO) return ''
  const d = new Date(fechaISO)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function estadoPeriodo(p) {
  const ahora = new Date()
  if (!p.activo) return { texto: 'Inactivo', tono: 'gris' }
  if (p.fecha_inicio && ahora < new Date(p.fecha_inicio)) return { texto: 'Aún no inicia', tono: 'ambar' }
  if (p.fecha_limite && ahora > new Date(p.fecha_limite)) return { texto: 'Plazo cerrado', tono: 'rojo' }
  return { texto: 'Abierto para marcar', tono: 'verde' }
}

export default function PeriodosAdmin() {
  const [periodos, setPeriodos] = useState(null)
  const [nombre, setNombre] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [editInicio, setEditInicio] = useState('')
  const [editLimite, setEditLimite] = useState('')

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
      fecha_inicio: fechaInicio ? new Date(fechaInicio).toISOString() : null,
      fecha_limite: fechaLimite ? new Date(fechaLimite).toISOString() : null,
    })
    setGuardando(false)

    if (error) { setMensaje('Error al crear: ' + error.message); return }
    setNombre(''); setFechaInicio(''); setFechaLimite('')
    setMensaje(`Periodo "${nombreLimpio}" creado y activado.`)
    cargar()
  }

  const iniciarEdicionFechas = (p) => {
    setEditandoId(p.id)
    setEditInicio(aInputLocal(p.fecha_inicio))
    setEditLimite(aInputLocal(p.fecha_limite))
  }

  const guardarFechas = async (p) => {
    const { error } = await supabase
      .from('periodos')
      .update({
        fecha_inicio: editInicio ? new Date(editInicio).toISOString() : null,
        fecha_limite: editLimite ? new Date(editLimite).toISOString() : null,
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
        <p className="text-sm text-slate-500 mb-4">
          Solo un periodo puede estar activo a la vez. Si defines fecha y hora límite, los docentes
          <b> no podrán marcar ni modificar</b> dificultades después de ese momento — así puedes hacer el corte
          y generar los boletines con tranquilidad.
        </p>

        <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder='Ej: "Periodo 1 - 2026"'
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div>
            <label className="text-xs text-slate-500 block mb-1">Inicio (opcional)</label>
            <input
              type="datetime-local"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Plazo límite (opcional)</label>
            <input
              type="datetime-local"
              value={fechaLimite}
              onChange={e => setFechaLimite(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
        </div>
        <button
          onClick={crearYActivar}
          disabled={guardando || !nombre.trim()}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 mb-6"
        >
          {guardando ? 'Creando...' : 'Crear y activar'}
        </button>

        {periodos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay periodos. Crea el primero arriba.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {periodos.map(p => {
              const estado = estadoPeriodo(p)
              const colores = {
                verde: 'bg-emerald-100 text-emerald-700',
                rojo: 'bg-red-100 text-red-700',
                ambar: 'bg-amber-100 text-amber-700',
                gris: 'bg-slate-200 text-slate-600',
              }
              return (
                <div key={p.id} className={`px-4 py-3 rounded-lg border ${p.activo ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{p.nombre}</div>
                      <div className="text-xs text-slate-400">
                        {p.fecha_inicio ? `Desde ${new Date(p.fecha_inicio).toLocaleString('es-CO')}` : 'Sin fecha de inicio'}
                        {' · '}
                        {p.fecha_limite ? `Hasta ${new Date(p.fecha_limite).toLocaleString('es-CO')}` : 'Sin plazo límite'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.activo && (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${colores[estado.tono]}`}>
                          {estado.texto}
                        </span>
                      )}
                      {!p.activo && (
                        <button onClick={() => activar(p.id)} className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold">
                          Activar
                        </button>
                      )}
                      <button onClick={() => iniciarEdicionFechas(p)} className="text-xs text-slate-500 hover:text-slate-800 font-semibold">
                        Editar fechas
                      </button>
                    </div>
                  </div>

                  {editandoId === p.id && (
                    <div className="mt-3 pt-3 border-t border-slate-200 grid gap-2" style={{ gridTemplateColumns: '1fr 1fr auto' }}>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Inicio</label>
                        <input type="datetime-local" value={editInicio} onChange={e => setEditInicio(e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Plazo límite</label>
                        <input type="datetime-local" value={editLimite} onChange={e => setEditLimite(e.target.value)}
                          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
                      </div>
                      <div className="flex items-end gap-2">
                        <button onClick={() => guardarFechas(p)} className="bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-semibold">
                          Guardar
                        </button>
                        <button onClick={() => setEditandoId(null)} className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg text-xs font-semibold">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}
