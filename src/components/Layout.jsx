import Header from './Header'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-5 py-5 sm:py-6">
        {children}
      </main>
    </div>
  )
}
