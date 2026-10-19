import { useState, type FormEvent } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ErrorNote } from '../components/ui'
import { BRAND, CREDIT } from '../lib/format'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-mail ou senha incorretos.')
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand text-white">
            <UtensilsCrossed size={26} />
          </span>
          <div>
            <h1 className="text-2xl font-bold leading-tight">{BRAND}</h1>
            <p className="text-sm text-muted">Entre para começar a vender</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" type="email" required autoComplete="username" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" type="password" required autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorNote message={error} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
        <p className="text-center text-xs text-muted">{CREDIT}</p>
      </form>
    </div>
  )
}
