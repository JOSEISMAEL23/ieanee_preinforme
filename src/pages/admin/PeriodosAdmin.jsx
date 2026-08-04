import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { anioActual } from '../../lib/periodos'

function aInputLocal(fechaISO) {
  if (!fechaISO) return ''
  const d = new Date(fechaISO)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function aISO(valorInput) {
  return valorInput ? new Date(valorInput).toISOString() : null
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

// ── Formulario ───────────────────────────────────────────────────────────────
// Crear y editar comparten estos mismos campos. Antes el panel de edición solo
// tenía las fechas y repetía ese bloque de JSX casi idéntico al de creación;
// unificarlos es lo que permite que al editar también se toquen nombre y año
// sin mantener dos formularios en paralelo.

const formVacio = () => ({
  nombre: '',
  anio: String(anioActual()),
  fecha_inicio: '',
  fecha_limite: '',
  asistencia_fecha_inicio: '',
  asistencia_fecha_limite: '',
  calificacion_fecha_inicio: '',
  calificacion_fecha_limite: '',
})

/** Vuelca una fila de la base en el formulario, con las fechas en formato datetime-local. */
const formDesdePeriodo = (p) => ({
  nombre: p.nombre ?? '',
  anio: p.anio != null ? String(p.anio) : String(anioActual()),
  fecha_inicio: aInputLocal(p.fecha_inicio),
  fecha_limite: aInputLocal(p.fecha_limite),
  asistencia_fecha_inicio: aInputLocal(p.asistencia_fecha_inicio),
  asistencia_fecha_limite: aInputLocal(p.asistencia_fecha_limite),
  calificacion_fecha_inicio: aInputLocal(p.calificacion_fecha_inicio),
  calificacion_fecha_limite: aInputLocal(p.calificacion_fecha_limite),
})

const VENTANAS = [
  {
    titulo: '📋 Ventana — Marcas de dificultad',
    borde: 'border-slate-200 bg-slate-50',
    texto: 'text-slate-600',
    inicio: 'fecha_inicio',
    limite: 'fecha_limite',
  },
  {
    titulo: '🗓 Ventana — Asistencia',
    borde: 'border-blue-200 bg-blue-50',
    texto: 'text-blue-700',
    inicio: 'asistencia_fecha_inicio',
    limite: 'asistencia_fecha_limite',
  },
  {
    titulo: '🎓 Ventana — Calificaciones',
    borde: 'border-violet-200 bg-violet-50',
    texto: 'text-violet-700',
    inicio: 'calificacion_fecha_inicio',
    limite: 'calificacion_fecha_limite',
  },
]

function FormularioPeriodo({ valores, onCambio, opcionalEnFechas }) {
  const set = (campo) => (e) => onCambio({ ...valores, [campo]: e.target.value })
  const sufijo = opcionalEnFechas ? ' (opcional)' : ''

  return (
    <div className="flex flex-col gap-3">
      {/* El año va aparte del nombre: así "Primer Periodo" se puede volver
          a usar el año entrante sin chocar con el de este año. */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[12rem] max-w-xs">
          <label className="text-xs text-slate-500 block mb-1">Nombre del periodo</label>
          <input
            value={valores.nombre}
            onChange={set('nombre')}
            placeholder='Ej: "Primer Periodo"'
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </div>
        <div className="w-28">
          <label className="text-xs text-slate-500 block mb-1">Año</label>
          <input
            type="number"
            min="2000"
            max="2100"
            value={valores.anio}
            onChange={set('anio')}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        </div>
      </div>

      {VENTANAS.map(v => (
        <div key={v.inicio} className={`rounded-lg border p-4 flex flex-col gap-2 ${v.borde}`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${v.texto}`}>{v.titulo}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Inicio{sufijo}</label>
              <input type="datetime-local" value={valores[v.inicio]}
                onChange={set(v.inicio)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Plazo límite{sufijo}</label>
              <input type="datetime-local" value={valores[v.limite]}
                onChange={set(v.limite)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export default function PeriodosAdmin() {
  const [periodos, setPeriodos]       = useState(null)
  // 'crear' | id del periodo que se está guardando | null. Guardar el "qué" y
  // no solo un booleano evita que el botón de crear se ponga en "Guardando..."
  // mientras lo que se está guardando es la edición de una fila.
  const [guardando, setGuardando]     = useState(null)
  const [mensaje, setMensaje]         = useState('')
  const [editandoId, setEditandoId]   = useState(null)

  const [formCrear, setFormCrear]     = useState(formVacio)
  const [formEditar, setFormEditar]   = useState(formVacio)

  const cargar = async () => {
    const { data } = await supabase
      .from('periodos')
      .select('*')
      .order('anio', { ascending: false })
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

  /**
   * Valida el formulario y comprueba que (nombre, anio) esté libre.
   *
   * `idExcluido` es lo que hace posible editar: al guardar un periodo hay que
   * ignorar su propia fila en el chequeo de duplicados, porque si no, guardar
   * sin cambiarle el nombre chocaría siempre contra sí mismo. Al crear se pasa
   * null y no se excluye nada.
   */
  const validar = async (form, idExcluido) => {
    const nombreLimpio = form.nombre.trim()
    if (!nombreLimpio) return { error: 'El nombre del periodo no puede quedar vacío.' }

    const anioNum = Number(form.anio)
    if (!Number.isInteger(anioNum) || anioNum < 2000 || anioNum > 2100) {
      return { error: 'El año debe ser un número entre 2000 y 2100.' }
    }

    let consulta = supabase
      .from('periodos').select('id')
      .eq('nombre', nombreLimpio).eq('anio', anioNum)
    if (idExcluido != null) consulta = consulta.neq('id', idExcluido)

    const { data: existente } = await consulta.maybeSingle()
    if (existente) {
      return { error: `Ya existe un periodo llamado "${nombreLimpio}" en ${anioNum}.` }
    }

    return { nombreLimpio, anioNum }
  }

  const camposFecha = (form) => ({
    fecha_inicio:              aISO(form.fecha_inicio),
    fecha_limite:              aISO(form.fecha_limite),
    asistencia_fecha_inicio:   aISO(form.asistencia_fecha_inicio),
    asistencia_fecha_limite:   aISO(form.asistencia_fecha_limite),
    calificacion_fecha_inicio: aISO(form.calificacion_fecha_inicio),
    calificacion_fecha_limite: aISO(form.calificacion_fecha_limite),
  })

  const crearYActivar = async () => {
    setMensaje('')
    setGuardando('crear')

    const { error: errorValidacion, nombreLimpio, anioNum } = await validar(formCrear, null)
    if (errorValidacion) { setGuardando(null); setMensaje(errorValidacion); return }

    await supabase.from('periodos').update({ activo: false }).eq('activo', true)
    const { error } = await supabase.from('periodos').insert({
      nombre: nombreLimpio,
      anio: anioNum,
      activo: true,
      ...camposFecha(formCrear),
    })
    setGuardando(null)

    if (error) { setMensaje('Error al crear: ' + error.message); return }
    setFormCrear(formVacio())
    setMensaje(`Periodo "${nombreLimpio}" (${anioNum}) creado y activado.`)
    cargar()
  }

  const iniciarEdicion = (p) => {
    setMensaje('')
    setEditandoId(p.id)
    setFormEditar(formDesdePeriodo(p))
  }

  const guardarEdicion = async (p) => {
    setMensaje('')
    setGuardando(p.id)

    const { error: errorValidacion, nombreLimpio, anioNum } = await validar(formEditar, p.id)
    if (errorValidacion) { setGuardando(null); setMensaje(errorValidacion); return }

    // `activo` se deja fuera a propósito: activar un periodo es una acción
    // aparte (el botón "Activar"), y meterla aquí desactivaría los demás sin
    // que el admin lo haya pedido.
    const { error } = await supabase
      .from('periodos')
      .update({
        nombre: nombreLimpio,
        anio: anioNum,
        ...camposFecha(formEditar),
      })
      .eq('id', p.id)
    setGuardando(null)

    if (error) { setMensaje('Error al guardar: ' + error.message); return }
    setEditandoId(null)
    setMensaje(`Periodo "${nombreLimpio}" (${anioNum}) actualizado.`)
    cargar()
  }

  if (periodos === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Periodos académicos</h2>
        <p className="text-sm text-slate-500 mb-5">
          Solo un periodo puede estar activo a la vez. Las ventanas de <b>dificultades</b>, <b>asistencia</b> y
          <b> calificaciones</b> son independientes: cada módulo respeta sus propias fechas de apertura y cierre.
        </p>

        {/* ── Formulario de creación ── */}
        <div className="mb-2">
          <FormularioPeriodo valores={formCrear} onCambio={setFormCrear} opcionalEnFechas />
        </div>

        <button
          onClick={crearYActivar}
          disabled={guardando !== null || !formCrear.nombre.trim() || !formCrear.anio.trim()}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 mt-3 mb-6"
        >
          {guardando === 'crear' ? 'Creando...' : 'Crear y activar'}
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
                  <div className="text-sm font-semibold text-slate-800">
                    {p.nombre}
                    {p.anio && <span className="ml-2 text-xs font-bold text-slate-500">{p.anio}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!p.activo && (
                      <button onClick={() => activar(p.id)}
                        className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold">
                        Activar
                      </button>
                    )}
                    <button onClick={() => editandoId === p.id ? setEditandoId(null) : iniciarEdicion(p)}
                      className="text-xs text-slate-500 hover:text-slate-800 font-semibold">
                      {editandoId === p.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </div>
                </div>

                {/* Resumen de los tres módulos */}
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-32 shrink-0">📋 Dificultades</span>
                    <BadgeEstado activo={p.activo} fechaInicio={p.fecha_inicio} fechaLimite={p.fecha_limite} />
                    <ResumenFechas inicio={p.fecha_inicio} limite={p.fecha_limite} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-32 shrink-0">🗓 Asistencia</span>
                    <BadgeEstado activo={p.activo} fechaInicio={p.asistencia_fecha_inicio} fechaLimite={p.asistencia_fecha_limite} />
                    <ResumenFechas inicio={p.asistencia_fecha_inicio} limite={p.asistencia_fecha_limite} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-32 shrink-0">🎓 Calificaciones</span>
                    <BadgeEstado activo={p.activo} fechaInicio={p.calificacion_fecha_inicio} fechaLimite={p.calificacion_fecha_limite} />
                    <ResumenFechas inicio={p.calificacion_fecha_inicio} limite={p.calificacion_fecha_limite} />
                  </div>
                </div>

                {/* Panel de edición inline */}
                {editandoId === p.id && (
                  <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col gap-3">
                    <FormularioPeriodo valores={formEditar} onCambio={setFormEditar} />

                    <div className="flex gap-2">
                      <button onClick={() => guardarEdicion(p)}
                        disabled={guardando !== null || !formEditar.nombre.trim() || !formEditar.anio.trim()}
                        className="bg-emerald-800 text-white px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40">
                        {guardando === p.id ? 'Guardando...' : 'Guardar cambios'}
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
