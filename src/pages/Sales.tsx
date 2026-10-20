import { useEffect, useRef, useState } from 'react'
import { Bike, Check, ChevronDown, LayoutGrid, MessageSquare, Minus, Plus, PlusCircle, Printer, Search, ShoppingBag, Store, Trash2, User, UtensilsCrossed, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { customerAddress, isExtraCategory, isSnackCategory, lineTotal, money, openOrderWhatsApp, orderTypeLabel, parseMoney, paymentLabel, round2 } from '../lib/format'
import { iconFor } from '../lib/icons'
import { ErrorNote, Modal, WhatsAppIcon } from '../components/ui'
import { PrintDialog } from '../components/Print'
import { WhatsAppImportModal } from '../components/WhatsAppImportModal'
import type { CartLine, Category, Customer, Order, OrderType, PaymentMethod, Product } from '../types'

type ItemPatch = Pick<CartLine, 'extraAmount' | 'extraNote' | 'extraIds' | 'note'>

// Linhas iguais (mesmo produto, acréscimos e observação) são somadas
const signature = (l: CartLine) => [l.product.id, [...l.extraIds].sort().join(','), l.note.trim()].join('|')
const merge = (lines: CartLine[]) =>
  lines.reduce<CartLine[]>((acc, l) => {
    const same = acc.find((x) => signature(x) === signature(l))
    if (same) same.quantity += l.quantity
    else acc.push({ ...l })
    return acc
  }, [])

export default function Sales() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState<string | undefined>(undefined)
  const [cart, setCart] = useState<CartLine[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [waModalOpen, setWaModalOpen] = useState(false)
  const [initialCheckoutData, setInitialCheckoutData] = useState<{
    type?: OrderType
    address?: string
    payment?: PaymentMethod | null
    received?: string
  } | null>(null)
  const [done, setDone] = useState<Order | null>(null)
  const [printing, setPrinting] = useState(false)
  const [editing, setEditing] = useState<{ line: CartLine; focus: 'extra' | 'note' } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('categories').select('*').order('sort_order').order('name'),
    ]).then(([p, c, cat]) => {
      if (p.error || c.error || cat.error) setError('Não foi possível carregar os dados. Verifique a conexão e se rodou o script 003 no Supabase.')
      setProducts((p.data ?? []) as Product[])
      setCustomers((c.data ?? []) as Customer[])
      setCategories((cat.data ?? []) as Category[])
      setLoading(false)
    })
  }, [])

  // Produtos da categoria "Acréscimo" aparecem só no botão de acréscimo
  const extrasCat = categories.find((c) => isExtraCategory(c.name))
  const extraProducts = extrasCat ? products.filter((p) => p.category_id === extrasCat.id) : []
  const saleProducts = products.filter((p) => !extrasCat || p.category_id !== extrasCat.id)
  const saleCategories = categories.filter((c) => c.id !== extrasCat?.id && saleProducts.some((p) => p.category_id === c.id))

  // Abre sempre em Lanches (ou na primeira categoria); "Todos" fica por último
  useEffect(() => {
    if (loading || selectedCat !== undefined) return
    const snack = saleCategories.find((c) => isSnackCategory(c.name))
    setSelectedCat(snack?.id ?? saleCategories[0]?.id ?? 'all')
  }, [loading, selectedCat, saleCategories])

  const q = search.trim().toLowerCase()
  const visible = saleProducts.filter((p) => {
    if (q) return p.name.toLowerCase().includes(q) // pesquisando, procura em todas as categorias
    return !selectedCat || selectedCat === 'all' || p.category_id === selectedCat
  })

  const total = round2(cart.reduce((s, l) => s + lineTotal(l), 0))
  const count = cart.reduce((s, l) => s + l.quantity, 0)
  const qtyOf = (id: string) => cart.filter((l) => l.product.id === id).reduce((s, l) => s + l.quantity, 0)

  const add = (product: Product) =>
    setCart((c) => merge([...c, { key: crypto.randomUUID(), product, quantity: 1, extraAmount: 0, extraNote: '', extraIds: [], note: '' }]))

  // Tira uma unidade do produto (primeiro da linha simples, sem acréscimo/observação)
  const decrement = (productId: string) =>
    setCart((c) => {
      const lines = c.filter((l) => l.product.id === productId)
      if (lines.length === 0) return c
      const target = lines.find((l) => l.extraIds.length === 0 && !l.note.trim()) ?? lines[lines.length - 1]
      return c.map((l) => (l.key === target.key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0)
    })

  const change = (key: string, d: number) =>
    setCart((c) => c.map((l) => (l.key === key ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0))
  const remove = (key: string) => setCart((c) => c.filter((l) => l.key !== key))

  // Aplica acréscimo/observação em n unidades da linha (se n < quantidade, separa a linha)
  function applyItem(key: string, n: number, patch: ItemPatch) {
    setCart((c) => {
      const line = c.find((l) => l.key === key)
      if (!line) return c
      if (n >= line.quantity) return merge(c.map((l) => (l.key === key ? { ...l, ...patch } : l)))
      return merge(c.flatMap((l) => (l.key === key
        ? [{ ...l, quantity: l.quantity - n }, { ...l, key: crypto.randomUUID(), quantity: n, ...patch }]
        : [l])))
    })
    setEditing(null)
  }

  function finish(order: Order) {
    setCheckout(false)
    setCart([])
    setCustomer(null)
    setCartOpen(false)
    setSearch('')
    setSelectedCat(undefined)
    setDone(order)
  }

  const chips = [
    ...saleCategories.map((c) => ({ id: c.id, name: c.name, Icon: iconFor(c.icon) })),
    { id: 'all', name: 'Todos', Icon: LayoutGrid },
  ]

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[1fr_400px] lg:pb-0">
      <section className="min-w-0 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field py-3.5 pl-11 text-base sm:text-lg" placeholder="Buscar produto" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn flex shrink-0 items-center gap-2 bg-[#25D366] px-3.5 py-3.5 font-bold text-white shadow-sm hover:bg-[#20ba5a]"
            onClick={() => setWaModalOpen(true)}
            title="Importar pedido colado do WhatsApp"
          >
            <WhatsAppIcon size={20} />
            <span className="hidden sm:inline">Venda WhatsApp</span>
          </button>
        </div>

        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Categorias">
          {chips.map(({ id, name, Icon }) => {
            const active = !q && selectedCat === id
            return (
              <button key={id} role="tab" aria-selected={active} title={name} aria-label={name} onClick={() => { setSelectedCat(id); setSearch('') }}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-xl px-3.5 font-semibold ${active ? 'bg-brand text-white' : 'border border-line bg-white hover:border-brand'}`}>
                <Icon size={24} />
                {active && <span>{name}</span>}
              </button>
            )
          })}
        </div>

        <ErrorNote message={error} />

        {loading ? <p className="text-muted">Carregando produtos...</p> : saleProducts.length === 0 ? (
          <div className="card px-6 py-10 text-center text-muted">Nenhum produto ativo. Cadastre produtos na aba Produtos para começar a vender.</div>
        ) : visible.length === 0 ? (
          <div className="card px-6 py-10 text-center text-muted">Nenhum produto encontrado.</div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const qty = qtyOf(p.id)
              return (
                <li key={p.id}>
                  <div className={`card flex h-full flex-col overflow-hidden ${qty ? 'border-brand ring-1 ring-brand' : ''}`}>
                    <button onClick={() => add(p)} aria-label={`Adicionar ${p.name}`} className="flex flex-1 flex-col text-left active:bg-brand-soft">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" loading="lazy" className="h-28 w-full object-cover" />
                      ) : (
                        <span className="grid h-28 w-full place-items-center bg-brand-soft text-brand"><UtensilsCrossed size={32} /></span>
                      )}
                      <span className="flex flex-1 flex-col gap-1 p-3">
                        <span className="line-clamp-2 font-semibold leading-snug">{p.name}</span>
                        <span className="mt-auto font-display text-xl font-bold text-brand-dark">{money(p.price)}</span>
                      </span>
                    </button>
                    {qty === 0 ? (
                      <button onClick={() => add(p)} className="flex items-center justify-center gap-2 bg-ink py-3 font-semibold text-white"><Plus size={18} /> Adicionar</button>
                    ) : (
                      <div className="flex items-center justify-between bg-ink px-2 py-1.5 text-white">
                        <button aria-label={`Tirar um ${p.name}`} onClick={() => decrement(p.id)} className="grid h-11 w-11 place-items-center rounded-lg bg-white/15 hover:bg-white/25"><Minus size={20} /></button>
                        <span className="text-lg font-bold" aria-live="polite">{qty}</span>
                        <button aria-label={`Adicionar mais um ${p.name}`} onClick={() => add(p)} className="grid h-11 w-11 place-items-center rounded-lg bg-brand hover:bg-brand-dark"><Plus size={20} /></button>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Carrinho: coluna fixa no computador, tela cheia no celular */}
      <aside className={`${cartOpen ? 'flex' : 'hidden'} fixed inset-0 z-40 flex-col bg-paper p-3 lg:static lg:z-auto lg:flex lg:max-h-[calc(100dvh-110px)] lg:bg-transparent lg:p-0`}>
        <div className="card flex min-h-0 flex-1 flex-col lg:sticky lg:top-[78px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-xl font-bold"><ShoppingBag size={22} /> Pedido</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg border border-[#25D366] bg-green-50 px-2 py-1.5 text-xs font-bold text-green-900 hover:bg-green-100"
                onClick={() => setWaModalOpen(true)}
                title="Colar mensagem do WhatsApp"
              >
                <WhatsAppIcon size={14} className="text-[#25D366]" /> Whats
              </button>
              {cart.length > 0 && <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => setCart([])}>Limpar</button>}
              <button className="rounded-lg p-2 hover:bg-paper lg:hidden" aria-label="Fechar pedido" onClick={() => setCartOpen(false)}><X size={22} /></button>
            </div>
          </div>

          <div className="border-b border-line p-3"><CustomerPicker customers={customers} value={customer} onChange={setCustomer} /></div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="px-6 py-10 text-center text-muted">Toque em um produto para adicionar ao pedido.</p>
            ) : (
              <ul className="divide-y divide-line">
                {cart.map((l) => {
                  const hasExtra = l.extraAmount > 0 || l.extraNote !== ''
                  return (
                    <li key={l.key} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold leading-snug">{l.product.name}</p>
                        <button className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-700" aria-label={`Remover ${l.product.name}`} onClick={() => remove(l.key)}><Trash2 size={18} /></button>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <button onClick={() => setEditing({ line: l, focus: 'extra' })}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold ${hasExtra ? 'bg-brand-soft text-brand-dark' : 'border border-dashed border-line text-muted hover:border-brand hover:text-brand-dark'}`}>
                          <PlusCircle size={16} className="shrink-0" />
                          {hasExtra ? `${l.extraNote || 'Acréscimo'}${l.extraAmount > 0 ? ` (+${money(l.extraAmount)} cada)` : ''}` : 'Acréscimo'}
                        </button>
                        <button onClick={() => setEditing({ line: l, focus: 'note' })}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold ${l.note ? 'bg-ink text-white' : 'border border-dashed border-line text-muted hover:border-brand hover:text-brand-dark'}`}>
                          <MessageSquare size={16} className="shrink-0" />
                          {l.note ? `Obs: ${l.note}` : 'Obs'}
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-white hover:bg-paper" aria-label="Diminuir quantidade" onClick={() => change(l.key, -1)}><Minus size={18} /></button>
                          <span className="w-10 text-center text-lg font-bold" aria-live="polite">{l.quantity}</span>
                          <button className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-white hover:bg-brand-dark" aria-label="Aumentar quantidade" onClick={() => change(l.key, 1)}><Plus size={18} /></button>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted">{money(round2(l.product.price + l.extraAmount))} cada</p>
                          <p className="font-display text-lg font-bold">{money(lineTotal(l))}</p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t border-line p-4">
            <p className="flex items-center justify-between text-lg font-semibold"><span>Total</span><span className="font-display text-3xl font-bold text-brand-dark">{money(total)}</span></p>
            <button className="btn-primary w-full py-4 text-lg" disabled={cart.length === 0} onClick={() => setCheckout(true)}>Finalizar pedido</button>
          </div>
        </div>
      </aside>

      {/* Barra do celular */}
      {!cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 lg:hidden">
          <button className="btn-primary w-full justify-between py-4 text-lg" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2"><ShoppingBag size={22} /> Ver pedido ({count})</span>
            <span className="font-display font-bold">{money(total)}</span>
          </button>
        </div>
      )}

      {editing && <ItemModal line={editing.line} focus={editing.focus} extraProducts={extraProducts} onClose={() => setEditing(null)} onSave={applyItem} />}

      {checkout && (
        <Checkout
          cart={cart}
          itemsTotal={total}
          customer={customer}
          initialType={initialCheckoutData?.type}
          initialAddress={initialCheckoutData?.address}
          initialPayment={initialCheckoutData?.payment}
          initialReceived={initialCheckoutData?.received}
          onClose={() => {
            setCheckout(false)
            setInitialCheckoutData(null)
          }}
          onDone={(order) => {
            setInitialCheckoutData(null)
            finish(order)
          }}
        />
      )}

      {waModalOpen && (
        <WhatsAppImportModal
          products={saleProducts}
          extraProducts={extraProducts}
          customers={customers}
          onClose={() => setWaModalOpen(false)}
          onApply={({
            cart: newCart,
            customer: pickedCustomer,
            customerName,
            customerPhone,
            orderType: pickedType,
            address: pickedAddress,
            payment: pickedPayment,
            received: pickedReceived,
            proceedToCheckout,
          }) => {
            if (pickedCustomer) {
              setCustomer(pickedCustomer)
            } else if (customerName && customerName !== 'Cliente avulso') {
              setCustomer({
                id: '',
                name: customerName,
                phone: customerPhone || null,
                address: pickedAddress || null,
                complement: null,
                reference: null,
              })
            }

            setCart(newCart)
            setInitialCheckoutData({
              type: pickedType,
              address: pickedAddress,
              payment: pickedPayment,
              received: pickedReceived,
            })
            setWaModalOpen(false)

            if (proceedToCheckout) {
              setCheckout(true)
            }
          }}
        />
      )}

      {done && (
        <Modal title="Venda concluída" onClose={() => { setPrinting(false); setDone(null) }}>
          <div className="space-y-4 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-700"><Check size={36} /></span>
            <p className="text-lg">Pedido <strong className="font-display text-3xl text-brand-dark">{done.order_number}</strong> registrado</p>
            <p className="text-muted">{money(done.total)} - {paymentLabel[done.payment_method]}{done.change_amount ? ` - troco ${money(done.change_amount)}` : ''}</p>
            <button
              type="button"
              className="btn w-full bg-[#25D366] py-4 text-lg text-white hover:bg-[#20ba5a]"
              onClick={() => openOrderWhatsApp(done)}
            >
              <WhatsAppIcon size={22} /> Enviar no WhatsApp
            </button>
            <button className="btn-dark w-full py-4 text-lg" onClick={() => setPrinting(true)}><Printer size={22} /> Imprimir pedido</button>
            <button className="btn-primary w-full py-4 text-lg" onClick={() => { setPrinting(false); setDone(null) }}>Nova venda</button>
          </div>
        </Modal>
      )}
      {done && printing && <PrintDialog order={done} onClose={() => setPrinting(false)} />}
    </div>
  )
}

const noteSuggestions = ['Sem cebola', 'Sem tomate', 'Sem salada', 'Molho à parte', 'Com gelo', 'Sem gelo']

function ItemModal({ line, focus, extraProducts, onClose, onSave }: {
  line: CartLine
  focus: 'extra' | 'note'
  extraProducts: Product[]
  onClose: () => void
  onSave: (key: string, n: number, patch: ItemPatch) => void
}) {
  const [note, setNote] = useState(line.note)
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    line.extraIds.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {}))
  const [n, setN] = useState(line.quantity)

  const chosen = extraProducts.filter((p) => (counts[p.id] ?? 0) > 0)
  const perUnit = round2(chosen.reduce((s, p) => s + p.price * counts[p.id], 0))
  const setCount = (id: string, d: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }))
  const addSuggestion = (t: string) => setNote((cur) => (cur.toLowerCase().includes(t.toLowerCase()) ? cur : cur.trim() ? `${cur.trim()}, ${t.toLowerCase()}` : t))

  function save() {
    onSave(line.key, n, {
      extraAmount: perUnit,
      extraNote: chosen.map((p) => `${counts[p.id] > 1 ? `${counts[p.id]}x ` : ''}${p.name}`).join(', '),
      extraIds: chosen.flatMap((p) => Array<string>(counts[p.id]).fill(p.id)),
      note: note.trim(),
    })
  }

  const noteSection = (
    <div key="note">
      <label className="label" htmlFor="i-note">Observação</label>
      <input id="i-note" className="field" placeholder="Ex.: não colocar cebola" value={note} onChange={(e) => setNote(e.target.value)} autoFocus={focus === 'note'} />
      <div className="mt-2 flex flex-wrap gap-2">
        {noteSuggestions.map((t) => (
          <button key={t} type="button" onClick={() => addSuggestion(t)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold hover:border-brand">{t}</button>
        ))}
      </div>
    </div>
  )

  const extraSection = (
    <div key="extra">
      <span className="label">Acréscimos</span>
      {extraProducts.length === 0 ? (
        <p className="rounded-lg bg-paper px-3 py-3 text-sm text-muted">Nenhum acréscimo cadastrado. Cadastre produtos na categoria "Acréscimo" para eles aparecerem aqui.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {extraProducts.map((p) => {
            const c = counts[p.id] ?? 0
            return (
              <li key={p.id} className={`flex items-center gap-2 px-3 py-2 ${c ? 'bg-brand-soft' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="text-sm text-muted">+ {money(p.price)}</span>
                </span>
                {c > 0 && (
                  <>
                    <button className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-white hover:bg-paper" aria-label={`Tirar ${p.name}`} onClick={() => setCount(p.id, -1)}><Minus size={18} /></button>
                    <span className="w-6 text-center text-lg font-bold">{c}</span>
                  </>
                )}
                <button className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-white hover:bg-brand-dark" aria-label={`Adicionar ${p.name}`} onClick={() => setCount(p.id, 1)}><Plus size={18} /></button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <Modal title={line.product.name} onClose={onClose}>
      <div className="space-y-5">
        {focus === 'extra' ? [extraSection, noteSection] : [noteSection, extraSection]}
        {line.quantity > 1 && (
          <div>
            <span className="label">Aplicar em quantas unidades?</span>
            <div className="flex items-center gap-1">
              <button className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-white hover:bg-paper" aria-label="Menos" onClick={() => setN((v) => Math.max(1, v - 1))}><Minus size={18} /></button>
              <span className="w-20 text-center text-lg font-bold">{n} de {line.quantity}</span>
              <button className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-white hover:bg-paper" aria-label="Mais" onClick={() => setN((v) => Math.min(line.quantity, v + 1))}><Plus size={18} /></button>
            </div>
          </div>
        )}
        {perUnit > 0 && <p className="rounded-lg bg-brand-soft px-3 py-2 font-semibold text-brand-dark">Acréscimo: + {money(perUnit)} por unidade</p>}
        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1" onClick={save}>Salvar</button>
        </div>
      </div>
    </Modal>
  )
}

function CustomerPicker({ customers, value, onChange }: { customers: Customer[]; value: Customer | null; onChange: (c: Customer | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const list = customers.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)

  const pick = (c: Customer | null) => { onChange(c); setOpen(false); setQ('') }

  return (
    <div>
      <button className="field flex items-center justify-between text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 truncate"><User size={18} className="shrink-0 text-muted" /> {value ? value.name : 'Cliente avulso'}</span>
        <ChevronDown size={18} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-line bg-white">
          <input className="field rounded-b-none border-0 border-b" placeholder="Buscar cliente" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <ul className="max-h-56 overflow-y-auto">
            <li><button className="w-full px-3 py-3 text-left font-semibold hover:bg-paper" onClick={() => pick(null)}>Cliente avulso</button></li>
            {list.map((c) => (
              <li key={c.id}><button className="w-full px-3 py-3 text-left hover:bg-paper" onClick={() => pick(c)}>{c.name}{c.phone && <span className="text-sm text-muted"> - {c.phone}</span>}</button></li>
            ))}
            {list.length === 0 && q && <li className="px-3 py-3 text-sm text-muted">Nenhum cliente encontrado.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

const payments: PaymentMethod[] = ['pix', 'dinheiro', 'debito', 'credito']

function Checkout({
  cart,
  itemsTotal,
  customer,
  initialType,
  initialAddress,
  initialPayment,
  initialReceived,
  onClose,
  onDone,
}: {
  cart: CartLine[]
  itemsTotal: number
  customer: Customer | null
  initialType?: OrderType
  initialAddress?: string
  initialPayment?: PaymentMethod | null
  initialReceived?: string
  onClose: () => void
  onDone: (o: Order) => void
}) {
  const registeredAddress = customer ? customerAddress(customer) : ''
  const [type, setType] = useState<OrderType>(initialType ?? 'retirada')
  const [address, setAddress] = useState(initialAddress || registeredAddress)
  const [fee, setFee] = useState('')
  const [payment, setPayment] = useState<PaymentMethod | null>(initialPayment ?? null)
  const [received, setReceived] = useState(initialReceived ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Mesma chave em toda tentativa: se clicar duas vezes ou tentar de novo, o banco não duplica o pedido
  const clientKey = useRef(crypto.randomUUID())
  const lock = useRef(false)

  const delivery = type === 'entrega'
  const feeParsed = delivery && fee.trim() !== '' ? parseMoney(fee) : 0
  const feeInvalid = feeParsed === null
  const feeValue = feeParsed ?? 0
  const total = round2(itemsTotal + feeValue)

  const receivedValue = parseMoney(received)
  const cash = payment === 'dinheiro'
  const receivedInvalid = cash && received.trim() !== '' && (receivedValue === null || receivedValue < total)
  const changeValue = cash && receivedValue !== null && receivedValue >= total ? round2(receivedValue - total) : null

  async function confirm() {
    if (lock.current) return
    if (!payment) return setError('Escolha a forma de pagamento.')
    if (delivery && !address.trim()) return setError('Informe o endereço completo para a entrega.')
    if (feeInvalid) return setError('Informe um valor válido para a taxa de entrega, por exemplo 6,00.')
    if (receivedInvalid) return setError('O valor recebido precisa ser igual ou maior que o total.')

    lock.current = true
    setBusy(true)
    setError(null)

    // Se o cliente tem nome e telefone mas ainda não existe no banco, cria o registro
    let customerId = customer?.id || null
    if (!customerId && customer?.name && customer.name !== 'Cliente avulso') {
      try {
        const { data: newCust } = await supabase
          .from('customers')
          .insert({
            name: customer.name.trim(),
            phone: customer.phone ? customer.phone.trim() : null,
            address: delivery ? address.trim() : null,
          })
          .select('id')
          .single()
        if (newCust?.id) customerId = newCust.id
      } catch {
        // Ignora se der erro de inserção e segue com cliente avulso
      }
    }

    const { data, error } = await supabase.rpc('create_order', {
      p_client_key: clientKey.current,
      p_customer_id: customerId,
      p_order_type: type,
      p_address: delivery ? address.trim() : null,
      p_payment: payment,
      p_received: cash ? receivedValue : null,
      p_delivery_fee: delivery ? feeValue : 0,
      p_items: cart.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        extra_amount: l.extraAmount,
        extra_note: l.extraNote || null,
        note: l.note.trim() || null,
      })),
    })
    if (error || !data) {
      setError(error?.message || 'Não foi possível salvar o pedido. Tente novamente.')
      lock.current = false
      setBusy(false)
      return
    }
    // Busca o pedido completo (com itens) para a impressão
    const full = await supabase.from('orders').select('*, order_items(*)').eq('id', (data as Order).id).single()
    onDone((full.data ?? data) as Order)
  }

  return (
    <Modal title="Finalizar pedido" onClose={() => !busy && onClose()} wide>
      <div className="space-y-5">
        <div>
          <span className="label">Tipo de pedido</span>
          <div className="grid grid-cols-2 gap-3">
            {([['retirada', Store], ['entrega', Bike]] as const).map(([t, Icon]) => (
              <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
                className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-4 font-semibold ${type === t ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white hover:border-brand'}`}>
                <Icon size={22} /> {t === 'retirada' ? 'Retirada' : 'Entrega'}
              </button>
            ))}
          </div>
        </div>

        {delivery && (
          <>
            <div>
              <label className="label" htmlFor="addr">Endereço de entrega *</label>
              <textarea id="addr" rows={3} className="field" placeholder="Rua, número, bairro, complemento, referência" value={address} onChange={(e) => setAddress(e.target.value)} />
              {registeredAddress && address !== registeredAddress && (
                <button className="mt-1 text-sm font-semibold text-brand-dark underline" onClick={() => setAddress(registeredAddress)}>Usar endereço do cadastro</button>
              )}
            </div>
            <div>
              <label className="label" htmlFor="fee">Taxa de entrega (R$)</label>
              <input id="fee" className="field" inputMode="decimal" placeholder="0,00" value={fee} onChange={(e) => setFee(e.target.value)} />
              {feeInvalid && <p className="mt-1 text-sm text-red-700">Valor inválido. Use, por exemplo, 6,00.</p>}
            </div>
          </>
        )}

        <div>
          <span className="label">Forma de pagamento *</span>
          <div className="grid grid-cols-2 gap-3">
            {payments.map((p) => (
              <button key={p} onClick={() => setPayment(p)} aria-pressed={payment === p}
                className={`rounded-lg border-2 px-3 py-4 font-semibold ${payment === p ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white hover:border-brand'}`}>
                {paymentLabel[p]}
              </button>
            ))}
          </div>
        </div>

        {cash && (
          <div>
            <label className="label" htmlFor="recv">Valor recebido (opcional)</label>
            <input id="recv" className="field" inputMode="decimal" placeholder="0,00" value={received} onChange={(e) => setReceived(e.target.value)} />
            {receivedInvalid && <p className="mt-1 text-sm text-red-700">O valor recebido é menor que o total.</p>}
            {changeValue !== null && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-lg font-bold text-green-800">Troco: {money(changeValue)}</p>}
          </div>
        )}

        <div className="rounded-xl border border-line bg-paper p-4">
          <h3 className="mb-2 text-lg font-bold">Resumo</h3>
          <dl className="space-y-1.5 text-sm">
            <Line label="Pedido" value="número gerado ao confirmar" />
            <Line label="Cliente" value={customer?.name ?? 'Cliente avulso'} />
            <Line label="Tipo" value={orderTypeLabel[type]} />
            {delivery && <Line label="Endereço" value={address.trim() || 'não informado'} />}
            <Line label="Pagamento" value={payment ? paymentLabel[payment] : 'não informado'} />
            {cash && receivedValue !== null && !receivedInvalid && <Line label="Recebido" value={money(receivedValue)} />}
            {changeValue !== null && <Line label="Troco" value={money(changeValue)} />}
          </dl>
          <ul className="my-3 divide-y divide-line border-y border-line">
            {cart.map((l) => (
              <li key={l.key} className="flex justify-between gap-3 py-1.5 text-sm">
                <span>
                  {l.quantity}x {l.product.name}
                  {(l.extraAmount > 0 || l.extraNote) && <span className="block text-brand-dark">+ Acréscimo{l.extraNote ? ` (${l.extraNote})` : ''}{l.extraAmount > 0 ? ` ${money(l.extraAmount)} cada` : ''}</span>}
                  {l.note && <span className="block">Obs: {l.note}</span>}
                </span>
                <span className="font-semibold">{money(lineTotal(l))}</span>
              </li>
            ))}
          </ul>
          {delivery && feeValue > 0 && (
            <div className="mb-1 space-y-1 text-sm">
              <p className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-semibold">{money(itemsTotal)}</span></p>
              <p className="flex justify-between"><span className="text-muted">Taxa de entrega</span><span className="font-semibold">{money(feeValue)}</span></p>
            </div>
          )}
          <p className="flex items-center justify-between font-bold"><span>Total</span><span className="font-display text-2xl text-brand-dark">{money(total)}</span></p>
        </div>

        <ErrorNote message={error} />
        <div className="flex gap-3">
          <button className="btn-ghost flex-1 py-4" onClick={onClose} disabled={busy}>Voltar</button>
          <button className="btn-primary flex-[2] py-4 text-lg" onClick={confirm} disabled={busy}>{busy ? 'Salvando...' : 'Confirmar pedido'}</button>
        </div>
      </div>
    </Modal>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4"><dt className="text-muted">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>
  )
}
