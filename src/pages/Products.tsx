import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ImagePlus, Pencil, Plus, Power, Search, Tags } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { money, parseMoney } from '../lib/format'
import { Empty, ErrorNote, Modal } from '../components/ui'
import { CategoriesManager } from '../components/Categories'
import type { Category, Product } from '../types'

type Draft = {
  id?: string
  name: string
  categoryId: string
  price: string
  description: string
  image_url: string | null
  active: boolean
}

const blank: Draft = { name: '', categoryId: '', price: '', description: '', image_url: null, active: true }

export default function Products() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [managingCats, setManagingCats] = useState(false)

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order').order('name'),
    ])
    if (p.error || c.error) setError('Não foi possível carregar os produtos. Confirme se rodou o script 003 no Supabase.')
    else { setError(null); setItems(p.data as Product[]); setCategories(c.data as Category[]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''

  const filtered = items.filter((p) => {
    if (!showInactive && !p.active) return false
    const q = search.trim().toLowerCase()
    return !q || p.name.toLowerCase().includes(q) || catName(p.category_id).toLowerCase().includes(q)
  })

  async function toggleActive(p: Product) {
    const { error } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    if (error) setError('Não foi possível alterar o status.')
    else load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Produtos</h1>
        <button className="btn-ghost" onClick={() => setManagingCats(true)}><Tags size={20} /> Categorias</button>
        <button className="btn-primary" onClick={() => setDraft({ ...blank })}><Plus size={20} /> Novo produto</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder="Pesquisar por nome ou categoria" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      <ErrorNote message={error} />

      {loading ? (
        <p className="text-muted">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Empty>{items.length === 0 ? 'Nenhum produto ainda. Toque em "Novo produto" para cadastrar o primeiro.' : 'Nenhum produto encontrado.'}</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <li key={p.id} className={`card flex items-center gap-3 p-3 ${p.active ? '' : 'opacity-60'}`}>
              {p.image_url ? (
                <img src={p.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-lg bg-brand-soft text-brand"><ImagePlus size={22} /></span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-sm text-muted">{catName(p.category_id) || 'Sem categoria'}{!p.active && ' - inativo'}</p>
                <p className="font-display font-bold text-brand-dark">{money(p.price)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <button className="rounded-lg p-2 hover:bg-paper" aria-label={`Editar ${p.name}`} onClick={() => setDraft({
                  id: p.id, name: p.name, categoryId: p.category_id ?? '', price: String(p.price).replace('.', ','),
                  description: p.description ?? '', image_url: p.image_url, active: p.active,
                })}><Pencil size={20} /></button>
                <button className="rounded-lg p-2 hover:bg-paper" aria-label={p.active ? `Desativar ${p.name}` : `Ativar ${p.name}`} title={p.active ? 'Desativar' : 'Ativar'} onClick={() => toggleActive(p)}>
                  <Power size={20} className={p.active ? 'text-green-600' : 'text-muted'} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {managingCats && <CategoriesManager onClose={() => setManagingCats(false)} onChanged={load} />}
      {draft && <ProductForm draft={draft} categories={categories} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load() }} />}
    </div>
  )
}

function ProductForm({ draft, categories, onClose, onSaved }: { draft: Draft; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(draft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((s) => ({ ...s, [k]: v }))

  async function upload(file: File) {
    if (!file.type.startsWith('image/')) return setError('Escolha um arquivo de imagem.')
    if (file.size > 3 * 1024 * 1024) return setError('A imagem deve ter no máximo 3 MB.')
    setBusy(true)
    setError(null)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type })
    if (error) setError('Não foi possível enviar a imagem.')
    else set('image_url', supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl)
    setBusy(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const price = parseMoney(f.price)
    if (!f.name.trim()) return setError('Informe o nome do produto.')
    if (price === null) return setError('Informe um preço válido, por exemplo 12,50.')
    setBusy(true)
    setError(null)
    const row = {
      name: f.name.trim(),
      category_id: f.categoryId || null,
      price,
      description: f.description.trim() || null,
      image_url: f.image_url,
      active: f.active,
    }
    const { error } = f.id
      ? await supabase.from('products').update(row).eq('id', f.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) setError('Não foi possível salvar o produto.')
    else onSaved()
  }

  return (
    <Modal title={f.id ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="p-name">Nome *</label>
          <input id="p-name" className="field" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-cat">Categoria</label>
            <select id="p-cat" className="field" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Sem categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="p-price">Preço de venda (R$) *</label>
            <input id="p-price" className="field" inputMode="decimal" placeholder="0,00" value={f.price} onChange={(e) => set('price', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-desc">Descrição</label>
          <textarea id="p-desc" rows={2} className="field" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <span className="label">Imagem</span>
          <div className="flex items-center gap-3">
            {f.image_url ? <img src={f.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-paper text-muted"><ImagePlus /></span>}
            <label className="btn-ghost cursor-pointer">
              Escolher imagem
              <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {f.image_url && <button type="button" className="text-sm font-semibold text-red-700" onClick={() => set('image_url', null)}>Remover</button>}
          </div>
        </div>
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" className="h-5 w-5 accent-brand" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          Produto ativo (aparece na tela de vendas)
        </label>
        <ErrorNote message={error} />
        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Salvando...' : 'Salvar produto'}</button>
        </div>
      </form>
    </Modal>
  )
}
