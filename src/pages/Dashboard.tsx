import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3,
  Bike,
  CreditCard,
  Flame,
  Percent,
  Plus,
  ShoppingBag,
  Store,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { money, round2 } from '../lib/format'
import { Empty, ErrorNote } from '../components/ui'
import type { Order, OrderItem, PaymentMethod } from '../types'

type Period = 'hoje' | 'ontem' | '7dias' | 'mes' | 'tudo'

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('hoje')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getDateRange = (p: Period) => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

    if (p === 'hoje') {
      return { start: todayStart.toISOString(), end: todayEnd.toISOString() }
    }
    if (p === 'ontem') {
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      return { start: yesterdayStart.toISOString(), end: todayStart.toISOString() }
    }
    if (p === '7dias') {
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      return { start: weekAgo.toISOString(), end: todayEnd.toISOString() }
    }
    if (p === 'mes') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start: monthStart.toISOString(), end: todayEnd.toISOString() }
    }
    return null // tudo
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const range = getDateRange(period)
    let query = supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('status', 'concluido')
      .order('created_at', { ascending: false })

    if (range) {
      query = query.gte('created_at', range.start).lt('created_at', range.end)
    }

    const { data, error: err } = await query
    if (err) {
      setError('Não foi possível carregar os dados do painel.')
    } else {
      setOrders((data ?? []) as Order[])
    }
    setLoading(false)
  }, [period])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Cálculos do Dashboard
  const totalFaturado = round2(orders.reduce((sum, o) => sum + o.total, 0))
  const totalPedidos = orders.length
  const ticketMedio = totalPedidos > 0 ? round2(totalFaturado / totalPedidos) : 0

  const totalEntregas = orders.filter((o) => o.order_type === 'entrega').length
  const totalRetiradas = orders.filter((o) => o.order_type === 'retirada').length
  const taxaEntregaTotal = round2(orders.reduce((sum, o) => sum + (o.delivery_fee || 0), 0))

  // Agrupamento dos produtos mais vendidos
  const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  const extrasMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  const paymentMap: Record<PaymentMethod, { count: number; total: number }> = {
    pix: { count: 0, total: 0 },
    dinheiro: { count: 0, total: 0 },
    debito: { count: 0, total: 0 },
    credito: { count: 0, total: 0 },
  }

  orders.forEach((o) => {
    if (paymentMap[o.payment_method]) {
      paymentMap[o.payment_method].count += 1
      paymentMap[o.payment_method].total += o.total
    }

    ;(o.order_items ?? []).forEach((item: OrderItem) => {
      // Produto principal
      const key = item.product_name.trim()
      if (!productMap[key]) {
        productMap[key] = { name: key, quantity: 0, revenue: 0 }
      }
      productMap[key].quantity += item.quantity
      productMap[key].revenue += item.subtotal

      // Acréscimos
      if (item.extra_note) {
        const extraNames = item.extra_note.split(',').map((s) => s.trim())
        extraNames.forEach((ex) => {
          if (!ex) return
          if (!extrasMap[ex]) {
            extrasMap[ex] = { name: ex, quantity: 0, revenue: 0 }
          }
          extrasMap[ex].quantity += item.quantity
          extrasMap[ex].revenue += (item.extra_amount || 0) * item.quantity
        })
      }
    })
  })

  const topProducts = Object.values(productMap).sort((a, b) => b.quantity - a.quantity)
  const maxQty = topProducts[0]?.quantity || 1

  const topExtras = Object.values(extrasMap).sort((a, b) => b.quantity - a.quantity)

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Filtros */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="text-brand" size={28} /> Painel de Vendas
          </h1>
          <p className="text-sm text-muted">Acompanhe o faturamento e os itens mais pedidos</p>
        </div>

        {/* Botões de Período */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
          {(
            [
              ['hoje', 'Hoje'],
              ['ontem', 'Ontem'],
              ['7dias', '7 dias'],
              ['mes', 'Este mês'],
              ['tudo', 'Tudo'],
            ] as [Period, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                period === p ? 'bg-ink text-white' : 'text-ink hover:bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote message={error} />

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Faturamento */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Faturamento do período</span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-green-100 text-green-700">
              <TrendingUp size={20} />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-bold text-brand-dark">{money(totalFaturado)}</p>
          <p className="mt-1 text-xs text-muted">Taxas de entrega: {money(taxaEntregaTotal)}</p>
        </div>

        {/* Quantidade de Pedidos */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Pedidos concluídos</span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-100 text-blue-700">
              <ShoppingBag size={20} />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{totalPedidos}</p>
          <p className="mt-1 text-xs text-muted">
            {totalEntregas} entregas • {totalRetiradas} retiradas
          </p>
        </div>

        {/* Ticket Médio */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Ticket médio</span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <Percent size={20} />
            </span>
          </div>
          <p className="mt-2 font-display text-3xl font-bold">{money(ticketMedio)}</p>
          <p className="mt-1 text-xs text-muted">Média por pedido</p>
        </div>

        {/* Forma de Pagamento Principal */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Pagamentos</span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-purple-100 text-purple-700">
              <CreditCard size={20} />
            </span>
          </div>
          <div className="mt-2 flex flex-col gap-1 text-xs font-semibold">
            {(['pix', 'cartao', 'dinheiro'] as const).map((key) => {
              const label = key === 'cartao' ? 'Cartões' : key === 'pix' ? 'Pix' : 'Dinheiro'
              const valor =
                key === 'cartao'
                  ? paymentMap.debito.total + paymentMap.credito.total
                  : key === 'pix'
                  ? paymentMap.pix.total
                  : paymentMap.dinheiro.total
              return (
                <div key={key} className="flex justify-between">
                  <span className="text-muted">{label}</span>
                  <span>{money(round2(valor))}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <p className="py-10 text-center text-muted">Calculando dados do período...</p>
      ) : orders.length === 0 ? (
        <Empty>Nenhum pedido concluído neste período.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* O que mais está saindo (Mais vendidos) */}
          <div className="card lg:col-span-2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Flame className="text-orange-500" size={22} /> O que mais está saindo
                </h2>
                <p className="text-xs text-muted">Ranking dos produtos campeões de vendas</p>
              </div>
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand-dark">
                {topProducts.length} {topProducts.length === 1 ? 'produto' : 'produtos'}
              </span>
            </div>

            <ul className="space-y-4">
              {topProducts.map((p, idx) => {
                const percent = Math.min(100, Math.round((p.quantity / maxQty) * 100))
                const badgeColor =
                  idx === 0
                    ? 'bg-amber-400 text-black'
                    : idx === 1
                    ? 'bg-gray-300 text-black'
                    : idx === 2
                    ? 'bg-amber-700 text-white'
                    : 'bg-paper text-muted border border-line'

                return (
                  <li key={p.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${badgeColor}`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-ink truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-brand-dark">{p.quantity} un.</span>
                        <span className="text-xs text-muted">{money(round2(p.revenue))}</span>
                      </div>
                    </div>

                    {/* Barra de Progresso Visual */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                      <div
                        className="h-full rounded-full bg-brand transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Coluna da direita: Acréscimos e Tipos de Pedido */}
          <div className="space-y-6">
            {/* Top Acréscimos */}
            <div className="card p-5">
              <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
                <Plus className="text-brand" size={18} /> Acréscimos mais pedidos
              </h2>
              <p className="mb-4 text-xs text-muted">Extras que mais agregam valor</p>

              {topExtras.length === 0 ? (
                <p className="text-xs text-muted">Nenhum acréscimo registrado no período.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {topExtras.slice(0, 8).map((ex) => (
                    <li key={ex.name} className="flex items-center justify-between py-2">
                      <span className="font-medium truncate">{ex.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-brand-dark">{ex.quantity}x</span>
                        {ex.revenue > 0 && (
                          <span className="block text-xs text-muted">{money(round2(ex.revenue))}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Divisão Entrega vs Retirada */}
            <div className="card p-5">
              <h2 className="mb-3 text-base font-bold">Entrega vs Retirada</h2>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1">
                      <Bike size={14} className="text-blue-600" /> Entrega
                    </span>
                    <span>
                      {totalEntregas} ({totalPedidos > 0 ? Math.round((totalEntregas / totalPedidos) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full bg-blue-600"
                      style={{
                        width: `${totalPedidos > 0 ? (totalEntregas / totalPedidos) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1">
                      <Store size={14} className="text-amber-600" /> Retirada
                    </span>
                    <span>
                      {totalRetiradas} ({totalPedidos > 0 ? Math.round((totalRetiradas / totalPedidos) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full bg-amber-600"
                      style={{
                        width: `${totalPedidos > 0 ? (totalRetiradas / totalPedidos) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
