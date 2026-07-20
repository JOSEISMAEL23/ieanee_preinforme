import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [docente, setDocente] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadDocente = async (userId) => {
    if (!userId) { setDocente(null); return }
    const { data, error } = await supabase
      .from('docentes')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error) { console.error(error); setDocente(null) }
    else setDocente(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      await loadDocente(session?.user?.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      await loadDocente(session?.user?.id)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setDocente(null)
  }

  const recargarDocente = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    await loadDocente(session?.user?.id)
  }

  return (
    <AuthContext.Provider value={{ session, docente, loading, signIn, signOut, recargarDocente }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
