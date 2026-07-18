import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ConfiguracionContext = createContext(null)

export function ConfiguracionProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)

  const cargar = async () => {
    const { data, error } = await supabase
      .from('configuracion')
      .select('*')
      .eq('id', 1)
      .single()
    if (!error) setConfig(data)
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