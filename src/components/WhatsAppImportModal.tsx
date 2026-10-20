import { useState } from 'react'
import {
  AlertCircle,
  Bike,
  ClipboardPaste,
  Edit2,
  MessageSquare,
  Minus,
  Plus,
  PlusCircle,
  Store,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { money, paymentLabel, round2 } from '../lib/format'
import { Modal, WhatsAppIcon } from './ui'
import { parseWhatsAppOrder, type ParsedItem } from '../lib/whatsappParser'
import type { CartLine, Customer, OrderType, PaymentMethod, Product } from '../types'

const payments: PaymentMethod[] = ['pix', 'dinheiro', 'debito', 'credito']

const noteSuggestions = [
  'Sem cebola',
  'Sem tomate',
  'Sem salada',
  'Sem maionese',
  'Sem molho',
  'Ao ponto',
  'Bem passado',
  'Mal passado',
  'Molho à parte',
  'Com gelo',
  'Sem gelo',
  'Limão e gelo',
]

export function WhatsAppImportModal({
  products,
  extraProducts,
  customers,
  onClose,
  onApply,
}: {
  products: Product[]
  extraProducts: Product[]
  customers: Customer[]
  onClose: () => void
  onApply: (data: {
    cart: CartLine[]
    customer: Customer | null
    customerName: string
    customerPhone: string
    orderType: OrderType
    address: string
    payment: PaymentMethod
    received: string
    proceedToCheckout: boolean
  }) => void
}) {
  const [text, setText] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderType, setOrderType] = useState<OrderType>('retirada')
  const [address, setAddress] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('pix')
  const [received, setReceived] = useState('')
  const [items, setItems] = useState<ParsedItem[]>([])
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [parsedOnce, setParsedOnce] = useState(false)

  const [addingProduct, setAddingProduct] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')

  // Estado para editar observações e acréscimos de um item
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null)
  const [editingFocus, setEditingFocus] = useState<'extra' | 'note'>('note')

  const handlePasteClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText()
      if (clipText) {
        setText(clipText)
        runParse(clipText)
      }
    } catch {
      // Se o navegador bloquear leitura direta, o usuário cola no campo
    }
  }

  const runParse = (sourceText: string) => {
    if (!sourceText.trim()) return
    const result = parseWhatsAppOrder(sourceText, products, extraProducts, customers)
    setItems(result.items)
    setCustomer(result.customer)
    setCustomerName(result.customerName || (result.customer ? result.customer.name : ''))
    setCustomerPhone(result.customerPhone || (result.customer?.phone ?? ''))
    setOrderType(result.orderType)
    setAddress(result.address)
    setPayment(result.paymentMethod)
    setReceived(result.receivedAmount)
    setUnmatched(result.unmatchedLines)
    setParsedOnce(true)
  }

  const changeQty = (key: string, delta: number) => {
    setItems((cur) =>
      cur
        .map((it) => {
          if (it.key !== key) return it
          const n = it.quantity + delta
          if (n <= 0) return null
          return { ...it, quantity: n }
        })
        .filter((it): it is ParsedItem => it !== null)
    )
  }

  const removeItem = (key: string) => {
    setItems((cur) => cur.filter((it) => it.key !== key))
  }

  const addProductManually = (p: Product) => {
    setItems((cur) => [
      ...cur,
      {
        key: crypto.randomUUID(),
        product: p,
        quantity: 1,
        extraAmount: 0,
        extraNote: '',
        extraIds: [],
        note: '',
      },
    ])
    setAddingProduct(false)
    setSearchProduct('')
  }

  const updateItemCustomization = (
    idx: number,
    patch: {
      extraAmount: number
      extraNote: string
      extraIds: string[]
      note: string
    }
  ) => {
    setItems((cur) =>
      cur.map((it, i) => {
        if (i !== idx) return it
        return {
          ...it,
          extraAmount: patch.extraAmount,
          extraNote: patch.extraNote,
          extraIds: patch.extraIds,
          note: patch.note,
        }
      })
    )
    setEditingItemIdx(null)
  }

  const itemsTotal = round2(
    items.reduce((s, it) => s + (it.product.price + it.extraAmount) * it.quantity, 0)
  )

  const apply = (proceedToCheckout: boolean) => {
    const cartLines: CartLine[] = items.map((it) => ({
      key: it.key,
      product: it.product,
      quantity: it.quantity,
      extraAmount: it.extraAmount,
      extraNote: it.extraNote,
      extraIds: it.extraIds,
      note: it.note,
    }))

    onApply({
      cart: cartLines,
      customer,
      customerName: customerName.trim() || 'Cliente avulso',
      customerPhone: customerPhone.trim(),
      orderType,
      address: address.trim(),
      payment,
      received,
      proceedToCheckout,
    })
  }

  const filteredProducts = products.filter((p) =>
    searchProduct.trim() ? p.name.toLowerCase().includes(searchProduct.trim().toLowerCase()) : true
  )

  const activeEditingItem = editingItemIdx !== null ? items[editingItemIdx] : null

  return (
    <>
      <Modal title="Venda Rápida pelo WhatsApp" onClose={onClose} wide>
        <div className="space-y-5">
          {/* Caixa de Texto do WhatsApp */}
          <div className="rounded-xl border-2 border-dashed border-[#25D366] bg-green-50/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-bold text-green-900">
                <WhatsAppIcon size={18} className="text-[#25D366]" /> Cole a mensagem do cliente
              </span>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-100"
                onClick={handlePasteClipboard}
              >
                <ClipboardPaste size={14} /> Colar da área de transferência
              </button>
            </div>

            <textarea
              className="field min-h-[90px] border-green-200 bg-white"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Exemplo de mensagem:\n"Boa noite! Quero 2 Burger Parrilla (um sem cebola e outro com bacon extra) e 1 Coca lata. Entrega na Rua das Flores, 123. Vou pagar no pix"`}
            />

            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="btn flex items-center gap-2 bg-[#25D366] py-2.5 px-4 text-sm font-bold text-white hover:bg-[#20ba5a]"
                onClick={() => runParse(text)}
                disabled={!text.trim()}
              >
                <Wand2 size={16} /> Analisar Mensagem
              </button>
            </div>
          </div>

          {/* Trechos não compreendidos */}
          {unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <AlertCircle size={15} className="text-amber-600 shrink-0" />
                  Trechos que não identifiquei como produtos no cardápio:
                </span>
                <button
                  type="button"
                  className="text-brand-dark underline text-xs font-semibold hover:text-brand"
                  onClick={() => setAddingProduct(true)}
                >
                  + Adicionar produto
                </button>
              </div>
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                {unmatched.map((u, i) => (
                  <li key={i}>{u.replace(/[.,;]+$/, '')}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Base do Pedido para Conferência */}
          {parsedOnce && (
            <div className="space-y-4 rounded-xl border border-line bg-white p-4 shadow-sm">
              <h3 className="border-b border-line pb-2 font-bold text-lg text-ink">
                Base do Pedido (Confira e Ajuste)
              </h3>

              {/* Cliente */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="wa-cname">
                    Nome do cliente
                  </label>
                  <input
                    id="wa-cname"
                    className="field py-2 text-sm"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="wa-cphone">
                    Telefone / WhatsApp
                  </label>
                  <input
                    id="wa-cphone"
                    className="field py-2 text-sm"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                  />
                </div>
              </div>

              {/* Tipo de Pedido */}
              <div>
                <span className="label">Tipo de pedido</span>
                <div className="grid grid-cols-2 gap-2">
                  {([['retirada', Store], ['entrega', Bike]] as const).map(([t, Icon]) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2 font-semibold text-sm ${
                        orderType === t
                          ? 'border-brand bg-brand-soft text-brand-dark'
                          : 'border-line bg-white'
                      }`}
                    >
                      <Icon size={18} /> {t === 'retirada' ? 'Retirada' : 'Entrega'}
                    </button>
                  ))}
                </div>
              </div>

              {orderType === 'entrega' && (
                <div>
                  <label className="label" htmlFor="wa-addr">
                    Endereço de entrega
                  </label>
                  <input
                    id="wa-addr"
                    className="field py-2 text-sm"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, número, complemento..."
                  />
                </div>
              )}

              {/* Itens do Pedido */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">Produtos identificados ({items.length})</span>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-semibold text-brand-dark hover:border-brand"
                    onClick={() => setAddingProduct((o) => !o)}
                  >
                    <PlusCircle size={14} /> + Adicionar produto
                  </button>
                </div>

                {addingProduct && (
                  <div className="mb-3 rounded-lg border border-brand bg-brand-soft/20 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Adicionar ao pedido:</span>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-paper"
                        onClick={() => setAddingProduct(false)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <input
                      className="field my-1 py-1.5 text-xs"
                      placeholder="Pesquisar produto..."
                      value={searchProduct}
                      onChange={(e) => setSearchProduct(e.target.value)}
                      autoFocus
                    />
                    <ul className="max-h-36 divide-y divide-line overflow-y-auto rounded border border-line bg-white">
                      {filteredProducts.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs hover:bg-paper"
                            onClick={() => addProductManually(p)}
                          >
                            <span className="font-semibold">{p.name}</span>
                            <span className="font-bold text-brand-dark">{money(p.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
                    Nenhum produto identificado. Cole o texto acima ou adicione manualmente.
                  </p>
                ) : (
                  <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
                    {items.map((it, idx) => {
                      const hasExtra = it.extraAmount > 0 || Boolean(it.extraNote)
                      const hasNote = Boolean(it.note)

                      return (
                        <li key={it.key} className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm leading-snug">{it.product.name}</p>

                            {/* Botões interativos para Acréscimo e Observação */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {/* Botão de Acréscimo */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItemIdx(idx)
                                  setEditingFocus('extra')
                                }}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  hasExtra
                                    ? 'border border-brand/40 bg-brand-soft text-brand-dark hover:bg-brand-soft/80'
                                    : 'border border-dashed border-line text-muted hover:border-brand hover:text-brand-dark bg-white'
                                }`}
                                title="Editar ou adicionar acréscimos"
                              >
                                <PlusCircle size={13} className="shrink-0" />
                                <span>{hasExtra ? `${it.extraNote} (+${money(it.extraAmount)})` : '+ Acréscimo'}</span>
                                {hasExtra && <Edit2 size={11} className="ml-0.5 opacity-60" />}
                              </button>

                              {/* Botão de Observação */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItemIdx(idx)
                                  setEditingFocus('note')
                                }}
                                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  hasNote
                                    ? 'bg-ink text-white hover:bg-black'
                                    : 'border border-dashed border-line text-muted hover:border-brand hover:text-brand-dark bg-white'
                                }`}
                                title="Editar observação do lanche"
                              >
                                <MessageSquare size={13} className="shrink-0" />
                                <span>{hasNote ? `Obs: ${it.note}` : '+ Obs'}</span>
                                {hasNote && <Edit2 size={11} className="ml-0.5 opacity-60" />}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-0 border-line">
                            {/* Contador de Quantidade */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="grid h-7 w-7 place-items-center rounded border border-line bg-white hover:bg-paper"
                                onClick={() => changeQty(it.key, -1)}
                              >
                                <Minus size={12} />
                              </button>
                              <span className="w-6 text-center text-sm font-bold">{it.quantity}</span>
                              <button
                                type="button"
                                className="grid h-7 w-7 place-items-center rounded bg-brand text-white hover:bg-brand-dark"
                                onClick={() => changeQty(it.key, 1)}
                              >
                                <Plus size={12} />
                              </button>
                            </div>

                            {/* Subtotal do Item */}
                            <div className="w-20 text-right">
                              <span className="text-[10px] text-muted block">
                                {money(it.product.price + it.extraAmount)} un
                              </span>
                              <p className="text-xs font-bold">
                                {money((it.product.price + it.extraAmount) * it.quantity)}
                              </p>
                            </div>

                            {/* Lixeira */}
                            <button
                              type="button"
                              className="p-1 text-muted hover:text-red-700"
                              onClick={() => removeItem(it.key)}
                              title="Remover produto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Forma de Pagamento */}
              <div>
                <span className="label">Forma de pagamento</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {payments.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPayment(p)}
                      className={`rounded-lg border-2 py-1.5 text-xs font-semibold ${
                        payment === p
                          ? 'border-brand bg-brand-soft text-brand-dark'
                          : 'border-line bg-white'
                      }`}
                    >
                      {paymentLabel[p]}
                    </button>
                  ))}
                </div>
              </div>

              {payment === 'dinheiro' && (
                <div>
                  <label className="label" htmlFor="wa-recv">
                    Valor recebido / Troco
                  </label>
                  <input
                    id="wa-recv"
                    className="field py-2 text-sm"
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(e.target.value)}
                    placeholder="Ex: 50,00 ou 100,00"
                  />
                </div>
              )}

              {/* Totalizador */}
              <div className="flex items-center justify-between rounded-lg bg-paper p-3 text-sm">
                <span className="font-semibold text-muted">Subtotal dos itens:</span>
                <span className="font-display text-xl font-bold text-brand-dark">{money(itemsTotal)}</span>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <button type="button" className="btn-ghost flex-1 py-3" onClick={onClose}>
              Cancelar
            </button>
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn-dark flex-1 py-3 font-semibold"
                  onClick={() => apply(false)}
                >
                  Jogar no Carrinho
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1 py-3 font-bold"
                  onClick={() => apply(true)}
                >
                  Finalizar Pedido
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal de Edição de Acréscimo e Observação do Item */}
      {activeEditingItem && editingItemIdx !== null && (
        <EditParsedItemModal
          item={activeEditingItem}
          extraProducts={extraProducts}
          focus={editingFocus}
          onClose={() => setEditingItemIdx(null)}
          onSave={(patch) => updateItemCustomization(editingItemIdx, patch)}
        />
      )}
    </>
  )
}

function EditParsedItemModal({
  item,
  extraProducts,
  focus,
  onClose,
  onSave,
}: {
  item: ParsedItem
  extraProducts: Product[]
  focus: 'extra' | 'note'
  onClose: () => void
  onSave: (patch: { extraAmount: number; extraNote: string; extraIds: string[]; note: string }) => void
}) {
  const [note, setNote] = useState(item.note)
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    item.extraIds.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})
  )

  const chosen = extraProducts.filter((p) => (counts[p.id] ?? 0) > 0)
  const perUnit = round2(chosen.reduce((s, p) => s + p.price * counts[p.id], 0))
  const setCount = (id: string, d: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }))

  const addSuggestion = (t: string) => {
    setNote((cur) => {
      if (cur.toLowerCase().includes(t.toLowerCase())) return cur
      return cur.trim() ? `${cur.trim()}, ${t}` : t
    })
  }

  const handleSave = () => {
    onSave({
      extraAmount: perUnit,
      extraNote: chosen.map((p) => `${counts[p.id] > 1 ? `${counts[p.id]}x ` : ''}${p.name}`).join(', '),
      extraIds: chosen.flatMap((p) => Array<string>(counts[p.id]).fill(p.id)),
      note: note.trim(),
    })
  }

  const noteSection = (
    <div key="note" className="space-y-2">
      <label className="label" htmlFor="edit-parsed-note">
        Observação do produto
      </label>
      <input
        id="edit-parsed-note"
        className="field"
        placeholder="Ex.: Sem cebola, ponto da carne, etc."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        autoFocus={focus === 'note'}
      />
      <div className="flex flex-wrap gap-1.5 pt-1">
        {noteSuggestions.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addSuggestion(t)}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:border-brand"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )

  const extraSection = (
    <div key="extra" className="space-y-2">
      <span className="label">Acréscimos</span>
      {extraProducts.length === 0 ? (
        <p className="rounded-lg bg-paper px-3 py-3 text-xs text-muted">
          Nenhum acréscimo cadastrado na categoria "Acréscimo".
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {extraProducts.map((p) => {
            const c = counts[p.id] ?? 0
            return (
              <li key={p.id} className={`flex items-center gap-2 px-3 py-2 ${c ? 'bg-brand-soft' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-sm">{p.name}</span>
                  <span className="text-xs text-muted">+ {money(p.price)}</span>
                </span>
                {c > 0 && (
                  <>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded border border-line bg-white hover:bg-paper"
                      onClick={() => setCount(p.id, -1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-5 text-center text-sm font-bold">{c}</span>
                  </>
                )}
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded bg-brand text-white hover:bg-brand-dark"
                  onClick={() => setCount(p.id, 1)}
                >
                  <Plus size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <Modal title={`Editar: ${item.product.name}`} onClose={onClose}>
      <div className="space-y-5">
        {focus === 'extra' ? [extraSection, noteSection] : [noteSection, extraSection]}

        {perUnit > 0 && (
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-dark">
            Acréscimo total: + {money(perUnit)} por unidade
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" className="btn-ghost flex-1 py-3" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary flex-1 py-3 font-bold" onClick={handleSave}>
            Salvar alterações
          </button>
        </div>
      </div>
    </Modal>
  )
}
