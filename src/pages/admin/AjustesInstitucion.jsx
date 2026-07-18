import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useConfiguracion } from '../../context/ConfiguracionContext'

export default function AjustesInstitucion() {
  const { config, recargar } = useConfiguracion()
  const [nombre, setNombre] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (config) setNombre(config.nombre_institucion)
  }, [config])

  const guardarNombre = async () => {
    setGuardando(true)
    setMensaje('')
    const { error } = await supabase
      .from('configuracion')
      .update({ nombre_institucion: nombre, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setGuardando(false)
    if (error) { setMensaje('Error al guardar: ' + error.message); return }
    setMensaje('Nombre actualizado correctamente.')
    recargar()
  }

  const subirLogo = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setSubiendo(true)
    setMensaje('')

    const ext = file.name.split('.').pop()
    const path = `institucion-logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setSubiendo(false)
      setMensaje('Error al subir el logo: ' + uploadError.message)
      return
    }

    const { data: publicData } = supabase.storage.from('logos').getPublicUrl(path)
    const logoUrlConCache = `${publicData.publicUrl}?t=${Date.now()}`

    const { error: updateError } = await supabase
      .from('configuracion')
      .update({ logo_url: logoUrlConCache, updated_at: new Date().toISOString() })
      .eq('id', 1)

    setSubiendo(false)
    if (updateError) { setMensaje('Error al guardar el logo: ' + updateError.message); return }
    setMensaje('Logo actualizado correctamente.')
    recargar()
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-xl">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Datos de la institución</h2>

      <label className="text-sm font-semibold text-slate-700 mb-1 block">
        Nombre de la institución
      </label>
      <div className="flex gap-2 mb-6">
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
        />
        <button
          onClick={guardarNombre}
          disabled={guardando}
          className="bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <label className="text-sm font-semibold text-slate-700 mb-1 block">
        Logo de la institución
      </label>
      <div className="flex items-center gap-4">
        {config?.logo_url && (
          <img src={config.logo_url} alt="Logo actual" className="h-16 w-16 rounded-full object-cover border border-slate-200" />
        )}

        <label className="cursor-pointer bg-white border border-slate-300 hover:border-emerald-700 hover:bg-emerald-50 transition text-sm font-semibold text-slate-700 px-4 py-2 rounded-lg">
          {subiendo ? 'Subiendo...' : 'Seleccionar archivo'}
          <input
            type="file"
            accept="image/*"
            onChange={subirLogo}
            disabled={subiendo}
            className="hidden"
          />
        </label>
      </div>

      {mensaje && <p className="text-sm text-slate-600 mt-4">{mensaje}</p>}
    </div>
  )
}