import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// REGLA DURA DE ESTA PANTALLA: el nombre del grupo es TEXTO LIBRE.
//
// Nada de validar que sea una sola letra, ni forzar mayúsculas, ni una lista
// cerrada A/B/C. Un colegio debe poder llamar a sus grupos "1-01", "Mañana" o
// "San José". Toda la migración expand/contract de `grupos` (fase 1 en SQL,
// fase 2a en el frontend) existió exactamente para poder no validar esto.
// Lo único que se comprueba es que no quede vacío.
//
// `nivel` sí es una lista cerrada, pero no por decisión de esta pantalla:
// `grados.nivel` es NOT NULL con CHECK (primaria|bachillerato) en Postgres.
// Sin mandarlo, crear un grado falla con 23502.
// ─────────────────────────────────────────────────────────────────────────────

const NIVELES = ['primaria', 'bachillerato']

const siguienteOrden = (filas) =>
  filas.reduce((max, f) => Math.max(max, f.orden ?? 0), 0) + 1

/**
 * Traduce los dos errores de Postgres que esta pantalla provoca a diario.
 *
 * El mensaje tiene que decir QUÉ hacer, no solo que algo falló: quien está al
 * otro lado es el admin de un colegio, no un desarrollador leyendo un código.
 *
 * El 23503 viene del ON DELETE RESTRICT de la capa 0. Es deliberado y protege
 * la historia académica — no se ablanda desde aquí, se explica.
 */
function mensajeDeError(error, { duplicado, enUso, generico }) {
  if (error.code === '23505') return duplicado
  if (error.code === '23503') return enUso
  return `${generico} ${error.message}`
}

/** Fila en modo edición: nombre + orden, Enter guarda, Escape cancela. */
function EditorFila({ valores, onCambio, onGuardar, onCancelar }) {
  const teclas = (e) => {
    if (e.key === 'Enter') onGuardar()
    if (e.key === 'Escape') onCancelar()
  }
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <input
        value={valores.nombre}
        onChange={e => onCambio({ ...valores, nombre: e.target.value })}
        onKeyDown={teclas}
        autoFocus
        className="border border-slate-300 rounded-lg px-2 py-1 text-sm flex-1 min-w-0"
      />
      <input
        type="number"
        value={valores.orden}
        onChange={e => onCambio({ ...valores, orden: e.target.value })}
        onKeyDown={teclas}
        title="Orden en que aparece en las listas"
        className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-16 shrink-0"
      />
      <button onClick={onGuardar} title="Guardar (Enter)"
        className="text-emerald-700 hover:text-emerald-900 text-sm font-bold shrink-0">
        ✓
      </button>
      <button onClick={onCancelar} title="Cancelar (Escape)"
        className="text-slate-400 hover:text-slate-600 text-sm font-bold shrink-0">
        ×
      </button>
    </div>
  )
}

export default function EstructuraAdmin() {
  const [grados, setGrados] = useState(null) // null = cargando
  const [gradoId, setGradoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [nuevoGrado, setNuevoGrado] = useState({ nombre: '', nivel: 'primaria' })
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [editGrado, setEditGrado] = useState(null) // { id, nombre, orden }
  const [editGrupo, setEditGrupo] = useState(null)
  const [mensaje, setMensaje] = useState(null)     // { tipo: 'ok' | 'error', texto }

  const ok = (texto) => setMensaje({ tipo: 'ok', texto })
  const falla = (texto) => setMensaje({ tipo: 'error', texto })

  const gradoActual = (grados || []).find(g => g.id === gradoId) || null

  const cargarGrados = async (idPreferido) => {
    const { data, error } = await supabase.from('grados').select('*').order('orden')
    if (error) {
      falla('No se pudieron cargar los grados: ' + error.message)
      setGrados([])
      return
    }
    const filas = data || []
    setGrados(filas)
    // Si el grado seleccionado desapareció (lo acaban de borrar), se cae al primero.
    setGradoId(prev => {
      const id = idPreferido ?? prev
      return filas.some(g => g.id === id) ? id : (filas[0]?.id ?? null)
    })
  }

  const cargarGrupos = async (gid) => {
    if (!gid) { setGrupos([]); return }
    const { data, error } = await supabase
      .from('grupos').select('*').eq('grado_id', gid).order('orden')
    if (error) {
      falla('No se pudieron cargar los grupos: ' + error.message)
      setGrupos([])
      return
    }
    setGrupos(data || [])
  }

  useEffect(() => { cargarGrados() }, [])
  useEffect(() => {
    setEditGrupo(null)
    setNuevoGrupo('')
    cargarGrupos(gradoId)
  }, [gradoId])

  // ── Grados ────────────────────────────────────────────────────────────────

  const crearGrado = async () => {
    const nombre = nuevoGrado.nombre.trim()
    if (!nombre) { falla('El nombre del grado no puede quedar vacío.'); return }

    const { error } = await supabase.from('grados').insert({
      nombre,
      nivel: nuevoGrado.nivel,
      orden: siguienteOrden(grados || []),
    })
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `Ya existe un grado llamado "${nombre}". Los nombres de grado no se repiten en todo el colegio: usa otro, o renombra el que ya está.`,
        enUso: 'No se pudo crear el grado porque hay datos relacionados. Revisa la estructura antes de reintentar.',
        generico: 'Error al crear el grado:',
      }))
      return
    }
    setNuevoGrado({ nombre: '', nivel: nuevoGrado.nivel })
    ok(`Grado "${nombre}" creado.`)
    cargarGrados()
  }

  const guardarGrado = async () => {
    const nombre = editGrado.nombre.trim()
    const orden = Number(editGrado.orden)
    if (!nombre) { falla('El nombre del grado no puede quedar vacío.'); return }
    if (!Number.isInteger(orden)) { falla('El orden del grado debe ser un número entero.'); return }

    const { error } = await supabase
      .from('grados').update({ nombre, orden }).eq('id', editGrado.id)
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `Ya existe otro grado llamado "${nombre}". Elige un nombre distinto.`,
        enUso: 'No se pudo guardar el grado por datos relacionados.',
        generico: 'Error al guardar el grado:',
      }))
      return
    }
    const id = editGrado.id
    setEditGrado(null)
    ok(`Grado "${nombre}" actualizado.`)
    cargarGrados(id)
  }

  const eliminarGrado = async (g) => {
    // RESTRICT protege los grados que tienen algo dentro, pero no los vacíos:
    // esos sí se borran y no vuelven. Por eso aquí sí se pregunta.
    if (!window.confirm(`¿Eliminar el grado "${g.nombre}"? Solo se podrá si no tiene grupos, materias ni estudiantes dentro.`)) return

    const { error } = await supabase.from('grados').delete().eq('id', g.id)
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `No se pudo eliminar "${g.nombre}".`,
        enUso: `No se puede eliminar "${g.nombre}": todavía tiene grupos, materias o estudiantes dentro. Borra o mueve primero lo que cuelga de él. Si solo querías corregir el nombre, renómbralo con el lápiz.`,
        generico: 'Error al eliminar el grado:',
      }))
      return
    }
    ok(`Grado "${g.nombre}" eliminado.`)
    cargarGrados()
  }

  // ── Grupos ────────────────────────────────────────────────────────────────

  const crearGrupo = async () => {
    const nombre = nuevoGrupo.trim()
    if (!gradoId) { falla('Primero selecciona un grado a la izquierda.'); return }
    if (!nombre) { falla('El nombre del grupo no puede quedar vacío.'); return }

    // `orden` se manda explícito a propósito. Hoy el trigger `grupos_sync` de la
    // fase 1 lo rellenaría solo, pero la fase 3 borra ese trigger y deja `orden`
    // NOT NULL: apoyarse en él sería código que funciona hoy y estalla después.
    const { error } = await supabase.from('grupos').insert({
      grado_id: gradoId,
      nombre,
      orden: siguienteOrden(grupos),
    })
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `Ya existe un grupo llamado "${nombre}" en ${gradoActual?.nombre ?? 'este grado'}. Usa otro nombre, o renombra el que ya está.`,
        enUso: 'No se pudo crear el grupo porque hay datos relacionados.',
        generico: 'Error al crear el grupo:',
      }))
      return
    }
    setNuevoGrupo('')
    ok(`Grupo "${nombre}" creado en ${gradoActual?.nombre ?? 'el grado'}.`)
    cargarGrupos(gradoId)
  }

  const guardarGrupo = async () => {
    const nombre = editGrupo.nombre.trim()
    const orden = Number(editGrupo.orden)
    if (!nombre) { falla('El nombre del grupo no puede quedar vacío.'); return }
    if (!Number.isInteger(orden)) { falla('El orden del grupo debe ser un número entero.'); return }

    const { error } = await supabase
      .from('grupos').update({ nombre, orden }).eq('id', editGrupo.id)
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `Ya existe otro grupo llamado "${nombre}" en ${gradoActual?.nombre ?? 'este grado'}. Elige un nombre distinto.`,
        enUso: 'No se pudo guardar el grupo por datos relacionados.',
        generico: 'Error al guardar el grupo:',
      }))
      return
    }
    setEditGrupo(null)
    ok(`Grupo "${nombre}" actualizado.`)
    cargarGrupos(gradoId)
  }

  const eliminarGrupo = async (gr) => {
    const { error } = await supabase.from('grupos').delete().eq('id', gr.id)
    if (error) {
      falla(mensajeDeError(error, {
        duplicado: `No se pudo eliminar el grupo "${gr.nombre}".`,
        enUso: `No se puede eliminar el grupo "${gr.nombre}": tiene estudiantes matriculados o asignaciones de docentes. Muévelos a otro grupo antes de borrarlo. Si solo querías corregir el nombre, renómbralo con el lápiz.`,
        generico: 'Error al eliminar el grupo:',
      }))
      return
    }
    ok(`Grupo "${gr.nombre}" eliminado.`)
    cargarGrupos(gradoId)
  }

  if (grados === null) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Grados y grupos</h2>
        <p className="text-sm text-slate-500 mb-5">
          La estructura académica del colegio. Selecciona un grado a la izquierda para ver y
          administrar sus grupos. El número gris de cada fila es el <b>orden</b> en que aparece
          en el resto de la aplicación.
        </p>

        <div className="flex flex-col md:flex-row gap-6">
          {/* ── Grados ── */}
          <div className="md:w-80 shrink-0 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-slate-800">Grados</h3>

            <div className="flex flex-col gap-2">
              <input
                value={nuevoGrado.nombre}
                onChange={e => setNuevoGrado({ ...nuevoGrado, nombre: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && crearGrado()}
                placeholder='Nombre del grado (ej. "6°", "Transición")'
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={nuevoGrado.nivel}
                  onChange={e => setNuevoGrado({ ...nuevoGrado, nivel: e.target.value })}
                  title="Nivel del grado"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 bg-white"
                >
                  {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button
                  onClick={crearGrado}
                  className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                >
                  Agregar
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1 max-h-[28rem] overflow-y-auto">
              {grados.map(g => (
                <div
                  key={g.id}
                  className={`rounded-lg border px-2 py-1.5 flex items-center gap-2 ${
                    gradoId === g.id ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                  }`}
                >
                  {editGrado?.id === g.id ? (
                    <EditorFila
                      valores={editGrado}
                      onCambio={setEditGrado}
                      onGuardar={guardarGrado}
                      onCancelar={() => setEditGrado(null)}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => setGradoId(g.id)}
                        className="flex-1 min-w-0 text-left text-sm font-semibold text-slate-700 truncate"
                      >
                        {g.nombre}
                        <span className="ml-2 text-xs font-normal text-slate-400">{g.nivel}</span>
                      </button>
                      <span className="text-xs text-slate-400 shrink-0" title="Orden">{g.orden}</span>
                      <button
                        onClick={() => { setMensaje(null); setEditGrado({ id: g.id, nombre: g.nombre, orden: g.orden ?? 0 }) }}
                        title="Renombrar o cambiar el orden"
                        className="text-slate-400 hover:text-emerald-700 shrink-0"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => eliminarGrado(g)}
                        title="Eliminar"
                        className="text-red-500 hover:text-red-700 shrink-0"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}
              {grados.length === 0 && (
                <p className="text-sm text-slate-400">Todavía no hay grados. Crea el primero arriba.</p>
              )}
            </div>
          </div>

          {/* ── Grupos del grado seleccionado ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-slate-800">
              {gradoActual ? `Grupos de ${gradoActual.nombre}` : 'Grupos'}
            </h3>

            {!gradoActual ? (
              <p className="text-sm text-slate-400">Selecciona un grado para administrar sus grupos.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={nuevoGrupo}
                    onChange={e => setNuevoGrupo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && crearGrupo()}
                    placeholder='Nombre del grupo (ej. "A", "1-01", "Mañana", "San José")'
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-0"
                  />
                  <button
                    onClick={crearGrupo}
                    className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0"
                  >
                    Agregar
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  El nombre del grupo es libre: una letra, un código como <b>1-01</b>, una jornada
                  como <b>Mañana</b> o un nombre propio. Solo no puede repetirse dentro del mismo grado.
                </p>

                <div className="flex flex-col gap-1">
                  {grupos.map(gr => (
                    <div
                      key={gr.id}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 flex items-center gap-2"
                    >
                      {editGrupo?.id === gr.id ? (
                        <EditorFila
                          valores={editGrupo}
                          onCambio={setEditGrupo}
                          onGuardar={guardarGrupo}
                          onCancelar={() => setEditGrupo(null)}
                        />
                      ) : (
                        <>
                          <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 truncate">
                            {gr.nombre}
                          </span>
                          <span className="text-xs text-slate-400 shrink-0" title="Orden">{gr.orden}</span>
                          <button
                            onClick={() => { setMensaje(null); setEditGrupo({ id: gr.id, nombre: gr.nombre, orden: gr.orden ?? 0 }) }}
                            title="Renombrar o cambiar el orden"
                            className="text-slate-400 hover:text-emerald-700 shrink-0"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => eliminarGrupo(gr)}
                            title="Eliminar"
                            className="text-red-500 hover:text-red-700 shrink-0"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {grupos.length === 0 && (
                    <p className="text-sm text-slate-400">
                      Este grado todavía no tiene grupos. Crea el primero arriba.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {mensaje && (
        <p className={`text-sm ${mensaje.tipo === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  )
}
