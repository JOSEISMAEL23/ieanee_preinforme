import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'

export default function DocenteDashboard() {
  const { docente } = useAuth()

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-800">Hola, {docente?.nombre}</h1>
      <p className="text-slate-600 mt-1">Aquí marcarás tus estudiantes en dificultad.</p>
    </Layout>
  )
}