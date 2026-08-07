import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

export default function MateriasAdmin() {
  const [grados, setGrados] = useState([])
  const [gradoId, setGradoId] = useState(null)
  const [materias, setMaterias] = useState([])
  const [nuevaMateria, setNuevaMateria] = useState('')
  const [textoMasivo, setTextoMasivo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [descartadas, setDescartadas] = useState([])
  const fileRef = useRef(null)

  const cargarGrados = async () => {
    const { data } = await supabase.from('grados').select('*').order('orden')
    setGrados(data || [])
    if (data && data.length && !gradoId) setGradoId(data[0].id)
  }

  const cargarMaterias = async (gid) => {
    if (!gid) return
    const { data } = await supabase
      .from('materias')
      .select('*')
      .eq('grado_id', gid)
      .order('orden')
    setMaterias(data || [])
  }

  useEffect(() => { cargarGrados().then(() => setCargando(false)) }, [])
  useEffect(() => {
    setEditandoId(null)
    setNombreEditado('')
    cargarMaterias(gradoId)
  }, [gradoId])

  const agregarMateria = async () => {
    const nombre = nuevaMateria.trim()
    if (!nombre) return
    const { error } = await supabase
      .from('materias')
      .insert({ grado_id: gradoId, nombre, orden: materias.length })
    if (error) {
      setMensaje(error.code === '23505' ? 'Esa materia ya existe en este grado.' : 'Error: ' + error.message)
      return
    }
    setNuevaMateria('')
    setMensaje('')
    cargarMaterias(gradoId)
  }

  const iniciarEdicion = (m) => {
    setEditandoId(m.id)
    setNombreEditado(m.nombre)
    setMensaje('')
  }

  const cancelarEdicion = () => {
    setEditandoId(null)
    setNombreEditado('')
  }

  const guardarEdicion = async (id) => {
    const nombre = nombreEditado.trim()
    if (!nombre) {
      setMensaje('El nombre de la materia no puede quedar vacío.')
      return
    }
    const { error } = await supabase.from('materias').update({ nombre }).eq('id', id)
    if (error) {
      setMensaje(
        error.code === '23505'
          ? 'Ya existe una materia con ese nombre en este grado.'
          : 'Error al renombrar: ' + error.message
      )
      return
    }
    cancelarEdicion()
    setMensaje('')
    cargarMaterias(gradoId)
  }

  const eliminarMateria = async (id) => {
    const { error } = await supabase.from('materias').delete().eq('id', id)
    if (error) {
      setMensaje(
        error.code === '23503'
          ? 'No se puede eliminar: esta materia tiene docentes asignados o registros asociados. Renómbrala si solo quieres corregir el nombre.'
          : 'Error al eliminar: ' + error.message
      )
      return
    }
    setMensaje('')
    cargarMaterias(gradoId)
  }

  // ───────────────────────────────────────────────────────────────────────────
  // POR QUÉ SE FILTRAN LAS REPETIDAS ANTES DE INSERTAR
  //
  // Las dos funciones de abajo hacían `if (error && error.code !== '23505')`:
  // tragarse el error de duplicado y anunciar "15 materias procesadas". Pero un
  // `insert` de varias filas en Postgres es todo o nada — si UNA sola estaba
  // repetida, no entraba NINGUNA y el mensaje seguía diciendo que sí. Es el
  // mismo bug que el import de estudiantes: filas desaparecidas + mensaje de
  // éxito.
  //
  // El arreglo no es leer mejor el error, es no provocarlo: se descartan las que
  // ya existen (constraint `materias_grado_id_nombre_key`, exacta por texto) y
  // se inserta solo lo nuevo. Así el número que se anuncia es el que se guardó.
  // ───────────────────────────────────────────────────────────────────────────

  const agregarMasivo = async () => {
    const nombres = textoMasivo.split(',').map(s => s.trim()).filter(Boolean)
    if (nombres.length === 0) return

    const yaEstaban = []
    const nuevas = []
    const vistas = new Set(materias.map(m => m.nombre))
    nombres.forEach(nombre => {
      if (vistas.has(nombre)) { yaEstaban.push(nombre); return }
      vistas.add(nombre)
      nuevas.push(nombre)
    })

    let guardadas = 0
    if (nuevas.length > 0) {
      const filas = nuevas.map((nombre, i) => ({
        grado_id: gradoId, nombre, orden: materias.length + i,
      }))
      const { data, error } = await supabase.from('materias').insert(filas).select('id')
      if (error) {
        setMensaje(`No se guardó ninguna de las ${nuevas.length} materias nuevas: ${error.message}`)
        cargarMaterias(gradoId)
        return
      }
      guardadas = data?.length ?? 0
    }

    setMensaje(
      yaEstaban.length === 0
        ? `Se agregaron ${guardadas} materias.`
        : `Se agregaron ${guardadas} materias. ${yaEstaban.length} ya existían en este grado y se dejaron como estaban: ${yaEstaban.join(', ')}.`,
    )
    setTextoMasivo('')
    cargarMaterias(gradoId)
  }

  const importarExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setMensaje('')
    setDescartadas([])

    const buf = await file.arrayBuffer()
    // `codepage: 65001` = UTF-8, igual que en EstudiantesAdmin. Sin esto, un CSV
    // sin BOM con "Matemáticas" o "1°" llega como mojibake y el grado deja de
    // reconocerse. Excel y Google Sheets exportan UTF-8 por defecto.
    const wb = XLSX.read(buf, { type: 'array', codepage: 65001 })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    // `blankrows` mantiene la posición: el número de fila que se reporta es el
    // que el admin ve en la hoja abierta.
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: '', blankrows: true })
    const primeraFila = XLSX.utils.decode_range(sheet['!ref']).s.r + 2

    const [
      { data: gradosData, error: errorGrados },
      { data: materiasData, error: errorMaterias },
    ] = await Promise.all([
      supabase.from('grados').select('id, nombre'),
      supabase.from('materias').select('grado_id, nombre'),
    ])

    if (errorGrados || errorMaterias || !gradosData || !materiasData) {
      setMensaje('No se pudieron leer los grados y las materias que ya existen, así que no se importó nada: ' + (errorGrados?.message ?? errorMaterias?.message ?? 'sin respuesta del servidor'))
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const gradosPorNombre = {}
    gradosData.forEach(g => { gradosPorNombre[normaliza(g.nombre)] = g })
    const cuantasTiene = {}
    const yaExisten = new Set()
    materiasData.forEach(m => {
      yaExisten.add(m.grado_id + '|' + m.nombre)
      cuantasTiene[m.grado_id] = (cuantasTiene[m.grado_id] ?? 0) + 1
    })

    const registros = []
    const sinGuardar = []

    filas.forEach((row, i) => {
      const fila = primeraFila + i
      const gradoTexto = (row['Grado'] ?? row['grado'] ?? '').toString().trim()
      const materiaTexto = (row['Materia'] ?? row['materia'] ?? '').toString().trim()

      // Fila entera en blanco: el salto de línea final del archivo, no un descarte.
      if (!gradoTexto && !materiaTexto) return

      const descartar = (motivo) => sinGuardar.push({ fila, gradoTexto, materiaTexto, motivo })
      if (!materiaTexto) return descartar('la columna Materia está vacía')
      if (!gradoTexto) return descartar('la columna Grado está vacía')

      const grado = gradosPorNombre[normaliza(gradoTexto)]
      if (!grado) return descartar(`no existe ningún grado "${gradoTexto}"`)

      const clave = grado.id + '|' + materiaTexto
      if (yaExisten.has(clave)) return descartar(`${grado.nombre} ya tenía esa materia; se dejó como estaba`)

      yaExisten.add(clave)
      cuantasTiene[grado.id] = (cuantasTiene[grado.id] ?? 0) + 1
      registros.push({ grado_id: grado.id, nombre: materiaTexto, orden: cuantasTiene[grado.id] })
    })

    if (registros.length + sinGuardar.length === 0) {
      setMensaje('El archivo no tiene filas con datos. Revisa que las columnas se llamen "Grado" y "Materia".')
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    let guardadas = 0
    if (registros.length > 0) {
      const { data, error } = await supabase.from('materias').insert(registros).select('id')
      if (error) {
        setMensaje(`Error al importar: ${error.message}. No se guardó ninguna de las ${registros.length} materias nuevas.`)
        setDescartadas(sinGuardar)
        cargarMaterias(gradoId)
        if (fileRef.current) fileRef.current.value = ''
        return
      }
      guardadas = data?.length ?? 0
    }

    setDescartadas(sinGuardar)
    setMensaje(
      sinGuardar.length === 0
        ? `Se guardaron ${guardadas} materias nuevas. No quedó ninguna fila fuera.`
        : `Se guardaron ${guardadas} materias nuevas. Las otras ${sinGuardar.length} filas NO se guardaron y están abajo, una por una.`,
    )
    cargarMaterias(gradoId)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Materias por grado</h2>
        <p className="text-sm text-slate-500 mb-4">
          Las materias que definas para un grado aplican automáticamente a todos sus grupos.
        </p>

        <div className="flex gap-6">
          <div className="w-48 shrink-0 flex flex-col gap-1 max-h-96 overflow-y-auto">
            {grados.map(g => (
              <button
                key={g.id}
                onClick={() => setGradoId(g.id)}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between ${
                  gradoId === g.id ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{g.nombre}</span>
                <span className="text-xs text-slate-400">{g.id === gradoId ? materias.length : ''}</span>
              </button>
            ))}
          </div>

          <div className="flex-1">
            <div className="flex gap-2 mb-4">
              <input
                value={nuevaMateria}
                onChange={e => setNuevaMateria(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarMateria()}
                placeholder="Nombre de la materia"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
              />
              <button
                onClick={agregarMateria}
                className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Agregar
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {materias.map(m => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  {editandoId === m.id ? (
                    <input
                      value={nombreEditado}
                      onChange={e => setNombreEditado(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') guardarEdicion(m.id)
                        if (e.key === 'Escape') cancelarEdicion()
                      }}
                      autoFocus
                      className="bg-white border border-slate-300 rounded-full px-2 py-0.5 text-xs font-semibold w-40"
                    />
                  ) : (
                    <>
                      {m.nombre}
                      <button
                        onClick={() => iniciarEdicion(m)}
                        title="Renombrar"
                        className="text-slate-400 hover:text-emerald-700"
                      >
                        ✎
                      </button>
                      <button onClick={() => eliminarMateria(m.id)} className="text-red-500 hover:text-red-700">
                        ×
                      </button>
                    </>
                  )}
                </span>
              ))}
              {materias.length === 0 && (
                <p className="text-sm text-slate-400">Sin materias configuradas todavía.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-2">Agregar varias a la vez (al grado seleccionado)</h3>
        <textarea
          value={textoMasivo}
          onChange={e => setTextoMasivo(e.target.value)}
          rows={3}
          placeholder="Matemáticas, C. Naturales, L. Castellana, C. Lectura, Idioma Extranjero..."
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full mb-3"
        />
        <button
          onClick={agregarMasivo}
          className="bg-white border border-emerald-800 text-emerald-800 px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Agregar todas
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-2">Importar desde Excel (todos los grados a la vez)</h3>
        <p className="text-sm text-slate-500 mb-3">
          Columnas requeridas: <b>Grado</b> (ej. "1°", "Transición", "11°") y <b>Materia</b>.
          Las filas que no se guarden salen listadas abajo con su número de fila y el motivo.
        </p>
        <label className="cursor-pointer inline-block bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          Seleccionar archivo
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importarExcel} className="hidden" />
        </label>
      </div>

      {descartadas.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-300 p-6">
          <h3 className="text-sm font-bold text-amber-900 mb-1">
            {descartadas.length} {descartadas.length === 1 ? 'fila del archivo no se guardó' : 'filas del archivo no se guardaron'}
          </h3>
          <p className="text-sm text-amber-800 mb-4">
            Cada una con su número de fila y el valor tal cual venía. Las que ya existían se
            dejaron intactas; las demás necesitan que corrijas el archivo.
          </p>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-sm text-left">
              <thead className="bg-amber-100 text-amber-900 text-xs uppercase sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-bold">Fila</th>
                  <th className="px-3 py-2 font-bold">Grado</th>
                  <th className="px-3 py-2 font-bold">Materia</th>
                  <th className="px-3 py-2 font-bold">Por qué no se guardó</th>
                </tr>
              </thead>
              <tbody>
                {descartadas.map(d => (
                  <tr key={d.fila} className="border-t border-amber-100 align-top">
                    <td className="px-3 py-1.5 text-slate-500 tabular-nums">{d.fila}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-700">
                      {d.gradoTexto || <span className="text-slate-400 italic">(vacío)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-700">
                      {d.materiaTexto || <span className="text-slate-400 italic">(vacío)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{d.motivo}</td>
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

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}

function normaliza(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[°\s]/g, '')
}