import { useEffect, useState } from 'react'
import { Bike, Minus, Plus, PlusCircle, Store, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { customerAddress, money, parseMoney, paymentLabel, round2 } from '../lib/format'
import { ErrorNote, Modal } from './ui'
import type { Customer, Order, OrderType, PaymentMethod, Product } from '../types'

type EditableItem = {
  id?: string
  product_id?: string | null
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  extra_amount: number
  extra_note?: string | null
  note?: string | null
}

const payments: PaymentMethod[] = ['pix', 'dinheiro', 'debito', 'credito']

export function EditOrderModal({
  order,
  onClose,
  onSaved,
}: {
  order: Order
  onClose: () => void
  onSaved: (updated: Order) => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [customerPhone, setCustomerPhone] = useState(order.customer_phone ?? '')
  const [type, setType] = useState<OrderType>(order.order_type)
  const [address, setAddress] = useState(order.delivery_address ?? '')
  const [fee, setFee] = useState(order.delivery_fee ? String(order.delivery_fee) : '')
  const [payment, setPayment] = useState<PaymentMethod>(order.payment_method)
  const [received, setReceived] = useState(order.amount_received ? String(order.amount_received) : '')
  const [status, setStatus] = useState<'concluido' | 'cancelado'>(order.status)
  const [items, setItems] = useState<EditableItem[]>(() =>
    (order.order_items ?? []).map((i) => ({
      id: i.id,
      product_id: (i as { product_id?: string | null }).product_id ?? null,
      product_name: i.product_name,
      unit_price: i.unit_price,
      quantity: i.quantity,
      subtotal: i.subtotal,
      extra_amount: i.extra_amount,
      extra_note: i.extra_note,
      note: i.note,
    }))
  )

  const [addingProduct, setAddingProduct] = useState(false)
  const [searchProduct, setSearchProduct] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*').eq('active', true).order('name'),
    ]).then(([c, p]) => {
      const custList = (c.data ?? []) as Customer[]
      setCustomers(custList)
      setProducts((p.data ?? []) as Product[])
      if (order.customer_id) {
        const found = custList.find((x) => x.id === order.customer_id)
        if (found) setCustomer(found)
      }
    })
  }, [order.customer_id])

  const delivery = type === 'entrega'
  const feeParsed = delivery && fee.trim() !== '' ? parseMoney(fee) : 0
  const feeInvalid = feeParsed === null
  const feeValue = feeParsed ?? 0

  const itemsTotal = round2(
    items.reduce((sum, item) => sum + (item.unit_price + item.extra_amount) * item.quantity, 0)
  )
  const total = round2(itemsTotal + feeValue)

  const cash = payment === 'dinheiro'
  const receivedValue = parseMoney(received)
  const receivedInvalid = cash && received.trim() !== '' && (receivedValue === null || receivedValue < total)
  const changeValue = cash && receivedValue !== null && receivedValue >= total ? round2(receivedValue - total) : null

  const changeQty = (idx: number, delta: number) => {
    setItems((cur) =>
      cur
        .map((it, i) => {
          if (i !== idx) return it
          const newQty = it.quantity + delta
          if (newQty <= 0) return null
          return {
            ...it,
            quantity: newQty,
            subtotal: round2((it.unit_price + it.extra_amount) * newQty),
          }
        })
        .filter((it): it is EditableItem => it !== null)
    )
  }

  const removeItem = (idx: number) => {
    setItems((cur) => cur.filter((_, i) => i !== idx))
  }

  const addItemFromProduct = (p: Product) => {
    setItems((cur) => [
      ...cur,
      {
        product_id: p.id,
        product_name: p.name,
        unit_price: p.price,
        quantity: 1,
        subtotal: p.price,
        extra_amount: 0,
        extra_note: null,
        note: null,
      },
    ])
    setAddingProduct(false)
    setSearchProduct('')
  }

  const handlePickCustomer = (c: Customer | null) => {
    setCustomer(c)
    if (c) {
      setCustomerName(c.name)
      if (c.phone) setCustomerPhone(c.phone)
      if (delivery && !address.trim()) {
        const addr = customerAddress(c)
        if (addr) setAddress(addr)
      }
    }
  }

  async function handleSave() {
    if (items.length === 0) return setError('O pedido precisa ter pelo menos um item.')
    if (delivery && !address.trim()) return setError('Informe o endereço completo para entrega.')
    if (feeInvalid) return setError('Informe um valor válido para a taxa de entrega.')
    if (receivedInvalid) return setError('O valor recebido não pode ser menor que o total.')

    setBusy(true)
    setError(null)

    const payload = {
      p_order_id: order.id,
      p_customer_id: customer?.id ?? null,
      p_customer_name: customerName.trim() || 'Cliente avulso',
      p_customer_phone: customerPhone.trim() || null,
      p_order_type: type,
      p_address: delivery ? address.trim() : null,
      p_payment: payment,
      p_received: cash ? receivedValue : null,
      p_delivery_fee: delivery ? feeValue : 0,
      p_status: status,
      p_items: items.map((i) => ({
        product_id: i.product_id ?? null,
        product_name: i.product_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        extra_amount: i.extra_amount,
        extra_note: i.extra_note || null,
        note: i.note || null,
      })),
    }

    const { data, error: rpcErr } = await supabase.rpc('update_order', payload)

    if (rpcErr) {
      setError(
        'Erro ao atualizar o pedido. Certifique-se de ter executado o script 004_editar_pedidos.sql no SQL Editor do Supabase: ' +
          rpcErr.message
      )
      setBusy(false)
      return
    }

    // Busca o pedido atualizado completo
    const full = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order.id)
      .single()

    setBusy(false)
    onSaved((full.data ?? data) as Order)
    onClose()
  }

  const filteredProducts = products.filter((p) =>
    searchProduct.trim() ? p.name.toLowerCase().includes(searchProduct.trim().toLowerCase()) : true
  )

  return (
    <Modal title={`Editar Pedido #${order.order_number}`} onClose={() => !busy && onClose()} wide>
      <div className="space-y-5">
        {/* Status do Pedido */}
        <div>
          <span className="label">Status do pedido</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStatus('concluido')}
              className={`rounded-lg border-2 py-2.5 font-bold transition-colors ${
                status === 'concluido'
                  ? 'border-green-600 bg-green-50 text-green-800'
                  : 'border-line bg-white text-muted hover:border-gray-400'
              }`}
            >
              ✓ Concluído
            </button>
            <button
              type="button"
              onClick={() => setStatus('cancelado')}
              className={`rounded-lg border-2 py-2.5 font-bold transition-colors ${
                status === 'cancelado'
                  ? 'border-red-600 bg-red-50 text-red-800'
                  : 'border-line bg-white text-muted hover:border-gray-400'
              }`}
            >
              ✕ Cancelado
            </button>
          </div>
        </div>

        {/* Cliente */}
        <div>
          <span className="label">Cliente cadastrado (opcional)</span>
          <select
            className="field"
            value={customer?.id ?? ''}
            onChange={(e) => {
              const sel = customers.find((c) => c.id === e.target.value) ?? null
              handlePickCustomer(sel)
            }}
          >
            <option value="">Cliente avulso</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="e-cname">
              Nome do cliente
            </label>
            <input
              id="e-cname"
              className="field"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João da Silva"
            />
          </div>
          <div>
            <label className="label" htmlFor="e-cphone">
              Telefone (WhatsApp)
            </label>
            <input
              id="e-cphone"
              className="field"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="(11) 98765-4321"
            />
          </div>
        </div>

        {/* Tipo de pedido */}
        <div>
          <span className="label">Tipo de pedido</span>
          <div className="grid grid-cols-2 gap-3">
            {([['retirada', Store], ['entrega', Bike]] as const).map(([t, Icon]) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 font-semibold ${
                  type === t ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white'
                }`}
              >
                <Icon size={20} /> {t === 'retirada' ? 'Retirada' : 'Entrega'}
              </button>
            ))}
          </div>
        </div>

        {delivery && (
          <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
            <div>
              <label className="label" htmlFor="e-addr">
                Endereço de entrega
              </label>
              <textarea
                id="e-addr"
                className="field"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro, complemento..."
              />
            </div>
            <div>
              <label className="label" htmlFor="e-fee">
                Taxa de entrega (R$)
              </label>
              <input
                id="e-fee"
                className="field"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
        )}

        {/* Itens do Pedido */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Itens do pedido ({items.length})</span>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1 text-sm font-semibold text-brand-dark hover:border-brand"
              onClick={() => setAddingProduct((o) => !o)}
            >
              <PlusCircle size={16} /> Adicionar produto
            </button>
          </div>

          {addingProduct && (
            <div className="mb-3 rounded-xl border border-brand bg-brand-soft/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Escolha um produto para adicionar:</span>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-paper"
                  onClick={() => setAddingProduct(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <input
                className="field my-2"
                placeholder="Pesquisar produto..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                autoFocus
              />
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
                {filteredProducts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-paper"
                      onClick={() => addItemFromProduct(p)}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="font-bold text-brand-dark">{money(p.price)}</span>
                    </button>
                  </li>
                ))}
                {filteredProducts.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted">Nenhum produto encontrado.</li>
                )}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {items.map((item, idx) => (
              <li key={idx} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{item.product_name}</p>
                    {item.extra_amount > 0 && (
                      <p className="text-xs text-brand-dark">
                        + Acréscimo: {item.extra_note || ''} (+{money(item.extra_amount)} cada)
                      </p>
                    )}
                    {item.note && <p className="text-xs text-muted">Obs: {item.note}</p>}
                  </div>
                  <button
                    type="button"
                    className="p-1 text-muted hover:text-red-700"
                    onClick={() => removeItem(idx)}
                    title="Remover item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded border border-line bg-white hover:bg-paper"
                      onClick={() => changeQty(idx, -1)}
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center font-bold">{item.quantity}</span>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded bg-brand text-white hover:bg-brand-dark"
                      onClick={() => changeQty(idx, 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted">
                      {money(item.unit_price + item.extra_amount)} cada
                    </span>
                    <p className="font-bold">{money((item.unit_price + item.extra_amount) * item.quantity)}</p>
                  </div>
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="p-4 text-center text-sm text-muted">
                Nenhum item no pedido. Adicione pelo menos um produto.
              </li>
            )}
          </ul>
        </div>

        {/* Pagamento */}
        <div>
          <span className="label">Forma de pagamento</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {payments.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPayment(p)}
                className={`rounded-lg border-2 py-2 text-sm font-semibold ${
                  payment === p ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white'
                }`}
              >
                {paymentLabel[p]}
              </button>
            ))}
          </div>
        </div>

        {cash && (
          <div>
            <label className="label" htmlFor="e-recv">
              Valor recebido (dinheiro)
            </label>
            <input
              id="e-recv"
              className="field"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              placeholder="0,00"
            />
            {changeValue !== null && (
              <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-base font-bold text-green-800">
                Troco: {money(changeValue)}
              </p>
            )}
          </div>
        )}

        {/* Totalizador */}
        <div className="rounded-xl border border-line bg-paper p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Subtotal dos itens</span>
              <span className="font-semibold">{money(itemsTotal)}</span>
            </div>
            {delivery && (
              <div className="flex justify-between">
                <span className="text-muted">Taxa de entrega</span>
                <span className="font-semibold">{money(feeValue)}</span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-lg font-bold">
              <span>Total Atualizado</span>
              <span className="font-display text-2xl text-brand-dark">{money(total)}</span>
            </div>
          </div>
        </div>

        <ErrorNote message={error} />

        <div className="flex gap-3">
          <button type="button" className="btn-ghost flex-1 py-3.5" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary flex-[2] py-3.5 text-base font-bold"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
