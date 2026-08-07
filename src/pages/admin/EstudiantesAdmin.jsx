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
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    const { data: gruposData } = await supabase
      .from('grupos')
      .select('id, nombre, grados(nombre)')

    // Clave: grado canonico + nombre del grupo normalizado. El separador evita
    // que ("6", "1A") y ("61", "A") acaben en la misma clave.
    const mapaGrupos = {}
    const nombresGrupo = new Set()
    gruposData.forEach(g => {
      mapaGrupos[claveCanonica(g.grados.nombre) + '|' + normaliza(g.nombre)] = g.id
      nombresGrupo.add(normaliza(g.nombre))
    })

    const registros = []
    let omitidas = 0
    const gradosNoReconocidos = new Set()

    filas.forEach(row => {
      const grupoTexto = (row['Grupo'] ?? row['grupo'] ?? '').toString().trim()
      const nombreTexto = (row['Nombre'] ?? row['nombre'] ?? row['Estudiante'] ?? '').toString().trim()
      if (!grupoTexto || !nombreTexto) { omitidas++; return }

      // Separar "6A" en grado + grupo. Antes se daba por hecho que el grupo
      // era el ultimo caracter del texto y que estaba en la lista fija A/B/C,
      // asi que los grupos D y E se descartaban aqui. Ahora se prueba cada
      // corte del texto contra los grupos que existen de verdad, del sufijo
      // mas corto al mas largo.
      let gid = null
      let gradoDelTexto = null
      for (let i = grupoTexto.length - 1; i >= 1; i--) {
        const nombreGrupo = normaliza(grupoTexto.slice(i))
        if (!nombresGrupo.has(nombreGrupo)) continue
        const gradoTexto = grupoTexto.slice(0, i).trim()
        if (gradoDelTexto === null) gradoDelTexto = gradoTexto
        const encontrado = mapaGrupos[claveCanonica(gradoTexto) + '|' + nombreGrupo]
        if (encontrado) { gid = encontrado; break }
      }
      // Se nombra el grado solo cuando el grupo si existe en algun grado: es
      // el mismo criterio de hoy, cuando tenia que estar en la lista fija.
      if (!gid) {
        omitidas++
        if (gradoDelTexto) gradosNoReconocidos.add(gradoDelTexto)
        return
      }

      registros.push({ grupo_id: gid, nombre: nombreTexto })
    })

    if (registros.length === 0) {
      setMensaje(
        gradosNoReconocidos.size > 0
          ? `No se reconocieron estos grados: ${[...gradosNoReconocidos].join(', ')}. Revisa la ortografía en el Excel.`
          : 'No se encontraron filas válidas. Revisa las columnas "Grupo" y "Nombre".'
      )
      return
    }

    const { error } = await supabase.from('estudiantes').insert(registros)
    let resumen = error
      ? 'Error al importar: ' + error.message
      : `Se importaron ${registros.length} estudiantes.`
    if (!error && omitidas > 0) {
      resumen += ` Se omitieron ${omitidas} filas.`
      if (gradosNoReconocidos.size > 0) {
        resumen += ` Grados no reconocidos: ${[...gradosNoReconocidos].join(', ')}.`
      }
    }
    setMensaje(resumen)

    if (grupoId) cargarEstudiantes(grupoId)
    if (fileRef.current) fileRef.current.value = ''
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
          Puedes incluir los 36 grupos en un solo archivo.
        </p>
        <label className="cursor-pointer inline-block bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          Seleccionar archivo
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importarExcel} className="hidden" />
        </label>
      </div>

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
