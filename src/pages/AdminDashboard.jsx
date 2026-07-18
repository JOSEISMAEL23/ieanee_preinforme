import Layout from '../components/Layout'
import AjustesInstitucion from './admin/AjustesInstitucion'

export default function AdminDashboard() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Panel de administración</h1>
      <AjustesInstitucion />
    </Layout>
  )
}