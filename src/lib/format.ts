import type { PaymentMethod, OrderType } from '../types'

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
