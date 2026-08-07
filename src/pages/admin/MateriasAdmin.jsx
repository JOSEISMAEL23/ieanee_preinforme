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

  const agregarMasivo = async () => {
    const nombres = textoMasivo.split(',').map(s => s.trim()).filter(Boolean)
    if (nombres.length === 0) return
    const filas = nombres.map((nombre, i) => ({
      grado_id: gradoId, nombre, orden: materias.length + i,
    }))
    const { error } = await supabase.from('materias').insert(filas)
    if (error && error.code !== '23505') {
      setMensaje('Algunas materias no se pudieron guardar: ' + error.message)
    } else {
      setMensaje(`${nombres.length} materias procesadas.`)
    }
    setTextoMasivo('')
    cargarMaterias(gradoId)
  }

  const importarExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    const gradosPorNombre = Object.fromEntries(grados.map(g => [normaliza(g.nombre), g.id]))
    const contadorPorGrado = {}
    const registros = []

    filas.forEach(row => {
      const gradoTexto = (row['Grado'] ?? row['grado'] ?? '').toString().trim()
      const materiaTexto = (row['Materia'] ?? row['materia'] ?? '').toString().trim()
      const gid = gradosPorNombre[normaliza(gradoTexto)]
      if (!gid || !materiaTexto) return
      contadorPorGrado[gid] = (contadorPorGrado[gid] ?? 0) + 1
      registros.push({ grado_id: gid, nombre: materiaTexto, orden: contadorPorGrado[gid] })
    })

    if (registros.length === 0) {
      setMensaje('No se encontraron filas válidas. Revisa que las columnas se llamen "Grado" y "Materia".')
      return
    }

    const { error } = await supabase.from('materias').insert(registros)
    setMensaje(
      error && error.code !== '23505'
        ? 'Error al importar: ' + error.message
        : `Se importaron ${registros.length} materias (las repetidas se omitieron).`
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
        </p>
        <label className="cursor-pointer inline-block bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          Seleccionar archivo
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importarExcel} className="hidden" />
        </label>
      </div>

      {mensaje && <p className="text-sm text-slate-600">{mensaje}</p>}
    </div>
  )
}

function normaliza(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[°\s]/g, '')
}