import Header from './Header'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      <main className="max-w-6xl mx-auto px-5 py-6">
        {children}
      </main>
    </div>
  )
}