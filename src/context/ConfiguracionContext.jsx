import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CACHE_KEY = 'sa_config_cache'
const ConfiguracionContext = createContext(null)

function leerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function guardarCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch {}
}

export function ConfiguracionProvider({ children }) {
  const [config, setConfig] = useState(leerCache)
  const [loading, setLoading] = useState(!leerCache())

  const cargar = async () => {
    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .eq('id', 1)
      .single()
    if (!error && data) {
      setConfig(data)
      guardarCache(data)
    }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  return (
    <ConfiguracionContext.Provider value={{ config, loading, recargar: cargar }}>
      {children}
    </ConfiguracionContext.Provider>
  )
}

export function useConfiguracion() {
  return useContext(ConfiguracionContext)
}
