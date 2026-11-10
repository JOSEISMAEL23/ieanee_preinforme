import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { anioActual } from '../lib/periodos'
import { leerNota, notaATexto, fraseObservacion } from '../lib/escala'

/**
 * ACES FINAL — el docente llena textos y notas de sus actas de recuperación.
 * Spec: segundo-cerebro/OUTPUTS/spec-aces-final-2026-11-10.md §5.
 *
 * Quién ve qué lo decide la RLS de aces_final, no esta pantalla: el docente
 * recibe solo sus filas y el admin todas. Por eso la ruta no pide módulo ni
 * permiso.
 */

const COLUMNAS = 'id, consecutivo, docente_id, grupo, area, estudiante, tematicas, desempeno_general, actividades, nota, updated_at'

// Los tres puntos que se escriben una vez por bloque, numerados como en el acta.
const TEXTOS = [
  { campo: 'tematicas', titulo: '1. Temáticas trabajadas para alcanzar los desempeños' },
  { campo: 'desempeno_general', titulo: '2. Desempeño general', ayuda: 'La evidencia que debe alcanzar el estudiante' },
  { campo: 'actividades', titulo: '3. Actividades a realizar' },
]

const consecutivoATexto = (anio, n) => `${anio} - ${String(n).padStart(3, '0')}`
const limpiar = t => (t ?? '').trim() || null

// Un bloque = un docente + un grupo + un área. Sus tres textos van iguales en
// todas sus actas (spec D7). Ordenados por consecutivo, que ya viene en orden
// grado → grupo → estudiante → área.
function armarBloques(filas) {
  const porClave = new Map()
  for (const f of filas) {
    const key = `${f.docente_id}|${f.grupo}|${f.area}`
    if (!porClave.has(key)) {
      porClave.set(key, {
        key, docente_id: f.docente_id, docente: f.docentes?.nombre ?? '',
        grupo: f.grupo, area: f.area, filas: [],
      })
    }
    porClave.get(key).filas.push(f)
  }
  const bloques = [...porClave.values()]
  for (const b of bloques) b.filas.sort((x, y) => x.consecutivo - y.consecutivo)
  return bloques.sort((x, y) => x.filas[0].consecutivo - y.filas[0].consecutivo)
}

// Los textos guardados del bloque: los de la primera acta que los tenga.
function textosGuardados(bloque) {
  return Object.fromEntries(TEXTOS.map(({ campo }) =>
    [campo, bloque.filas.find(f => f[campo])?.[campo] ?? '']))
}

// Si las actas de un bloque no tienen los mismos textos (una edición a mano,
// un guardado que quedó a medias), el bloque queda "sin guardar" hasta que
// alguien guarde y los iguale.
function textosUniformes(bloque) {
  return TEXTOS.every(({ campo }) => new Set(bloque.filas.map(f => f[campo] ?? '')).size === 1)
}

function borradorDe(bloque) {
  return {
    ...textosGuardados(bloque),
    notas: Object.fromEntries(bloque.filas.map(f => [f.id, notaATexto(f.nota)])),
  }
}

function textosCambiaron(bloque, borrador) {
  if (!textosUniformes(bloque)) return true
  const guardados = textosGuardados(bloque)
  return TEXTOS.some(({ campo }) => limpiar(borrador[campo]) !== limpiar(guardados[campo]))
}

function notaCambio(fila, borrador) {
  const n = leerNota(borrador.notas[fila.id])
  return Number.isNaN(n) || n !== fila.nota
}

export default function AcesFinal() {
  const { docente } = useAuth()
  const esAdmin = docente?.rol === 'admin'
  const navigate = useNavigate()
  const anio = anioActual()

  const [filas, setFilas] = useState(null) // null = cargando
  const [errorCarga, setErrorCarga] = useState('')
  const [borradores, setBorradores] = useState({}) // key de bloque → lo que hay escrito en pantalla
  const [estados, setEstados] = useState({}) // key de bloque → { guardando, error, mensaje }
  const [filtroDocente, setFiltroDocente] = useState(null) // solo admin

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase
        .from('aces_final')
        .select(`${COLUMNAS}, docentes(nombre)`)
        .eq('anio', anio)
        .order('consecutivo')
      if (cancelado) return
      if (error) {
        setErrorCarga('No se pudieron cargar las actas: ' + error.message)
        setFilas([])
        return
      }
      setFilas(data)
      setBorradores(Object.fromEntries(armarBloques(data).map(b => [b.key, borradorDe(b)])))
    })()
    return () => { cancelado = true }
  }, [anio])

  const bloques = useMemo(() => (filas ? armarBloques(filas) : []), [filas])

  const sucios = new Set(bloques
    .filter(b => {
      const br = borradores[b.key]
      return br && (textosCambiaron(b, br) || b.filas.some(f => notaCambio(f, br)))
    })
    .map(b => b.key))
  const haySinGuardar = sucios.size > 0

  // Cerrar la pestaña, recargar o irse a otra página con cambios sin guardar.
  useEffect(() => {
    if (!haySinGuardar) return
    const avisar = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [haySinGuardar])

  // Avance por docente: así el admin sabe quién falta.
  const resumen = useMemo(() => {
    if (!esAdmin) return []
    const porDocente = new Map()
    for (const b of bloques) {
      if (!porDocente.has(b.docente_id)) {
        porDocente.set(b.docente_id, { docente_id: b.docente_id, nombre: b.docente, actas: 0, conNota: 0, bloques: 0, bloquesConTextos: 0 })
      }
      const r = porDocente.get(b.docente_id)
      const guardados = textosGuardados(b)
      r.actas += b.filas.length
      r.conNota += b.filas.filter(f => f.nota !== null).length
      r.bloques += 1
      if (textosUniformes(b) && TEXTOS.every(({ campo }) => limpiar(guardados[campo]))) r.bloquesConTextos += 1
    }
    return [...porDocente.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))
  }, [bloques, esAdmin])

  const ponerEstado = (key, estado) => setEstados(prev => ({ ...prev, [key]: estado }))

  const cambiarTexto = (key, campo, valor) => {
    setBorradores(prev => ({ ...prev, [key]: { ...prev[key], [campo]: valor } }))
    ponerEstado(key, {})
  }

  const cambiarNota = (key, id, valor) => {
    setBorradores(prev => ({ ...prev, [key]: { ...prev[key], notas: { ...prev[key].notas, [id]: valor } } }))
    ponerEstado(key, {})
  }

  const copiarTextos = (destino, origen) => {
    const yaTiene = TEXTOS.some(({ campo }) => limpiar(borradores[destino.key][campo]))
    if (yaTiene && !window.confirm(`¿Reemplazar los textos de ${destino.grupo} con los de ${origen.grupo}?`)) return
    setBorradores(prev => ({
      ...prev,
      [destino.key]: {
        ...prev[destino.key],
        ...Object.fromEntries(TEXTOS.map(({ campo }) => [campo, prev[origen.key][campo]])),
      },
    }))
    ponerEstado(destino.key, {})
  }

  const guardar = async (bloque) => {
    const br = borradores[bloque.key]

    // Validar todo antes de guardar nada. La validación de verdad es el
    // CHECK de Postgres; esta es para que el docente vea dónde se equivocó.
    const invalidas = bloque.filas.filter(f => Number.isNaN(leerNota(br.notas[f.id])))
    if (invalidas.length > 0) {
      ponerEstado(bloque.key, {
        error: `Revisa la nota de ${invalidas.map(f => f.estudiante).join(', ')}: va de 0 a 100, con máximo dos decimales.`,
      })
      return
    }

    // Si cambian los textos se guardan en TODAS las actas del bloque; si no,
    // solo las actas cuya nota cambió (así updated_at solo se mueve en lo que
    // de verdad cambió: el spec §7 lo usa para detectar cambios tardíos).
    const conTextos = textosCambiaron(bloque, br)
    const aGuardar = bloque.filas.filter(f => conTextos || notaCambio(f, br))
    if (aGuardar.length === 0) return
    const textos = Object.fromEntries(TEXTOS.map(({ campo }) => [campo, limpiar(br[campo])]))

    // Un update por cada nota distinta: pocas llamadas, y cada una dice
    // cuántas filas tocó de verdad.
    const porNota = new Map()
    for (const f of aGuardar) {
      const nota = leerNota(br.notas[f.id])
      if (!porNota.has(nota)) porNota.set(nota, [])
      porNota.get(nota).push(f.id)
    }

    ponerEstado(bloque.key, { guardando: true })
    const resultados = await Promise.all([...porNota].map(([nota, ids]) =>
      supabase
        .from('aces_final')
        .update(conTextos ? { ...textos, nota } : { nota })
        .in('id', ids)
        .select(COLUMNAS)
    ))

    const devueltas = resultados.flatMap(r => r.data ?? [])
    const errores = [...new Set(resultados.filter(r => r.error).map(r => r.error.message))]
    const porId = new Map(devueltas.map(f => [f.id, f]))
    const actualizar = f => (porId.has(f.id) ? { ...f, ...porId.get(f.id) } : f)
    setFilas(prev => prev.map(actualizar))

    // ⚠️ Un update que la RLS rechaza NO da error: devuelve 0 filas. Que el
    // guardado "salga bien" sin contar lo devuelto es la verificación que
    // engaña (spec §5). Lo que no se guardó se queda escrito en pantalla.
    if (errores.length > 0 || devueltas.length !== aGuardar.length) {
      ponerEstado(bloque.key, {
        error: `Solo se guardaron ${devueltas.length} de ${aGuardar.length} actas. ` +
          (errores.length > 0 ? `Error: ${errores.join(' · ')}. ` : '') +
          'Lo que falta sigue escrito en pantalla: vuelve a guardar y, si se repite, avisa a coordinación.',
      })
      return
    }

    // Todo guardado: lo de pantalla vuelve a ser exactamente lo que quedó en la base.
    setBorradores(prev => ({ ...prev, [bloque.key]: borradorDe({ ...bloque, filas: bloque.filas.map(actualizar) }) }))
    ponerEstado(bloque.key, { mensaje: `Guardado: ${aGuardar.length} acta${aGuardar.length !== 1 ? 's' : ''}.` })
  }

  const volver = () => {
    if (haySinGuardar && !window.confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return
    navigate(esAdmin ? '/admin' : '/docente')
  }

  if (filas === null) {
    return <Layout><p className="text-slate-500 text-sm">Cargando...</p></Layout>
  }

  const visibles = filtroDocente ? bloques.filter(b => b.docente_id === filtroDocente) : bloques

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            onClick={volver}
            className="text-sm font-semibold text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition"
          >
            ← Volver
          </button>
          <h1 className="text-xl font-bold text-slate-800">ACES final {anio}</h1>
        </div>

        {errorCarga && (
          <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-800">{errorCarga}</div>
        )}

        {!errorCarga && bloques.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              {esAdmin ? `Todavía no hay actas de ACES final cargadas para ${anio}` : `No tienes actas de ACES final en ${anio}`}
            </h2>
            {!esAdmin && <p className="text-sm text-slate-500">Si crees que es un error, avisa a coordinación académica.</p>}
          </div>
        )}

        {bloques.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-900">
            Los puntos 1, 2 y 3 se escriben <strong>una sola vez por bloque</strong> y salen iguales en el acta de
            cada estudiante del bloque. Por estudiante solo va la nota. Guarda cada bloque con su botón.
          </div>
        )}

        {esAdmin && resumen.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-800">Avance por docente</h2>
              {filtroDocente && (
                <button onClick={() => setFiltroDocente(null)} className="text-xs font-semibold text-sky-800 hover:underline">
                  Ver todos
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {resumen.map(r => {
                const completo = r.conNota === r.actas && r.bloquesConTextos === r.bloques
                return (
                  <button
                    key={r.docente_id}
                    onClick={() => setFiltroDocente(r.docente_id)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50 ${filtroDocente === r.docente_id ? 'bg-sky-50' : ''}`}
                  >
                    <span className="text-slate-800 truncate">{r.nombre || 'Sin nombre'}</span>
                    <span className={`shrink-0 text-xs font-semibold ${completo ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {completo ? '✓ Completo' : `${r.conNota}/${r.actas} notas · ${r.bloquesConTextos}/${r.bloques} bloques con textos`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {visibles.map(b => {
          const br = borradores[b.key]
          if (!br) return null
          const est = estados[b.key] ?? {}
          const sucio = sucios.has(b.key)
          const conNota = b.filas.filter(f => f.nota !== null).length
          const mismaArea = bloques.filter(o => o.key !== b.key && o.area === b.area && o.docente_id === b.docente_id)

          return (
            <section key={b.key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800">
                    {b.grupo} · {b.area} · {b.filas.length} estudiante{b.filas.length !== 1 ? 's' : ''}
                  </h2>
                  {esAdmin && <p className="text-xs text-slate-500">Docente: {b.docente || 'sin nombre'}</p>}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {sucio && <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Sin guardar</span>}
                  <span className={conNota === b.filas.length ? 'text-emerald-700' : 'text-slate-600'}>
                    {conNota} de {b.filas.length} con nota
                  </span>
                </div>
              </div>

              <div className="p-4 flex flex-col gap-4">
                {mismaArea.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {mismaArea.map(o => (
                      <button
                        key={o.key}
                        onClick={() => copiarTextos(b, o)}
                        disabled={est.guardando}
                        className="text-xs font-semibold text-sky-800 border border-sky-300 px-2.5 py-1 rounded-lg hover:bg-sky-50 disabled:opacity-40"
                      >
                        Copiar textos de {o.grupo}
                      </button>
                    ))}
                  </div>
                )}

                {TEXTOS.map(({ campo, titulo, ayuda }) => (
                  <label key={campo} className="block">
                    <span className="text-sm font-semibold text-slate-700 block">{titulo}</span>
                    {ayuda && <span className="text-xs text-slate-500 block">{ayuda}</span>}
                    <textarea
                      value={br[campo]}
                      onChange={e => cambiarTexto(b.key, campo, e.target.value)}
                      disabled={est.guardando}
                      rows={3}
                      className="mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm w-full disabled:opacity-60"
                    />
                  </label>
                ))}

                <div>
                  <span className="text-sm font-semibold text-slate-700 block mb-1">4. Observaciones</span>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {b.filas.map(f => {
                      const texto = br.notas[f.id] ?? ''
                      const nota = leerNota(texto)
                      const invalida = Number.isNaN(nota)
                      return (
                        <div key={f.id} className="px-3 py-2.5 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs text-slate-500">Acta {consecutivoATexto(anio, f.consecutivo)}</p>
                              <p className="text-sm text-slate-800">{f.estudiante}</p>
                            </div>
                            <input
                              value={texto}
                              onChange={e => cambiarNota(b.key, f.id, e.target.value)}
                              disabled={est.guardando}
                              inputMode="decimal"
                              placeholder="Nota"
                              aria-label={`Nota de ${f.estudiante}`}
                              className={`border rounded-lg px-2 py-1.5 text-sm w-20 text-center shrink-0 disabled:opacity-60 ${invalida ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}
                            />
                          </div>
                          <p className={`text-xs ${invalida ? 'text-red-600' : nota === null ? 'text-slate-400' : 'text-slate-600 italic'}`}>
                            {invalida
                              ? 'Nota no válida: de 0 a 100, con máximo dos decimales (ej. 84,5).'
                              : nota === null ? 'Sin nota todavía.' : fraseObservacion(nota)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {est.error && <p className="text-sm text-red-600">{est.error}</p>}
                {est.mensaje && !sucio && <p className="text-sm text-emerald-700">{est.mensaje}</p>}

                <div className="flex justify-end">
                  <button
                    onClick={() => guardar(b)}
                    disabled={!sucio || est.guardando}
                    className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {est.guardando ? 'Guardando...' : 'Guardar este bloque'}
                  </button>
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </Layout>
  )
}
