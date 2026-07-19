import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

const LETRAS = ['A', 'B', 'C']

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
function claveCanonica(gradoTexto) {
  const norm = normaliza(gradoTexto)
  return MAPA_GRADOS_PALABRA[norm] ?? norm
}

function generarEmailSintetico(nombre, yaUsados) {
  const base = nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.')
  let email = `${base}@colegio.interno`
  let n = 2
  while (yaUsados.has(email)) {
    email = `${base}${n}@colegio.interno`
    n++
  }
  yaUsados.add(email)
  return email
}

export default function DocentesAdmin() {
  const [grados, setGrados] = useState([])
  const [materiasByGrado, setMateriasByGrado] = useState({})
  const [grupos, setGrupos] = useState([]) // {id, letra, grado_id}
  const [docentes, setDocentes] = useState(null)
  const [expandido, setExpandido] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [nombreEditado, setNombreEditado] = useState('')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState('')
  const [procesando, setProcesando] = useState(false)
  const fileRef = useRef(null)

  const cargarCatalogos = async () => {
    const { data: gradosData } = await supabase.from('grados').select('*').order('orden')
    const { data: materiasData } = await supabase.from('materias').select('*').order('orden')
    const { data: gruposData } = await supabase.from('grupos').select('*')

    setGrados(gradosData || [])
    setGrupos(gruposData || [])

    const porGrado = {}
    ;(gradosData || []).forEach(g => { porGrado[g.id] = [] })
    ;(materiasData || []).forEach(m => {
      if (!porGrado[m.grado_id]) porGrado[m.grado_id] = []
      porGrado[m.grado_id].push(m)
    })
    setMateriasByGrado(porGrado)
  }

  const cargarDocentes = async () => {
    const { data } = await supabase
      .from('docentes')
      .select(`
        id, user_id, nombre, email, rol,
        asignaciones ( id, materia_id, grupo_id,
          materias ( nombre ),
          grupos ( letra, grados ( nombre ) )
        )
      `)
      .eq('rol', 'docente')
      .order('nombre')
    setDocentes(data || [])
  }

  useEffect(() => {
    (async () => {
      await cargarCatalogos()
      await cargarDocentes()
      setCargando(false)
    })()
  }, [])

  const eliminarDocente = async (d) => {
    if (!confirm(`¿Eliminar a ${d.nombre}? Perderá acceso y se borrarán sus asignaciones.`)) return
    const { data: sessionData } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('admin-docentes', {
      body: { accion: 'eliminar', docente_id: d.id, user_id: d.user_id },
    })
    if (error || data?.error) {
      setMensaje('Error al eliminar: ' + (data?.error || error.message))
      return
    }
    setMensaje(`${d.nombre} fue eliminado.`)
    cargarDocentes()
  }

  const resetearPassword = async (d) => {
    const nueva = prompt(`Nueva contraseña para ${d.nombre}:`)
    if (!nueva || nueva.trim().length < 4) return
    const { data, error } = await supabase.functions.invoke('admin-docentes', {
      body: { accion: 'reset_password', user_id: d.user_id, nueva_password: nueva.trim() },
    })
    if (error || data?.error) {
      setMensaje('Error al restablecer: ' + (data?.error || error.message))
      return
    }
    setMensaje(`Contraseña de ${d.nombre} actualizada.`)
  }

  const iniciarEdicionNombre = (d) => {
    setEditandoId(d.id)
    setNombreEditado(d.nombre)
  }

  const cancelarEdicionNombre = () => {
    setEditandoId(null)
    setNombreEditado('')
  }

  const guardarNombreEditado = async (d) => {
    const nuevo = nombreEditado.trim()
    if (!nuevo) return
    setGuardandoNombre(true)
    const { error } = await supabase.from('docentes').update({ nombre: nuevo }).eq('id', d.id)
    setGuardandoNombre(false)
    if (error) {
      setMensaje('Error al actualizar el nombre: ' + error.message)
      return
    }
    setMensaje(`Nombre actualizado a "${nuevo}". Se refleja en todas sus asignaciones automáticamente.`)
    setEditandoId(null)
    cargarDocentes()
  }

  const cambiarCorreo = async (d) => {
    const nuevo = prompt(`Nuevo correo para ${d.nombre}:`, d.email)
    if (!nuevo || !nuevo.trim() || nuevo.trim() === d.email) return
    const { data, error } = await supabase.functions.invoke('admin-docentes', {
      body: { accion: 'cambiar_email', docente_id: d.id, user_id: d.user_id, nuevo_email: nuevo.trim() },
    })
    if (error || data?.error) {
      setMensaje('Error al cambiar el correo: ' + (data?.error || error.message))
      return
    }
    setMensaje(`Correo de ${d.nombre} actualizado a ${nuevo.trim()}.`)
    cargarDocentes()
  }

  const quitarAsignacion = async (asignacionId, docenteId) => {
    await supabase.from('asignaciones').delete().eq('id', asignacionId)
    cargarDocentes()
  }

  const importarExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setProcesando(true)
    setMensaje('')

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    // Mapas de resolución grupo+materia -> ids
    const mapaGrados = {}
    grados.forEach(g => { mapaGrados[claveCanonica(g.nombre)] = g })
    const mapaGrupos = {}
    grupos.forEach(g => { mapaGrupos[`${g.grado_id}_${g.letra.toUpperCase()}`] = g.id })
    const mapaMaterias = {}
    Object.entries(materiasByGrado).forEach(([gradoId, lista]) => {
      lista.forEach(m => { mapaMaterias[`${gradoId}_${normaliza(m.nombre)}`] = m.id })
    })

    const { data: docentesExistentes } = await supabase.from('docentes').select('email, nombre')
    const emailsUsados = new Set((docentesExistentes || []).map(d => d.email))

    const porNombre = {}
    let filasInvalidas = 0

    filas.forEach(row => {
      const nombre = (row['Nombre'] ?? row['nombre'] ?? '').toString().trim()
      const emailCol = (row['Email'] ?? row['email'] ?? row['Correo'] ?? '').toString().trim()
      const passwordCol = (row['Password'] ?? row['password'] ?? row['Contraseña'] ?? '').toString().trim()
      const grupoTexto = (row['Grupo'] ?? row['grupo'] ?? '').toString().trim()
      const materiaTexto = (row['Materia'] ?? row['materia'] ?? '').toString().trim()

      if (!nombre || !grupoTexto || !materiaTexto) { filasInvalidas++; return }

      const letra = grupoTexto.slice(-1).toUpperCase()
      if (!LETRAS.includes(letra)) { filasInvalidas++; return }
      const gradoTexto = grupoTexto.slice(0, -1).trim()
      const grado = mapaGrados[claveCanonica(gradoTexto)]
      if (!grado) { filasInvalidas++; return }
      const grupoId = mapaGrupos[`${grado.id}_${letra}`]
      const materiaId = mapaMaterias[`${grado.id}_${normaliza(materiaTexto)}`]
      if (!grupoId || !materiaId) { filasInvalidas++; return }

      if (!porNombre[nombre]) {
        porNombre[nombre] = { nombre, email: emailCol || null, password: passwordCol || null, asignaciones: [] }
      }
      if (emailCol) porNombre[nombre].email = emailCol
      if (passwordCol) porNombre[nombre].password = passwordCol
      porNombre[nombre].asignaciones.push({ grupo_id: grupoId, materia_id: materiaId })
    })

    const listaDocentes = Object.values(porNombre)
    let creados = 0
    let fallidos = []

    for (const d of listaDocentes) {
      if (emailsUsados.has(d.nombre)) { /* no-op, name isn't the key for uniqueness */ }
      const email = d.email || generarEmailSintetico(d.nombre, emailsUsados)
      const password = d.password || 'Docente1234'

      const { data, error } = await supabase.functions.invoke('admin-docentes', {
        body: { accion: 'crear', nombre: d.nombre, email, password, asignaciones: d.asignaciones },
      })

      if (error || data?.error) {
        fallidos.push(`${d.nombre}: ${data?.error || error.message}`)
      } else {
        creados++
      }
    }

    setProcesando(false)
    let resumen = `Se crearon ${creados} de ${listaDocentes.length} docentes.`
    if (filasInvalidas > 0) resumen += ` Se omitieron ${filasInvalidas} filas inválidas.`
    if (fallidos.length > 0) resumen += ` Fallos: ${fallidos.join(' | ')}`
    setMensaje(resumen)
    cargarDocentes()
    if (fileRef.current) fileRef.current.value = ''
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando...</p>

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Agregar docente</h2>
        <p className="text-sm text-slate-500 mb-4">
          Se crea una cuenta de acceso real. Si el docente no tiene correo, se le genera uno interno automáticamente.
        </p>
        <NuevoDocenteForm
          grados={grados}
          materiasByGrado={materiasByGrado}
          grupos={grupos}
          docentesExistentes={docentes || []}
          onCreado={(msg) => { setMensaje(msg); cargarDocentes() }}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-2">Importar desde Excel (varios docentes a la vez)</h3>
        <p className="text-sm text-slate-500 mb-3">
          Columnas: <b>Nombre</b>, <b>Email</b> (opcional), <b>Password</b> (opcional), <b>Grupo</b>, <b>Materia</b>.
          Una fila por cada asignación — repite el nombre si el docente dicta varias materias/grupos.
          Si no pones Email, se genera uno interno. Si no pones Password, se usa <code className="bg-slate-100 px-1 rounded">Docente1234</code>.
        </p>
        <label className="cursor-pointer inline-block bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          {procesando ? 'Procesando...' : 'Seleccionar archivo'}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importarExcel} disabled={procesando} className="hidden" />
        </label>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4">
          Docentes registrados {docentes && <span className="text-slate-400 font-normal">({docentes.length})</span>}
        </h3>
        {docentes && docentes.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay docentes. Agrégalos arriba.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(docentes || []).map(d => (
              <div key={d.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandido(expandido === d.id ? null : d.id)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{d.nombre}</div>
                    <div className="text-xs text-slate-500">{d.email}</div>
                  </div>
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full font-semibold">
                    {d.asignaciones.length} asignaciones
                  </span>
                </button>
                {expandido === d.id && (
                  <div className="p-4 flex flex-col gap-2">
                    {editandoId === d.id ? (
                      <div className="flex items-center gap-2 mb-2 pb-3 border-b border-slate-100">
                        <input
                          value={nombreEditado}
                          onChange={e => setNombreEditado(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && guardarNombreEditado(d)}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => guardarNombreEditado(d)}
                          disabled={guardandoNombre || !nombreEditado.trim()}
                          className="bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                        >
                          {guardandoNombre ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          onClick={cancelarEdicionNombre}
                          className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : null}
                    {d.asignaciones.map(a => (
                      <div key={a.id} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{a.grupos.grados.nombre} {a.grupos.letra} — {a.materias.nombre}</span>
                        <button
                          onClick={() => quitarAsignacion(a.id, d.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold"
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                    {d.asignaciones.length === 0 && (
                      <p className="text-sm text-slate-400">Sin asignaciones.</p>
                    )}
                    <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => iniciarEdicionNombre(d)}
                        className="text-slate-600 hover:text-slate-900 text-xs font-semibold"
                      >
                        Editar nombre
                      </button>
                      <button
                        onClick={() => resetearPassword(d)}
                        className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
                      >
                        Restablecer contraseña
                      </button>
                      <button
                        onClick={() => cambiarCorreo(d)}
                        className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
                      >
                        Cambiar correo
                      </button>
                      <button
                        onClick={() => eliminarDocente(d)}
                        className="text-red-500 hover:text-red-700 text-xs font-semibold"
                      >
                        Eliminar docente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-slate-600 whitespace-pre-wrap">{mensaje}</p>}
    </div>
  )
}

function NuevoDocenteForm({ grados, materiasByGrado, grupos, docentesExistentes, onCreado }) {
  const [nombre, setNombre] = useState('')
  const [sinCorreo, setSinCorreo] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gradoId, setGradoId] = useState(grados[0]?.id ?? null)
  const [letrasSel, setLetrasSel] = useState([])
  const [materiaId, setMateriaId] = useState('')
  const [asignaciones, setAsignaciones] = useState([]) // {grupo_id, materia_id, label}
  const [guardando, setGuardando] = useState(false)

  const materiasDisponibles = materiasByGrado[gradoId] || []

  const toggleLetra = (l) => {
    setLetrasSel(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  const addAsignacion = () => {
    if (!materiaId || letrasSel.length === 0) return
    const grado = grados.find(g => g.id === gradoId)
    const materia = materiasDisponibles.find(m => m.id === Number(materiaId))
    const nuevas = letrasSel.map(l => {
      const grupo = grupos.find(g => g.grado_id === gradoId && g.letra === l)
      return {
        grupo_id: grupo?.id, materia_id: Number(materiaId),
        label: `${grado.nombre} ${l} — ${materia.nombre}`,
      }
    }).filter(a => a.grupo_id)
    setAsignaciones(prev => [...prev, ...nuevas])
    setLetrasSel([])
    setMateriaId('')
  }

  const quitarAsignacionLocal = (idx) => {
    setAsignaciones(prev => prev.filter((_, i) => i !== idx))
  }

  const guardar = async () => {
    if (!nombre.trim() || !password.trim() || asignaciones.length === 0) return
    if (!sinCorreo && !email.trim()) return

    setGuardando(true)
    const emailsUsados = new Set(docentesExistentes.map(d => d.email))
    const emailFinal = sinCorreo ? generarEmailSintetico(nombre.trim(), emailsUsados) : email.trim()

    const { data, error } = await supabase.functions.invoke('admin-docentes', {
      body: {
        accion: 'crear',
        nombre: nombre.trim(),
        email: emailFinal,
        password: password.trim(),
        asignaciones: asignaciones.map(a => ({ grupo_id: a.grupo_id, materia_id: a.materia_id })),
      },
    })
    setGuardando(false)

    if (error || data?.error) {
      onCreado('Error al crear el docente: ' + (data?.error || error.message))
      return
    }

    onCreado(`Docente ${nombre.trim()} creado. Correo de acceso: ${emailFinal}`)
    setNombre(''); setEmail(''); setPassword(''); setAsignaciones([]); setSinCorreo(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Nombre completo del docente"
          value={nombre} onChange={e => setNombre(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Contraseña"
          value={password} onChange={e => setPassword(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
          <input type="checkbox" checked={sinCorreo} onChange={e => setSinCorreo(e.target.checked)} />
          Este docente no tiene correo (se le genera uno interno)
        </label>
        {!sinCorreo && (
          <input
            type="email"
            placeholder="Correo del docente"
            value={email} onChange={e => setEmail(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
          />
        )}
      </div>

      <div className="bg-slate-50 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-700 mb-2">Agregar asignación</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: '140px 1fr 1fr auto' }}>
          <select
            value={gradoId ?? ''} onChange={e => { setGradoId(Number(e.target.value)); setMateriaId('') }}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
          >
            {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <div className="flex gap-1">
            {LETRAS.map(l => (
              <button
                key={l} type="button" onClick={() => toggleLetra(l)}
                className={`w-9 h-9 rounded-lg text-sm font-bold border ${
                  letrasSel.includes(l) ? 'bg-emerald-800 text-white border-emerald-800' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >{l}</button>
            ))}
          </div>
          <select
            value={materiaId} onChange={e => setMateriaId(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Materia...</option>
            {materiasDisponibles.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <button
            type="button" onClick={addAsignacion}
            className="bg-emerald-800 text-white px-3 py-2 rounded-lg text-sm font-semibold"
          >
            Añadir
          </button>
        </div>
        {materiasDisponibles.length === 0 && (
          <p className="text-xs text-slate-400 mt-2">Este grado no tiene materias configuradas todavía.</p>
        )}
      </div>

      {asignaciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {asignaciones.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full">
              {a.label}
              <button onClick={() => quitarAsignacionLocal(i)} className="text-amber-600 hover:text-amber-900">×</button>
            </span>
          ))}
        </div>
      )}

      <div>
        <button
          onClick={guardar}
          disabled={guardando || !nombre.trim() || !password.trim() || asignaciones.length === 0 || (!sinCorreo && !email.trim())}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {guardando ? 'Creando...' : 'Guardar docente'}
        </button>
      </div>
    </div>
  )
}
