import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function PeriodosAdmin() {
  const [periodos, setPeriodos] = useState(null)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

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
    const { error } = await supabase.from('periodos').insert({ nombre: nombreLimpio, activo: true })
    setGuardando(false)

    if (error) { setMensaje('Error al crear: ' + error.message); return }
    setNombre('')
    setMensaje(`Periodo "${nombreLimpio}" creado y activado.`)
    cargar()
  }

  if (periodos === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Periodos académicos</h2>
        <p className="text-sm text-slate-500 mb-4">
          Solo un periodo puede estar activo a la vez — es el que ven los docentes al marcar estudiantes.
          Al crear uno nuevo, el anterior se desactiva automáticamente (su historial de marcas queda guardado).
        </p>

        <div className="flex gap-2 mb-6">
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && crearYActivar()}
            placeholder='Ej: "Periodo 1 - 2026"'
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button
            onClick={crearYActivar}
            disabled={guardando || !nombre.trim()}
            className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {guardando ? 'Creando...' : 'Crear y activar'}
          </button>
        </div>

        {periodos.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay periodos. Crea el primero arriba.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {periodos.map(p => (
              <div
                key={p.id}
                className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  p.activo ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-800">{p.nombre}</div>
                  <div className="text-xs text-slate-400">
                    Creado el {new Date(p.created_at).toLocaleDateString('es-CO')}
                  </div>
                </div>
                {p.activo ? (
                  <span className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-full font-semibold">
                    Activo
                  </span>
                ) : (
                  <button
                    onClick={() => activar(p.id)}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold"
                  >
                    Activar este periodo
                  </button>
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
