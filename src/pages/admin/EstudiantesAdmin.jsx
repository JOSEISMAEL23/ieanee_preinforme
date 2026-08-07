import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

const MAPA_GRADOS_PALABRA = {
  transicion: 'transicion',
  primero: '1',
  segundo: '2',
  tercero: '3',
  cuarto: '4',
  quinto: '5',
  sexto: '6',
  septimo: '7',
  octavo: '8',
  noveno: '9',
  decimo: '10',
  undecimo: '11',
  once: '11',
}

function normaliza(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[°\s]/g, '')
}

// Convierte cualquier variante ("Séptimo", "7°", "7") a la clave canónica del grado
function claveCanonica(gradoTexto) {
  const norm = normaliza(gradoTexto)
  return MAPA_GRADOS_PALABRA[norm] ?? norm
}

const siguienteOrden = (filas) =>
  filas.reduce((max, f) => Math.max(max, f.orden ?? 0), 0) + 1

// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTE ARCHIVO CUENTA LAS FILAS DE UNA EN UNA
//
// La versión anterior sumaba `omitidas++` y terminaba diciendo "se omitieron 13
// filas. Grados no reconocidos: 12". Eso no era silencio: era una explicación
// parcial que suena completa. De esas 13, el grado 12 era UNA. Las otras 12
// —10 de ellas estudiantes de grupos D y E que existen de verdad— desaparecían
// sin que nadie se enterara.
//
// A escala de colegio: importas 900, corriges lo único que el mensaje nombra, y
// 38 niños siguen sin lista, sin asistencia y sin notas hasta que un docente
// reclama. Por eso aquí no hay un solo contador agregado: cada fila descartada
// sale con su número, su valor original tal cual venía y su motivo concreto.
// ─────────────────────────────────────────────────────────────────────────────

/** Busca el grupo real detrás de un texto como "6A", "Séptimo B" o "1-01". */
function resolverGrupo(grupoTexto, { nombresGrupo, mapaGrupos }) {
  // Se prueba cada corte del texto contra los grupos que existen de verdad,
  // del sufijo más corto al más largo.
  for (let i = grupoTexto.length - 1; i >= 1; i--) {
    const nombreGrupo = normaliza(grupoTexto.slice(i))
    if (!nombresGrupo.has(nombreGrupo)) continue
    const encontrado = mapaGrupos[claveCanonica(grupoTexto.slice(0, i).trim()) + '|' + nombreGrupo]
    if (encontrado) return encontrado
  }
  return null
}

/**
 * Qué le pasa a un "Grupo" que no se pudo resolver. No clasifica por gusto: de
 * esto depende que la fila se pueda arreglar de un clic o haya que ir al Excel.
 *
 * El orden de los tres pasos importa y está medido contra el archivo de prueba:
 *  - "12A" tiene que decir *no existe el grado 12*, no *falta el grupo "2A" en
 *    1°*, aunque "1" sí sea un grado de verdad y el corte encaje.
 *  - "6D" tiene que decir *falta el grupo D en 6°*, que es la fila creable.
 */
function diagnosticar(grupoTexto, { nombresGrupo, mapaGrados }) {
  let gradoDesconocido = null

  // 1) El sufijo es un grupo que existe en algún grado. Si además el prefijo es
  //    un grado real, lo que falta es ese grupo en ese grado: se puede crear.
  for (let i = grupoTexto.length - 1; i >= 1; i--) {
    const nombreGrupo = grupoTexto.slice(i).trim()
    if (!nombresGrupo.has(normaliza(nombreGrupo))) continue
    const gradoTexto = grupoTexto.slice(0, i).trim()
    const grado = mapaGrados[claveCanonica(gradoTexto)]
    if (grado) return { motivo: 'falta-grupo', grado, nombreGrupo }
    if (!gradoDesconocido) gradoDesconocido = { gradoTexto, nombreGrupo }
  }

  // 2) El grupo existe en otros grados pero el grado no existe en ninguna parte.
  //    Se dice también por dónde se cortó el texto: sin eso, un "Mañana" suelto
  //    contesta *no existe el grado "Mañan"* y parece que la app deliró.
  if (gradoDesconocido) return { motivo: 'grado-desconocido', ...gradoDesconocido }

  // 3) El grupo no existe en ningún lado (los D y E del archivo de prueba). Se
  //    parte por el prefijo, del grado más largo al más corto, para que "11D"
  //    caiga en 11° y no en 1°.
  for (let i = grupoTexto.length - 1; i >= 1; i--) {
    const grado = mapaGrados[claveCanonica(grupoTexto.slice(0, i).trim())]
    if (grado) return { motivo: 'falta-grupo', grado, nombreGrupo: grupoTexto.slice(i).trim() }
  }

  return { motivo: 'ilegible' }
}

/** Reparte las filas del archivo en las que entran y las que no, con el motivo. */
function analizarFilas(filas, primeraFila, contexto) {
  const registros = []
  const descartadas = []

  filas.forEach((row, i) => {
    const fila = primeraFila + i
    const grupoTexto = (row['Grupo'] ?? row['grupo'] ?? '').toString().trim()
    const nombreTexto = (row['Nombre'] ?? row['nombre'] ?? row['Estudiante'] ?? '').toString().trim()

    // Fila entera en blanco: es el salto de línea final del archivo, no un
    // descarte. Se leen las filas vacías (`blankrows`) solo para que el número
    // de fila que se reporta sea el que el admin ve en Excel.
    if (!grupoTexto && !nombreTexto) return

    if (!nombreTexto) { descartadas.push({ fila, grupoTexto, nombreTexto, motivo: 'sin-nombre' }); return }
    if (!grupoTexto) { descartadas.push({ fila, grupoTexto, nombreTexto, motivo: 'sin-grupo' }); return }

    const gid = resolverGrupo(grupoTexto, contexto)
    if (gid) { registros.push({ grupo_id: gid, nombre: nombreTexto }); return }

    descartadas.push({ fila, grupoTexto, nombreTexto, ...diagnosticar(grupoTexto, contexto) })
  })

  return { registros, descartadas }
}

/** El motivo, escrito para un coordinador académico y no para un programador. */
function explicacion(d) {
  switch (d.motivo) {
    case 'sin-nombre': return 'la columna Nombre está vacía'
    case 'sin-grupo': return 'la columna Grupo está vacía'
    case 'falta-grupo': return `el grado ${d.grado.nombre} existe, pero no tiene ningún grupo "${d.nombreGrupo}"`
    case 'grado-desconocido': return `no existe ningún grado "${d.gradoTexto}" (se leyó "${d.grupoTexto}" como grado "${d.gradoTexto}" + grupo "${d.nombreGrupo}")`
    default: return `no se pudo separar "${d.grupoTexto}" en grado + grupo`
  }
}

/**
 * Agrupa las filas creables por (grado, grupo que falta), para poder ofrecer un
 * botón por grupo en vez de uno por fila. La pantalla /admin/estructura ya
 * acepta nombres libres, así que crear el grupo D de 6° es legítimo.
 */
function gruposQueFaltan(descartadas) {
  const mapa = new Map()
  descartadas.forEach(d => {
    if (d.motivo !== 'falta-grupo') return
    const clave = d.grado.id + '|' + normaliza(d.nombreGrupo)
    if (!mapa.has(clave)) mapa.set(clave, { clave, grado: d.grado, nombreGrupo: d.nombreGrupo, filas: [] })
    mapa.get(clave).filas.push(d)
  })
  return [...mapa.values()]
}

export default function EstudiantesAdmin() {
  const [grados, setGrados] = useState([])
  const [gradoId, setGradoId] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [nombre, setNombre] = useState(null)
  const [grupoId, setGrupoId] = useState(null)
  const [estudiantes, setEstudiantes] = useState([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [descartadas, setDescartadas] = useState([])
  const [creandoGrupo, setCreandoGrupo] = useState(null)
  const fileRef = useRef(null)
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false)
  const [textoConfirmacion, setTextoConfirmacion] = useState('')
  const [borrandoTodo, setBorrandoTodo] = useState(false)

  const cargarGrados = async () => {
    const { data } = await supabase.from('grados').select('*').order('orden')
    setGrados(data || [])
    if (data && data.length && !gradoId) setGradoId(data[0].id)
  }

  // Los grupos del grado, en su orden. Antes esta lista era una constante fija
  // con A, B y C, y el id se resolvia con una consulta aparte.
  const cargarGrupos = async (gid) => {
    const { data } = await supabase
      .from('grupos')
      .select('id, nombre')
      .eq('grado_id', gid)
      .order('orden')
    const lista = data || []
    setGrupos(lista)
    setNombre(prev => lista.some(g => g.nombre === prev) ? prev : (lista[0]?.nombre ?? null))
  }

  const cargarEstudiantes = async (gid) => {
    if (!gid) { setEstudiantes([]); return }
    const { data } = await supabase
      .from('estudiantes')
      .select('*')
      .eq('grupo_id', gid)
      .order('nombre')
    setEstudiantes(data || [])
  }

  useEffect(() => { cargarGrados().then(() => setCargando(false)) }, [])

  useEffect(() => {
    if (!gradoId) return
    cargarGrupos(gradoId)
  }, [gradoId])

  useEffect(() => {
    const gid = grupos.find(g => g.nombre === nombre)?.id ?? null
    setGrupoId(gid)
    cargarEstudiantes(gid)
  }, [grupos, nombre])

  const agregarEstudiante = async () => {
    const nombreEst = nuevoNombre.trim()
    if (!nombreEst || !grupoId) return
    const { error } = await supabase.from('estudiantes').insert({ grupo_id: grupoId, nombre: nombreEst })
    if (error) { setMensaje('Error: ' + error.message); return }
    setNuevoNombre('')
    setMensaje('')
    cargarEstudiantes(grupoId)
  }

  const eliminarEstudiante = async (id) => {
    await supabase.from('estudiantes').delete().eq('id', id)
    cargarEstudiantes(grupoId)
  }

  const importarExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMensaje('')
    setDescartadas([])

    const buf = await file.arrayBuffer()
    // `codepage: 65001` = UTF-8. Sin esto, un CSV sin BOM con "6°A" se lee como
    // "6Â°A" y se descarta el archivo entero culpando a la ortografía del
    // cliente. Excel y Google Sheets exportan UTF-8 por defecto: es el primer
    // archivo que sube un colegio nuevo.
    const wb = XLSX.read(buf, { type: 'array', codepage: 65001 })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    // `blankrows` mantiene la posición de cada fila, para que el número que se
    // reporta sea el mismo que el admin ve en la hoja abierta.
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: '', blankrows: true })
    const primeraFila = XLSX.utils.decode_range(sheet['!ref']).s.r + 2 // +1 por la cabecera, +1 por ser 1-based

    // La estructura se relee del servidor, no del estado de la pantalla: si otro
    // admin acaba de crear un grado, sus filas tienen que entrar igual.
    const [
      { data: gruposData, error: errorGrupos },
      { data: gradosData, error: errorGrados },
    ] = await Promise.all([
      supabase.from('grupos').select('id, nombre, grados(nombre)'),
      supabase.from('grados').select('id, nombre'),
    ])

    if (errorGrupos || errorGrados || !gruposData || !gradosData) {
      setMensaje('No se pudo leer la estructura de grados y grupos, así que no se importó nada: ' + (errorGrupos?.message ?? errorGrados?.message ?? 'sin respuesta del servidor'))
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    // Clave: grado canonico + nombre del grupo normalizado. El separador evita
    // que ("6", "1A") y ("61", "A") acaben en la misma clave.
    const mapaGrupos = {}
    const nombresGrupo = new Set()
    const mapaGrados = {}
    gruposData.forEach(g => {
      mapaGrupos[claveCanonica(g.grados.nombre) + '|' + normaliza(g.nombre)] = g.id
      nombresGrupo.add(normaliza(g.nombre))
    })
    // Los grados salen de su propia tabla y no de `gruposData`: un grado recién
    // creado y todavía sin grupos también tiene que poder recibir el suyo.
    gradosData.forEach(g => { mapaGrados[claveCanonica(g.nombre)] = { id: g.id, nombre: g.nombre } })

    const { registros, descartadas: sinColocar } = analizarFilas(
      filas, primeraFila, { nombresGrupo, mapaGrupos, mapaGrados },
    )

    const total = registros.length + sinColocar.length
    if (total === 0) {
      setMensaje('El archivo no tiene filas con datos. Revisa que las columnas se llamen "Grupo" y "Nombre".')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    if (registros.length > 0) {
      const { error } = await supabase.from('estudiantes').insert(registros)
      if (error) {
        setMensaje(`Error al importar: ${error.message}. No entró ninguna de las ${registros.length} filas válidas.`)
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    }

    setDescartadas(sinColocar)
    setMensaje(
      sinColocar.length === 0
        ? `Se importaron los ${registros.length} estudiantes del archivo. No quedó ninguna fila fuera.`
        : `Se importaron ${registros.length} de ${total} filas. Las otras ${sinColocar.length} NO entraron y están abajo, una por una, con el valor que traían.`,
    )

    if (grupoId) cargarEstudiantes(grupoId)
    if (fileRef.current) fileRef.current.value = ''
  }

  /**
   * Crea el grupo que faltaba y mete de una vez sus filas pendientes.
   *
   * Es el arreglo de un clic para el caso más común del archivo de prueba: 10 de
   * las 13 filas descartadas eran estudiantes de grupos D y E que el colegio sí
   * tiene. Antes, la única salida era irse al Excel a "corregir" datos correctos.
   */
  const crearGrupoYImportar = async (bloque) => {
    setCreandoGrupo(bloque.clave)
    setMensaje('')

    const { data: hermanos } = await supabase
      .from('grupos').select('orden').eq('grado_id', bloque.grado.id)

    // `orden` se manda explícito a propósito: hoy el trigger `grupos_sync` lo
    // rellenaría, pero la fase 3 lo borra y deja `orden` NOT NULL.
    let creado = await supabase
      .from('grupos')
      .insert({ grado_id: bloque.grado.id, nombre: bloque.nombreGrupo, orden: siguienteOrden(hermanos || []) })
      .select('id')
      .single()

    // Si lo crearon mientras tanto (otra pestaña, otro admin), sirve igual.
    if (creado.error?.code === '23505') {
      creado = await supabase
        .from('grupos').select('id')
        .eq('grado_id', bloque.grado.id).eq('nombre', bloque.nombreGrupo).single()
    }
    if (creado.error) {
      setMensaje(`No se pudo crear el grupo "${bloque.nombreGrupo}" en ${bloque.grado.nombre}: ${creado.error.message}. Sus ${bloque.filas.length} filas siguen sin importar.`)
      setCreandoGrupo(null)
      return
    }

    const { error } = await supabase
      .from('estudiantes')
      .insert(bloque.filas.map(f => ({ grupo_id: creado.data.id, nombre: f.nombreTexto })))
    if (error) {
      setMensaje(`El grupo "${bloque.nombreGrupo}" quedó creado en ${bloque.grado.nombre}, pero sus estudiantes no entraron: ${error.message}`)
      setCreandoGrupo(null)
      return
    }

    setDescartadas(prev => prev.filter(d => !bloque.filas.includes(d)))
    setMensaje(`Grupo "${bloque.nombreGrupo}" creado en ${bloque.grado.nombre} con sus ${bloque.filas.length} estudiantes.`)
    if (bloque.grado.id === gradoId) await cargarGrupos(gradoId)
    if (grupoId) cargarEstudiantes(grupoId)
    setCreandoGrupo(null)
  }

  const borrarTodosLosEstudiantes = async () => {
    if (textoConfirmacion !== 'BORRAR TODO') return
    setBorrandoTodo(true)
    setMensaje('')

    const { count: totalAntes } = await supabase
      .from('estudiantes')
      .select('id', { count: 'exact', head: true })

    const { error } = await supabase.from('estudiantes').delete().gt('id', 0)

    setBorrandoTodo(false)
    setMostrarConfirmacion(false)
    setTextoConfirmacion('')

    if (error) {
      setMensaje('Error al borrar: ' + error.message)
      return
    }

    setMensaje(`Se borraron ${totalAntes ?? 'todos los'} estudiantes de los 36 grupos. Las marcas de dificultad del periodo actual también se borraron (estaban ligadas a esos estudiantes). Ya puedes importar la lista nueva.`)
    if (grupoId) cargarEstudiantes(grupoId)
  }

  const faltanGrupos = gruposQueFaltan(descartadas)

  if (cargando) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Estudiantes por grupo</h2>
        <p className="text-sm text-slate-500 mb-4">
          Selecciona el grado y el grupo para ver, agregar o eliminar estudiantes.
        </p>

        <div className="flex gap-6">
          <div className="w-48 shrink-0 flex flex-col gap-1 max-h-96 overflow-y-auto">
            {grados.map(g => (
              <button
                key={g.id}
                onClick={() => setGradoId(g.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  gradoId === g.id ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {g.nombre}
              </button>
            ))}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              {grupos.map(gr => (
                <button
                  key={gr.id}
                  onClick={() => setNombre(gr.nombre)}
                  className={`w-10 h-10 rounded-lg text-sm font-bold border ${
                    nombre === gr.nombre
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-700'
                  }`}
                >
                  {gr.nombre}
                </button>
              ))}
              <span className="text-sm text-slate-500 ml-2">
                {estudiantes.length} estudiante{estudiantes.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarEstudiante()}
                placeholder="Nombre del estudiante"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
              />
              <button
                onClick={agregarEstudiante}
                className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Agregar
              </button>
            </div>

            <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
              {estudiantes.map(e => (
                <div
                  key={e.id}
                  className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg text-sm"
                >
                  <span>{e.nombre}</span>
                  <button
                    onClick={() => eliminarEstudiante(e.id)}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
              {estudiantes.length === 0 && (
                <p className="text-sm text-slate-400">Sin estudiantes en este grupo todavía.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-2">Importar desde Excel (todos los grupos a la vez)</h3>
        <p className="text-sm text-slate-500 mb-3">
          Columnas requeridas: <b>Grupo</b> (acepta "1A", "Transición B", "Séptimo B", "Once C"/"Undécimo C", etc.) y <b>Nombre</b>.
          Puedes incluir todos los grupos del colegio en un solo archivo. Si alguna fila no entra,
          sale listada abajo con su número de fila y el motivo — <b>ninguna se descarta en silencio</b>.
        </p>
        <label className="cursor-pointer inline-block bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          Seleccionar archivo
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importarExcel} className="hidden" />
        </label>
      </div>

      {descartadas.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-300 p-6">
          <h3 className="text-sm font-bold text-amber-900 mb-1">
            {descartadas.length} {descartadas.length === 1 ? 'fila del archivo no entró' : 'filas del archivo no entraron'}
          </h3>
          <p className="text-sm text-amber-800 mb-4">
            Están todas aquí, con el número de fila y el valor tal cual venía. Puedes crear el grupo
            que falta desde aquí mismo, corregir el archivo y volver a importar solo estas filas, o
            dejarlas fuera a sabiendas — pero ya no desaparecen sin que nadie se entere.
          </p>

          {faltanGrupos.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {faltanGrupos.map(b => (
                <div
                  key={b.clave}
                  className="flex items-center gap-3 flex-wrap bg-white border border-amber-300 rounded-lg px-3 py-2"
                >
                  <span className="text-sm text-slate-700 flex-1 min-w-[16rem]">
                    <b>{b.filas.length}</b> {b.filas.length === 1 ? 'fila espera' : 'filas esperan'} el grupo{' '}
                    <b>"{b.nombreGrupo}"</b> de <b>{b.grado.nombre}</b>, que todavía no existe.
                  </span>
                  <button
                    onClick={() => crearGrupoYImportar(b)}
                    disabled={creandoGrupo !== null}
                    className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 shrink-0"
                  >
                    {creandoGrupo === b.clave
                      ? 'Creando...'
                      : `Crear el grupo y agregar sus ${b.filas.length}`}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-amber-100 text-amber-900 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-bold">Fila</th>
                  <th className="px-3 py-2 font-bold">Grupo</th>
                  <th className="px-3 py-2 font-bold">Nombre</th>
                  <th className="px-3 py-2 font-bold">Por qué no entró</th>
                </tr>
              </thead>
              <tbody>
                {descartadas.map(d => (
                  <tr key={d.fila} className="border-t border-amber-100 align-top">
                    <td className="px-3 py-1.5 text-slate-500 tabular-nums">{d.fila}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-700">
                      {d.grupoTexto || <span className="text-slate-400 italic">(vacío)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700">
                      {d.nombreTexto || <span className="text-slate-400 italic">(vacío)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{explicacion(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setDescartadas([])}
            className="mt-3 text-xs font-semibold text-amber-800 hover:text-amber-950 underline"
          >
            Ya las revisé, ocultar la lista
          </button>
        </div>
      )}

      <div className="bg-red-50 rounded-xl border border-red-200 p-6">
        <h3 className="text-sm font-bold text-red-800 mb-1">Zona peligrosa</h3>
        <p className="text-sm text-red-700 mb-3">
          Borra <b>todos</b> los estudiantes de los <b>36 grupos</b> de una sola vez, para volver a importar la lista
          actualizada desde el sistema de matrículas. Úsalo solo <b>antes</b> de que los docentes empiecen a marcar en
          un periodo nuevo — si ya hay marcas hechas en el periodo actual, también se perderán.
        </p>
        {!mostrarConfirmacion ? (
          <button
            onClick={() => setMostrarConfirmacion(true)}
            className="bg-white border border-red-400 text-red-700 hover:bg-red-100 transition text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Borrar todos los estudiantes
          </button>
        ) : (
          <div className="bg-white border border-red-300 rounded-lg p-4 flex flex-col gap-3 max-w-md">
            <p className="text-sm text-slate-700">
              Para confirmar, escribe <code className="bg-red-100 px-1 rounded font-mono text-red-700">BORRAR TODO</code> abajo:
            </p>
            <input
              value={textoConfirmacion}
              onChange={e => setTextoConfirmacion(e.target.value)}
              placeholder="BORRAR TODO"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={borrarTodosLosEstudiantes}
                disabled={textoConfirmacion !== 'BORRAR TODO' || borrandoTodo}
                className="bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {borrandoTodo ? 'Borrando...' : 'Sí, borrar todo'}
              </button>
              <button
                onClick={() => { setMostrarConfirmacion(false); setTextoConfirmacion('') }}
                className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}
