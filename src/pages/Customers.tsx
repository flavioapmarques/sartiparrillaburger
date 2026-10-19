import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MapPin, Pencil, Phone, Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Empty, ErrorNote, Modal } from '../components/ui'
import type { Customer } from '../types'

type Draft = { id?: string; name: string; phone: string; address: string; complement: string; reference: string }
const blank: Draft = { name: '', phone: '', address: '', complement: '', reference: '' }

export default function Customers() {
  const [items, setItems] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('customers').select('*').order('name')
    if (error) setError('Não foi possível carregar os clientes.')
    else setItems(data as Customer[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const filtered = items.filter((c) => {
    if (!q) return true
    const phone = c.phone ?? ''
    return c.name.toLowerCase().includes(q) || phone.includes(q) || (digits !== '' && phone.replace(/\D/g, '').includes(digits))
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Clientes</h1>
        <button className="btn-primary" onClick={() => setDraft({ ...blank })}><Plus size={20} /> Novo cliente</button>
      </div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-10" placeholder="Pesquisar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ErrorNote message={error} />
      {loading ? <p className="text-muted">Carregando...</p> : filtered.length === 0 ? (
        <Empty>{items.length === 0 ? 'Nenhum cliente cadastrado ainda.' : 'Nenhum cliente encontrado.'}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <li key={c.id} className="card flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-lg font-semibold">{c.name}</p>
                {c.phone && <p className="flex items-center gap-2 text-sm text-muted"><Phone size={15} /> {c.phone}</p>}
                {c.address && <p className="flex items-start gap-2 text-sm text-muted"><MapPin size={15} className="mt-0.5 shrink-0" /> <span>{c.address}{c.complement ? `, ${c.complement}` : ''}</span></p>}
              </div>
              <button className="rounded-lg p-2 hover:bg-paper" aria-label={`Editar ${c.name}`} onClick={() => setDraft({
                id: c.id, name: c.name, phone: c.phone ?? '', address: c.address ?? '', complement: c.complement ?? '', reference: c.reference ?? '',
              })}><Pencil size={20} /></button>
            </li>
          ))}
        </ul>
      )}
      {draft && <CustomerForm draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load() }} />}
    </div>
  )
}

function CustomerForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Draft, v: string) => setF((s) => ({ ...s, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.name.trim()) return setError('Informe o nome do cliente.')
    setBusy(true)
    setError(null)
    const row = {
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      address: f.address.trim() || null,
      complement: f.complement.trim() || null,
      reference: f.reference.trim() || null,
    }
    const { error } = f.id
      ? await supabase.from('customers').update(row).eq('id', f.id)
      : await supabase.from('customers').insert(row)
    setBusy(false)
    if (error) setError('Não foi possível salvar o cliente.')
    else onSaved()
  }

  return (
    <Modal title={f.id ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="c-name">Nome *</label>
          <input id="c-name" className="field" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="c-phone">Telefone / WhatsApp</label>
          <input id="c-phone" className="field" type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="c-addr">Endereço</label>
          <input id="c-addr" className="field" placeholder="Rua, número, bairro, cidade" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-comp">Complemento</label>
            <input id="c-comp" className="field" placeholder="Apto, bloco..." value={f.complement} onChange={(e) => set('complement', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="c-ref">Referência</label>
            <input id="c-ref" className="field" placeholder="Próximo a..." value={f.reference} onChange={(e) => set('reference', e.target.value)} />
          </div>
        </div>
        <ErrorNote message={error} />
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Salvando...' : 'Salvar cliente'}</button>
        </div>
      </form>
    </Modal>
  )
}
