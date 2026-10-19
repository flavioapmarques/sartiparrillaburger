import { useCallback, useEffect, useState } from 'react'
import { Bike, Printer, Search, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dayRange, formatDateTime, localDateInput, money, orderTypeLabel, paymentLabel, round2 } from '../lib/format'
import { Empty, ErrorNote, Modal } from '../components/ui'
import { PrintDialog } from '../components/Print'
import type { Order } from '../types'

export default function Orders() {
  const [date, setDate] = useState(localDateInput())
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Order | null>(null)
  const [printing, setPrinting] = useState(false)

  const q = search.trim()

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(200)
    if (q) {
      // Com busca, procura em todos os dias
      query = /^#?\d+$/.test(q) ? query.eq('order_number', Number(q.replace('#', ''))) : query.ilike('customer_name', `%${q}%`)
    } else {
      const { start, end } = dayRange(date)
      query = query.gte('created_at', start).lt('created_at', end)
    }
    const { data, error } = await query
    if (error) setError('Não foi possível carregar os pedidos.')
    else { setError(null); setOrders(data as Order[]) }
    setLoading(false)
  }, [date, q])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const total = round2(orders.filter((o) => o.status === 'concluido').reduce((s, o) => s + o.total, 0))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-2xl font-bold">Pedidos</h1>
        {!q && (
          <div>
            <label className="label" htmlFor="o-date">Dia</label>
            <input id="o-date" type="date" className="field" value={date} max={localDateInput()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        )}
      </div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-10" placeholder="Pesquisar por número do pedido ou nome do cliente" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card flex items-center justify-between px-4 py-3">
        <span className="text-muted">{q ? 'Resultado da pesquisa' : 'Vendas do dia'}: {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}</span>
        <span className="font-display text-xl font-bold text-brand-dark">{money(total)}</span>
      </div>

      <ErrorNote message={error} />

      {loading && orders.length === 0 ? <p className="text-muted">Carregando...</p> : orders.length === 0 ? (
        <Empty>Nenhum pedido encontrado.</Empty>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <button onClick={() => setSelected(o)} className="card flex w-full items-center gap-3 p-4 text-left hover:border-brand">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-soft font-display text-lg font-bold text-brand-dark">{o.order_number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.customer_name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <span>{formatDateTime(o.created_at)}</span>
                    <span className="flex items-center gap-1">{o.order_type === 'entrega' ? <Bike size={14} /> : <Store size={14} />} {o.order_type === 'entrega' ? 'Entrega' : 'Retirada'}</span>
                    <span>{paymentLabel[o.payment_method]}</span>
                  </span>
                </span>
                <span className="font-display text-lg font-bold">{money(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal title={`Pedido ${selected.order_number}`} onClose={() => setSelected(null)}>
          <dl className="space-y-3">
            <Row label="Data e hora" value={formatDateTime(selected.created_at)} />
            <Row label="Cliente" value={selected.customer_name} />
            {selected.customer_phone && <Row label="Telefone" value={selected.customer_phone} />}
            <Row label="Tipo" value={orderTypeLabel[selected.order_type]} />
            {selected.order_type === 'entrega' && <Row label="Endereço" value={selected.delivery_address ?? '-'} />}
            {selected.delivery_fee > 0 && <Row label="Taxa de entrega" value={money(selected.delivery_fee)} />}
            <Row label="Pagamento" value={paymentLabel[selected.payment_method]} />
            {selected.amount_received !== null && <Row label="Valor recebido" value={money(selected.amount_received)} />}
            {selected.change_amount !== null && <Row label="Troco" value={money(selected.change_amount)} />}
          </dl>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {(selected.order_items ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  {i.quantity}x {i.product_name} <span className="text-sm text-muted">({money(i.unit_price)})</span>
                  {(i.extra_amount > 0 || i.extra_note) && (
                    <span className="block text-sm text-brand-dark">+ Acréscimo{i.extra_note ? ` (${i.extra_note})` : ''}{i.extra_amount > 0 ? ` ${money(i.extra_amount)} cada` : ''}</span>
                  )}
                  {i.note && <span className="block text-sm">Obs: {i.note}</span>}
                </span>
                <span className="font-semibold">{money(i.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-center justify-between text-lg font-bold"><span>Total</span><span className="font-display text-2xl text-brand-dark">{money(selected.total)}</span></p>
          <button className="btn-dark mt-4 w-full py-4" onClick={() => setPrinting(true)}><Printer size={20} /> Imprimir pedido</button>
        </Modal>
      )}
      {selected && printing && <PrintDialog order={selected} onClose={() => setPrinting(false)} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  )
}
