import type { PaymentMethod, OrderType, Order } from '../types'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const money = (v: number) => brl.format(v)

// Soma em centavos para evitar erros de ponto flutuante
export const round2 = (v: number) => Math.round(v * 100) / 100

// Aceita "12,50", "12.50" ou "1.234,56"
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace('R$', '')
  if (!t) return null
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? round2(n) : null
}

export const paymentLabel: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
}

export const orderTypeLabel: Record<OrderType, string> = {
  retirada: 'Retirada no restaurante',
  entrega: 'Entrega (viagem)',
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Data local no formato AAAA-MM-DD (para o campo de data)
export const localDateInput = (d = new Date()) => {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export function dayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function customerAddress(c: { address: string | null; complement: string | null; reference: string | null }) {
  return [c.address, c.complement, c.reference ? `Ref.: ${c.reference}` : null]
    .filter((p) => p && p.trim())
    .join(' - ')
}

export const lineTotal = (l: { product: { price: number }; quantity: number; extraAmount: number }) =>
  round2((l.product.price + l.extraAmount) * l.quantity)

export const BRAND = 'Sarti Parrilla Burger'
export const CREDIT = 'Desenvolvido por Flavio Marques'

// Ignora acentos e maiúsculas: "Acréscimo" = "acrescimo"
export const normalize = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const isExtraCategory = (name: string) => normalize(name).startsWith('acrescimo')
export const isSnackCategory = (name: string) => normalize(name).startsWith('lanche')

export function formatOrderWhatsApp(order: Order): string {
  const delivery = order.order_type === 'entrega'
  const lines: string[] = [
    `🍔 *${BRAND.toUpperCase()}* 🍔`,
    `*PEDIDO #${order.order_number}*`,
    `📅 ${formatDateTime(order.created_at)}`,
    `🛵 *${delivery ? 'ENTREGA' : 'RETIRADA'}*`,
    `👤 Cliente: *${order.customer_name}*`,
  ]

  if (order.customer_phone) {
    lines.push(`📞 Tel: ${order.customer_phone}`)
  }

  if (delivery && order.delivery_address) {
    lines.push(`📍 *Endereço:* ${order.delivery_address}`)
  }

  lines.push('')
  lines.push('📋 *ITENS:*')

  const items = order.order_items ?? []
  for (const item of items) {
    lines.push(`• *${item.quantity}x ${item.product_name}* - ${money(item.subtotal)}`)
    if (item.extra_amount > 0 || item.extra_note) {
      lines.push(`   └ + Acréscimo: ${item.extra_note || ''}${item.extra_amount > 0 ? ` (+${money(item.extra_amount)})` : ''}`)
    }
    if (item.note) {
      lines.push(`   └ Obs: ${item.note}`)
    }
  }

  lines.push('')
  if (delivery && order.delivery_fee > 0) {
    lines.push(`Subtotal: ${money(round2(order.total - order.delivery_fee))}`)
    lines.push(`Taxa de entrega: ${money(order.delivery_fee)}`)
  }

  lines.push(`*TOTAL: ${money(order.total)}*`)
  lines.push(`Pagamento: ${paymentLabel[order.payment_method]}`)

  if (order.amount_received !== null) {
    lines.push(`Valor recebido: ${money(order.amount_received)}`)
  }
  if (order.change_amount !== null && order.change_amount > 0) {
    lines.push(`Troco: *${money(order.change_amount)}*`)
  }

  lines.push('')
  lines.push('Agradecemos a sua preferência! 💛')

  return lines.join('\n')
}

export function openOrderWhatsApp(order: Order) {
  const cleanPhone = order.customer_phone ? order.customer_phone.replace(/\D/g, '') : ''
  let phone = cleanPhone
  if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
    phone = `55${cleanPhone}`
  }
  const msg = encodeURIComponent(formatOrderWhatsApp(order))
  const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`
  window.open(url, '_blank')
}
