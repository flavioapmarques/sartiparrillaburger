import { normalize, parseMoney } from './format'
import type { Customer, OrderType, PaymentMethod, Product } from '../types'

export type ParsedItem = {
  key: string
  product: Product
  quantity: number
  extraAmount: number
  extraNote: string
  extraIds: string[]
  note: string
}

export type ParsedOrderResult = {
  customerName: string
  customerPhone: string
  customer: Customer | null
  orderType: OrderType
  address: string
  paymentMethod: PaymentMethod
  receivedAmount: string
  items: ParsedItem[]
  unmatchedLines: string[]
}

const numberWords: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  meia: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
}

// Observações comuns em lanches e bebidas
const commonNotes = [
  'sem cebola',
  'sem tomate',
  'sem salada',
  'sem molho',
  'sem maionese',
  'sem queijo',
  'sem bacon',
  'sem picles',
  'molho a parte',
  'molho à parte',
  'bem passado',
  'ao ponto',
  'mal passado',
  'com gelo',
  'sem gelo',
  'com limao',
  'com limão',
  'bem gelada',
  'gelada',
  'natural',
  'sem acucar',
  'sem açúcar',
]

export function parseWhatsAppOrder(
  text: string,
  products: Product[],
  extraProducts: Product[],
  customers: Customer[]
): ParsedOrderResult {
  const result: ParsedOrderResult = {
    customerName: '',
    customerPhone: '',
    customer: null,
    orderType: 'retirada',
    address: '',
    paymentMethod: 'pix',
    receivedAmount: '',
    items: [],
    unmatchedLines: [],
  }

  if (!text || !text.trim()) return result

  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // 1. Tentar detectar nome de quem enviou pelo formato do WhatsApp:
  // Ex: "[19:40, 20/10/2026] João da Silva: Oi, queria um burger..." ou "João Silva: Olá..."
  for (const line of rawLines) {
    const headerMatch = line.match(/^(?:\[?\d{1,2}:\d{2}(?::\d{2})?(?:,\s*\d{1,2}\/\d{1,2}\/\d{2,4})?\]?\s*)?([A-Za-zÀ-ÿ0-9\s]{2,30}):\s*(.*)$/)
    if (headerMatch && !result.customerName) {
      const candidate = headerMatch[1].trim()
      // Se não for algo genérico como "Você"
      if (!/^(voce|você|eu|atendente|bot)$/i.test(candidate)) {
        result.customerName = candidate
      }
    }

    // "Nome: ..." ou "Meu nome é ..."
    const nameMatch = line.match(/(?:meu\s+nome\s+e|nome(?:\s+do\s+cliente)?\s*[:\-])\s*([A-Za-zÀ-ÿ\s]{2,40})/i)
    if (nameMatch && !result.customerName) {
      result.customerName = nameMatch[1].trim()
    }

    // Telefone
    const phoneMatch = line.match(/(?:tel(?:efone)?|cel(?:ular)?|whats(?:app)?\s*[:\-])?\s*(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})/i)
    if (phoneMatch && !result.customerPhone) {
      result.customerPhone = phoneMatch[1].trim()
    }
  }

  // Se detectou telefone ou nome, tenta bater com cliente cadastrado
  if (result.customerPhone || result.customerName) {
    const cleanP = result.customerPhone.replace(/\D/g, '')
    const foundCust = customers.find((c) => {
      if (cleanP && c.phone && c.phone.replace(/\D/g, '').includes(cleanP)) return true
      if (result.customerName && normalize(c.name) === normalize(result.customerName)) return true
      return false
    })
    if (foundCust) {
      result.customer = foundCust
      result.customerName = foundCust.name
      if (foundCust.phone) result.customerPhone = foundCust.phone
    }
  }

  // 2. Detectar Tipo (Entrega vs Retirada) e Endereço
  const fullTextNorm = normalize(text)

  const deliveryKeywords = ['entrega', 'entregar', 'delivery', 'levar', 'trazer', 'mandar', 'motoboy', 'viagem']
  const pickupKeywords = ['retirada', 'retirar', 'buscar', 'pegar ai', 'vou ai buscar', 'passo ai', 'balcao', 'comer ai']

  const hasDelivery = deliveryKeywords.some((w) => fullTextNorm.includes(w))
  const hasPickup = pickupKeywords.some((w) => fullTextNorm.includes(w))

  // Detecção de linhas de endereço
  const addressLines: string[] = []
  const addressPrefixes = [
    'rua', 'r.', 'av.', 'avenida', 'alameda', 'al.', 'estrada', 'travessa',
    'bairro', 'apto', 'apartamento', 'bloco', 'casa', 'condominio', 'cond.', 'numero', 'nº', 'n°'
  ]

  for (const line of rawLines) {
    const lineNorm = normalize(line)
    // Se a linha tem indicação explícita de endereço
    if (
      lineNorm.includes('endereco') ||
      lineNorm.includes('entrega:') ||
      lineNorm.includes('entregar em:') ||
      addressPrefixes.some((p) => lineNorm.startsWith(p + ' ') || lineNorm.includes(' ' + p + ' '))
    ) {
      const cleanAddr = line
        .replace(/^(?:endere[cç]o(?:\s*de\s*entrega)?|entregar?\s*(?:em|na|no)?)\s*[:\-]\s*/i, '')
        .trim()
      if (cleanAddr.length > 5) {
        addressLines.push(cleanAddr)
      }
    }
  }

  if (addressLines.length > 0 || hasDelivery) {
    result.orderType = 'entrega'
    result.address = addressLines.join(', ')
  } else if (hasPickup) {
    result.orderType = 'retirada'
  }

  // Se o cliente já tem endereço cadastrado e ficou vazio
  if (result.orderType === 'entrega' && !result.address && result.customer?.address) {
    result.address = [result.customer.address, result.customer.complement, result.customer.reference]
      .filter(Boolean)
      .join(' - ')
  }

  // 3. Detectar Forma de Pagamento e Troco
  if (fullTextNorm.includes('pix')) {
    result.paymentMethod = 'pix'
  } else if (fullTextNorm.includes('dinheiro') || fullTextNorm.includes('especie') || fullTextNorm.includes('troco')) {
    result.paymentMethod = 'dinheiro'
  } else if (fullTextNorm.includes('debito')) {
    result.paymentMethod = 'debito'
  } else if (fullTextNorm.includes('credito') || fullTextNorm.includes('cartao') || fullTextNorm.includes('cartão')) {
    result.paymentMethod = 'credito'
  }

  // Detectar troco
  const trocoMatch = fullTextNorm.match(/troco\s*(?:para|pra|de)?\s*(?:r\$)?\s*(\d+(?:[.,]\d{1,2})?)/)
  if (trocoMatch) {
    const parsedTroco = parseMoney(trocoMatch[1])
    if (parsedTroco) {
      result.receivedAmount = String(parsedTroco)
      result.paymentMethod = 'dinheiro'
    }
  }

  // 4. Detecção de Itens e Produtos
  // Ordena produtos por tamanho do nome (mais longos primeiro) para evitar que "Burger" pegue "Burger Parrilla" antes
  const sortedProducts = [...products].sort((a, b) => b.name.length - a.name.length)

  // Quebra o texto por linhas e pontuações
  const segments: string[] = []
  rawLines.forEach((l) => {
    // Remove mensagens do WhatsApp timestamp
    const cleanL = l.replace(/^\[?\d{1,2}:\d{2}.*?\]?\s*[^:]+:\s*/, '').trim()
    if (!cleanL) return

    // Se a linha é endereço, pagamento ou saudação pura, ignora
    const lNorm = normalize(cleanL)
    if (
      lNorm.startsWith('rua') ||
      lNorm.startsWith('av') ||
      lNorm.startsWith('endereco') ||
      /^(oi|ola|olá|boa noite|bom dia|boa tarde|por favor|obrigad[oa]|td bem|tudo bem)\W*$/i.test(cleanL) ||
      /^(pagamento|forma de pagamento|vou pagar|pagar no|pix|dinheiro|cartao)/i.test(cleanL)
    ) {
      return
    }

    // Divide linhas que têm mais de um item separados por vírgula ou ponto e vírgula
    const parts = cleanL.split(/[,;]|\be\s+(?=\d|\bum\b|\bdois\b|\buma\b|\bduas\b)/i)
    parts.forEach((p) => {
      const trimmed = p.trim()
      if (trimmed) segments.push(trimmed)
    })
  })

  // Para cada segmento, tenta achar um produto
  for (const seg of segments) {
    const segNorm = normalize(seg)
    let matchedProduct: Product | null = null

    // Procura produto correspondente
    for (const p of sortedProducts) {
      const pNorm = normalize(p.name)
      // Correspondência por nome completo ou palavras-chave principais
      if (segNorm.includes(pNorm)) {
        matchedProduct = p
        break
      }

      // Se for abreviação simples, ex: nome é "X-Bacon" e usuário escreveu "xbacon"
      const pClean = pNorm.replace(/[-\s]/g, '')
      const segClean = segNorm.replace(/[-\s]/g, '')
      if (segClean.includes(pClean) && pClean.length >= 3) {
        matchedProduct = p
        break
      }
    }

    if (matchedProduct) {
      // Detectar quantidade
      let qty = 1
      // Ex: "2x", "2 ", "3 - ", "1 burger"
      const numMatch = seg.match(/(?:^|\b)(\d+)\s*(?:x|\*|-)?\s*/i)
      if (numMatch && Number(numMatch[1]) > 0 && Number(numMatch[1]) <= 50) {
        qty = Number(numMatch[1])
      } else {
        // Tenta por extenso ("dois", "duas", "um", etc.)
        for (const [w, val] of Object.entries(numberWords)) {
          const wRegex = new RegExp(`\\b${w}\\b`, 'i')
          if (wRegex.test(segNorm)) {
            qty = val
            break
          }
        }
      }

      // Detectar Observação
      const foundNotes: string[] = []
      for (const note of commonNotes) {
        if (segNorm.includes(note)) {
          foundNotes.push(note.charAt(0).toUpperCase() + note.slice(1))
        }
      }

      // Detectar Acréscimo
      const matchedExtras: Product[] = []
      for (const ex of extraProducts) {
        const exNorm = normalize(ex.name)
        if (segNorm.includes(exNorm) || segNorm.includes(exNorm.replace(/extra/i, '').trim())) {
          matchedExtras.push(ex)
        }
      }

      const extraAmount = matchedExtras.reduce((s, e) => s + e.price, 0)
      const extraNote = matchedExtras.map((e) => e.name).join(', ')
      const extraIds = matchedExtras.map((e) => e.id)

      result.items.push({
        key: crypto.randomUUID(),
        product: matchedProduct,
        quantity: qty,
        extraAmount,
        extraNote,
        extraIds,
        note: foundNotes.join(', '),
      })
    } else {
      // Se não bateu com nenhum produto e tem tamanho razoável, guarda para o operador ver
      if (seg.length > 3) {
        result.unmatchedLines.push(seg)
      }
    }
  }

  return result
}
