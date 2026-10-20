import { useCallback, useEffect, useState } from 'react'
import { Bike, Pencil, Printer, Search, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { dayRange, formatDateTime, localDateInput, money, openOrderWhatsApp, orderTypeLabel, paymentLabel, round2 } from '../lib/format'
import { Empty, ErrorNote, Modal, WhatsAppIcon } from '../components/ui'
import { PrintDialog } from '../components/Print'
import { EditOrderModal } from '../components/EditOrderModal'
import type { Order } from '../types'

export default function Orders() {
  const [date, setDate] = useState(localDateInput())
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Order | null>(null)
  const [printing, setPrinting] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)

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
              <button onClick={() => setSelected(o)} className={`card flex w-full items-center gap-3 p-4 text-left hover:border-brand ${o.status === 'cancelado' ? 'opacity-60 bg-red-50/30' : ''}`}>
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg font-display text-lg font-bold ${o.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-brand-soft text-brand-dark'}`}>
                  {o.order_number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{o.customer_name}</span>
                    {o.status === 'cancelado' && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-800">Cancelado</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                    <span>{formatDateTime(o.created_at)}</span>
                    <span className="flex items-center gap-1">{o.order_type === 'entrega' ? <Bike size={14} /> : <Store size={14} />} {o.order_type === 'entrega' ? 'Entrega' : 'Retirada'}</span>
                    <span>{paymentLabel[o.payment_method]}</span>
                  </span>
                </span>
                <span className={`font-display text-lg font-bold ${o.status === 'cancelado' ? 'line-through text-muted' : ''}`}>{money(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Modal title={`Pedido ${selected.order_number}`} onClose={() => setSelected(null)}>
          <dl className="space-y-3">
            <Row
              label="Status"
              value={
                selected.status === 'cancelado' ? (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-sm font-bold text-red-700">Cancelado</span>
                ) : (
                  <span className="rounded bg-green-100 px-2 py-0.5 text-sm font-bold text-green-700">Concluído</span>
                )
              }
            />
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
          
          <button
            type="button"
            className="btn-ghost mt-4 w-full py-3 text-base font-semibold border-brand text-brand-dark hover:bg-brand-soft"
            onClick={() => setEditing(selected)}
          >
            <Pencil size={18} /> Editar pedido
          </button>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn w-full bg-[#25D366] py-3.5 text-white hover:bg-[#20ba5a] sm:flex-1"
              onClick={() => openOrderWhatsApp(selected)}
            >
              <WhatsAppIcon size={20} /> Enviar no WhatsApp
            </button>
            <button className="btn-dark w-full py-3.5 sm:flex-1" onClick={() => setPrinting(true)}>
              <Printer size={20} /> Imprimir pedido
            </button>
          </div>
        </Modal>
      )}
      {selected && printing && <PrintDialog order={selected} onClose={() => setPrinting(false)} />}
      {editing && (
        <EditOrderModal
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setSelected(updated)
            load()
          }}
        />
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  )
}
