import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { categoryIcons, iconFor } from '../lib/icons'
import { ErrorNote, Modal } from './ui'
import type { Category } from '../types'

export function CategoriesManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Category[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<Category> | null>(null)

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('products').select('category_id'),
    ])
    if (c.error) return setError('Não foi possível carregar as categorias.')
    setItems(c.data as Category[])
    const n: Record<string, number> = {}
    ;(p.data ?? []).forEach((r: { category_id: string | null }) => { if (r.category_id) n[r.category_id] = (n[r.category_id] ?? 0) + 1 })
    setCounts(n)
  }, [])
  useEffect(() => { load() }, [load])

  const changed = () => { load(); onChanged() }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[index], next[j]] = [next[j], next[index]]
    const updates = next.map((c, i) => ({ c, i })).filter(({ c, i }) => c.sort_order !== i)
    const results = await Promise.all(updates.map(({ c, i }) => supabase.from('categories').update({ sort_order: i }).eq('id', c.id)))
    if (results.some((r) => r.error)) setError('Não foi possível mudar a ordem.')
    else changed()
  }

  async function remove(c: Category) {
    const n = counts[c.id] ?? 0
    const msg = n > 0
      ? `Excluir a categoria "${c.name}"? Os ${n} produtos dela ficarão sem categoria.`
      : `Excluir a categoria "${c.name}"?`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) setError('Não foi possível excluir a categoria.')
    else changed()
  }

  return (
    <Modal title="Categorias" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">A ordem aqui é a ordem dos ícones na tela de vendas. Acréscimos ficam na categoria "Acréscimo" e aparecem só no botão de acréscimo.</p>
        <ErrorNote message={error} />
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.length === 0 && <li className="px-4 py-6 text-center text-muted">Nenhuma categoria ainda.</li>}
          {items.map((c, i) => {
            const Icon = iconFor(c.icon)
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-dark"><Icon size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="text-xs text-muted">{counts[c.id] ?? 0} produtos</span>
                </span>
                <button className="rounded-lg p-2 hover:bg-paper disabled:opacity-30" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} /></button>
                <button className="rounded-lg p-2 hover:bg-paper disabled:opacity-30" aria-label="Descer" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} /></button>
                <button className="rounded-lg p-2 hover:bg-paper" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}><Pencil size={18} /></button>
                <button className="rounded-lg p-2 text-red-700 hover:bg-red-50" aria-label={`Excluir ${c.name}`} onClick={() => remove(c)}><Trash2 size={18} /></button>
              </li>
            )
          })}
        </ul>
        <button className="btn-primary w-full" onClick={() => setEditing({ name: '', icon: 'utensils', sort_order: items.length })}><Plus size={20} /> Nova categoria</button>
      </div>
      {editing && <CategoryForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed() }} />}
    </Modal>
  )
}

function CategoryForm({ initial, onClose, onSaved }: { initial: Partial<Category>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial.name ?? '')
  const [icon, setIcon] = useState(initial.icon ?? 'utensils')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Informe o nome da categoria.')
    setBusy(true)
    setError(null)
    const row = { name: name.trim(), icon }
    const { error } = initial.id
      ? await supabase.from('categories').update(row).eq('id', initial.id)
      : await supabase.from('categories').insert({ ...row, sort_order: initial.sort_order ?? 0 })
    setBusy(false)
    if (error) setError(error.code === '23505' ? 'Já existe uma categoria com esse nome.' : 'Não foi possível salvar a categoria.')
    else onSaved()
  }

  return (
    <Modal title={initial.id ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="cat-name">Nome *</label>
          <input id="cat-name" className="field" placeholder="Lanches, Bebidas, Porções..." value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <span className="label">Ícone</span>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {categoryIcons.map(({ key, label, Icon }) => (
              <button type="button" key={key} title={label} aria-label={label} aria-pressed={icon === key} onClick={() => setIcon(key)}
                className={`grid h-12 place-items-center rounded-lg border-2 ${icon === key ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white hover:border-brand'}`}>
                <Icon size={24} />
              </button>
            ))}
          </div>
        </div>
        <ErrorNote message={error} />
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Salvando...' : 'Salvar categoria'}</button>
        </div>
      </form>
    </Modal>
  )
}
