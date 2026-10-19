import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ClipboardList, LogOut, ShoppingBag, Store, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { isConfigured, supabase } from './lib/supabase'
import Login from './pages/Login'
import Sales from './pages/Sales'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Orders from './pages/Orders'
import { BRAND, CREDIT } from './lib/format'

type Tab = 'vendas' | 'pedidos' | 'produtos' | 'clientes'

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'vendas', label: 'Vender', icon: ShoppingBag },
  { id: 'pedidos', label: 'Pedidos', icon: ClipboardList },
  { id: 'produtos', label: 'Produtos', icon: Store },
  { id: 'clientes', label: 'Clientes', icon: Users },
]

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('vendas')

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card space-y-2 p-6">
          <h1 className="text-xl font-bold">Falta configurar o Supabase</h1>
          <p>Crie o arquivo <code className="rounded bg-paper px-1">.env</code> a partir do <code className="rounded bg-paper px-1">.env.example</code> e preencha <code className="rounded bg-paper px-1">VITE_SUPABASE_URL</code> e <code className="rounded bg-paper px-1">VITE_SUPABASE_ANON_KEY</code>. Depois reinicie o <code className="rounded bg-paper px-1">npm run dev</code>.</p>
        </div>
      </div>
    )
  }

  if (!ready) return <div className="grid min-h-dvh place-items-center text-muted">Carregando...</div>
  if (!session) return <Login />

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-3 py-2 sm:px-5">
          <span className="hidden items-center gap-2 sm:flex">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white"><UtensilsCrossed size={20} /></span>
            <span className="font-display text-lg font-bold">{BRAND}</span>
          </span>
          <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label="Menu principal">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-base font-semibold ${tab === id ? 'bg-ink text-white' : 'text-ink hover:bg-paper'}`}
              >
                <Icon size={20} /> {label}
              </button>
            ))}
          </nav>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg p-2.5 text-muted hover:bg-paper" aria-label="Sair" title="Sair">
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] flex-1 p-3 sm:p-5">
        {tab === 'vendas' && <Sales />}
        {tab === 'pedidos' && <Orders />}
        {tab === 'produtos' && <Products />}
        {tab === 'clientes' && <Customers />}
      </main>
      <footer className="px-3 pb-3 text-center text-xs text-muted print:hidden">{CREDIT}</footer>
    </div>
  )
}
