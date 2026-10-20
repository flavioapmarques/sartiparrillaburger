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

// Normalização avançada para culinária e bebidas
export function canonicalize(str: string): string {
  return normalize(str)
    // Refrigerantes e volumes
    .replace(/coca[- ]?cola/g, 'coca')
    .replace(/guaran[aá](?: antarctica)?/g, 'guarana')
    .replace(/2\s*(?:litros?|lts?|l\b)/g, '2l')
    .replace(/1\.?5\s*(?:litros?|lts?|l\b)/g, '1.5l')
    .replace(/1\s*(?:litro|lt|l\b)/g, '1l')
    .replace(/600\s*(?:ml)?/g, '600ml')
    .replace(/350\s*(?:ml)?|lata\b/g, 'lata')
    .replace(/zero/g, 'zero')
    // Lanches e sanduíches
    .replace(/\bx\s*[- ]\s*/g, 'x-')
    .replace(/\bxbacon\b/g, 'x-bacon')
    .replace(/\bxsalada\b/g, 'x-salada')
    .replace(/\bxburger\b|\bxburguer\b/g, 'x-burger')
    .replace(/\bxtudo\b/g, 'x-tudo')
    .replace(/\bxegg\b/g, 'x-egg')
    .replace(/\bxfrango\b/g, 'x-frango')
    .replace(/\bxcalabresa\b/g, 'x-calabresa')
    .replace(/\bhamburger\b|\bburguer\b|\bburger\b|\bhamburguer\b/g, 'hamburguer')
}

// Observações comuns
const commonNotes = [
  'sem cebola',
  'sem tomate',
  'sem salada',
  'sem molho',
  'sem maionese',
  'sem queijo',
  'sem bacon',
  'sem picles',
  'sem milho',
  'sem catchup',
  'sem ketchup',
  'sem mostarda',
  'molho a parte',
  'molho à parte',
  'bem passado',
  'ao ponto',
  'mal passado',
  'com gelo',
  'sem gelo',
  'limao e gelo',
  'limão e gelo',
  'bem gelada',
  'gelada',
  'natural',
]

// Linhas ou preâmbulos que não são produtos
function isNoiseLine(line: string): boolean {
  const norm = canonicalize(line)
  if (!norm || norm.length < 2) return true

  // Saudações e preâmbulos comuns
  if (
    /^(oi|ola|olá|boa noite|bom dia|boa tarde|por favor|obrigad[oa]|td bem|tudo bem)\W*$/i.test(norm) ||
    /^(quero fazer um pedido|fazer um pedido|quero pedir|gostaria de fazer um pedido|segue o pedido|meu pedido)\b/i.test(norm) ||
    /^(quero|vou querer|tem como mandar|me manda)\s+(?:dois|tres|quatro|cinco|\d+)?\s*(?:lanches?|pedidos?|coisas?)\b/i.test(norm) ||
    /^(endereco|entrega:|entregar em:|pagamento:|forma de pagamento:|pix|dinheiro|cartao)/i.test(norm)
  ) {
    return true
  }

  return false
}

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
  for (const line of rawLines) {
    const headerMatch = line.match(/^(?:\[?\d{1,2}:\d{2}(?::\d{2})?(?:,\s*\d{1,2}\/\d{1,2}\/\d{2,4})?\]?\s*)?([A-Za-zÀ-ÿ0-9\s]{2,30}):\s*(.*)$/)
    if (headerMatch && !result.customerName) {
      const candidate = headerMatch[1].trim()
      if (!/^(voce|você|eu|atendente|bot)$/i.test(candidate)) {
        result.customerName = candidate
      }
    }

    const nameMatch = line.match(/(?:meu\s+nome\s+e|nome(?:\s+do\s+cliente)?\s*[:\-])\s*([A-Za-zÀ-ÿ\s]{2,40})/i)
    if (nameMatch && !result.customerName) {
      result.customerName = nameMatch[1].trim()
    }

    const phoneMatch = line.match(/(?:tel(?:efone)?|cel(?:ular)?|whats(?:app)?\s*[:\-])?\s*(\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4})/i)
    if (phoneMatch && !result.customerPhone) {
      result.customerPhone = phoneMatch[1].trim()
    }
  }

  // Tenta vincular com cliente existente
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
  const fullTextNorm = canonicalize(text)

  const deliveryKeywords = ['entrega', 'entregar', 'delivery', 'levar', 'trazer', 'mandar', 'motoboy', 'viagem']
  const pickupKeywords = ['retirada', 'retirar', 'buscar', 'pegar ai', 'vou ai buscar', 'passo ai', 'balcao', 'comer ai']

  const hasDelivery = deliveryKeywords.some((w) => fullTextNorm.includes(w))
  const hasPickup = pickupKeywords.some((w) => fullTextNorm.includes(w))

  const addressLines: string[] = []
  const addressPrefixes = [
    'rua', 'r.', 'av.', 'avenida', 'alameda', 'al.', 'estrada', 'travessa',
    'bairro', 'apto', 'apartamento', 'bloco', 'casa', 'condominio', 'cond.', 'numero', 'nº', 'n°'
  ]

  for (const line of rawLines) {
    const lineNorm = canonicalize(line)
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
  } else if (fullTextNorm.includes('credito') || fullTextNorm.includes('cartao')) {
    result.paymentMethod = 'credito'
  }

  const trocoMatch = fullTextNorm.match(/troco\s*(?:para|pra|de)?\s*(?:r\$)?\s*(\d+(?:[.,]\d{1,2})?)/)
  if (trocoMatch) {
    const parsedTroco = parseMoney(trocoMatch[1])
    if (parsedTroco) {
      result.receivedAmount = String(parsedTroco)
      result.paymentMethod = 'dinheiro'
    }
  }

  // 4. Detecção de Itens e Produtos
  // Ordena produtos ativos pelo tamanho do nome canônico (do mais longo para o mais curto)
  const sortedProducts = [...products].sort((a, b) => canonicalize(b.name).length - canonicalize(a.name).length)

  // Filtra as linhas da mensagem que possam conter pedidos
  for (const rawLine of rawLines) {
    // Remove cabeçalhos de mensagem do WhatsApp
    const line = rawLine.replace(/^\[?\d{1,2}:\d{2}.*?\]?\s*[^:]+:\s*/, '').trim()
    if (!line || isNoiseLine(line)) continue

    // Extrai quantidade no início da linha (suporta números como "1", "2x", ou por extenso "um", "dois")
    let qty = 1
    let lineWorkingText = line

    // Regex que pega número no início SEM engolir o 'x' do sanduíche (ex: '1 x salada' -> pega 1, e deixa 'x salada')
    const startNumMatch = lineWorkingText.match(/^(\d+)\s*(?:x\s+(?=[a-z])|x|\*|-)?\s*(.*)$/i)
    if (startNumMatch && Number(startNumMatch[1]) > 0 && Number(startNumMatch[1]) <= 50) {
      qty = Number(startNumMatch[1])
      lineWorkingText = startNumMatch[2].trim()
    } else {
      // Tenta número por extenso no início (ex: "dois angus bacon")
      const words = lineWorkingText.split(/\s+/)
      const firstWord = normalize(words[0])
      if (numberWords[firstWord]) {
        qty = numberWords[firstWord]
        lineWorkingText = words.slice(1).join(' ').trim()
      }
    }

    const canonLine = canonicalize(lineWorkingText)

    // Procura o produto correspondente
    let matchedProduct: Product | null = null
    let matchedProductCanonName = ''

    for (const p of sortedProducts) {
      const pCanon = canonicalize(p.name)
      if (!pCanon) continue

      // Caso 1: Nome do produto está contido na linha
      if (canonLine.includes(pCanon)) {
        matchedProduct = p
        matchedProductCanonName = pCanon
        break
      }

      // Caso 2: Tolerância para hífens e espaçamentos (ex: "x-salada" vs "x salada" vs "xsalada")
      const pNoPunct = pCanon.replace(/[-\s]/g, '')
      const lineNoPunct = canonLine.replace(/[-\s]/g, '')
      if (pNoPunct.length >= 3 && lineNoPunct.includes(pNoPunct)) {
        matchedProduct = p
        matchedProductCanonName = pCanon
        break
      }

      // Caso 3: Palavras-chave essenciais (ex: "Angus Bacon" -> "angus" e "bacon")
      const pWords = pCanon.split(/[-\s]+/).filter((w) => w.length >= 3)
      if (pWords.length >= 2 && pWords.every((w) => canonLine.includes(w))) {
        matchedProduct = p
        matchedProductCanonName = pCanon
        break
      }
    }

    if (matchedProduct) {
      // REGRA CRÍTICA: Remove o nome do produto identificado do texto da linha!
      // Assim, a palavra "bacon" de "Angus Bacon" NUNCA será considerada acréscimo!
      let remainingText = canonLine

      // Remove as palavras do produto identificado
      const pWords = matchedProductCanonName.split(/[-\s]+/).filter(Boolean)
      for (const w of pWords) {
        remainingText = remainingText.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ')
      }
      remainingText = remainingText.replace(/\s+/g, ' ').trim()

      // Agora procura Acréscimos APENAS no texto restante
      const matchedExtras: Product[] = []
      const extraCustomNotes: string[] = []

      // Procura por acréscimos na lista de produtos extras
      for (const ex of extraProducts) {
        const exCanon = canonicalize(ex.name)
        const exWord = exCanon.replace(/extra/gi, '').trim()

        if (
          (exWord.length >= 3 && remainingText.includes(exWord)) ||
          remainingText.includes(exCanon)
        ) {
          matchedExtras.push(ex)
          // Remove o extra do texto restante
          remainingText = remainingText.replace(new RegExp(`\\b${exWord}\\b`, 'gi'), ' ')
        }
      }

      // Se o cliente escreveu "com acrescimo de ..." ou "+ ..." com algo que não estava tabelado
      const explicitExtraMatch = remainingText.match(/(?:com\s+acrescimo\s+de|com\s+adicional\s+de|com\s+extra\s+de|\+\s*extra\s+de)\s+([a-zÀ-ÿ0-9\s]+?)(?=(?:sem\b|ao\b|bem\b|mal\b|$))/i)
      if (explicitExtraMatch && matchedExtras.length === 0) {
        const extraText = explicitExtraMatch[1].trim()
        if (extraText) {
          extraCustomNotes.push(`+ ${extraText}`)
        }
      }

      // Agora procura Observações no texto restante
      const foundNotes: string[] = []
      for (const note of commonNotes) {
        const noteCanon = canonicalize(note)
        if (remainingText.includes(noteCanon)) {
          foundNotes.push(note.charAt(0).toUpperCase() + note.slice(1))
          remainingText = remainingText.replace(new RegExp(`\\b${noteCanon}\\b`, 'gi'), ' ')
        }
      }

      // Se sobrou alguma observação personalizada com "sem ..."
      const customSemMatch = remainingText.match(/\bsem\s+([a-zÀ-ÿ]+)/i)
      if (customSemMatch && !foundNotes.some((n) => n.toLowerCase().includes(customSemMatch[1].toLowerCase()))) {
        foundNotes.push(`Sem ${customSemMatch[1]}`)
      }

      if (extraCustomNotes.length > 0) {
        foundNotes.push(...extraCustomNotes)
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
      // Se não identificou produto e não for ruído
      if (lineWorkingText.length >= 4) {
        result.unmatchedLines.push(rawLine)
      }
    }
  }

  return result
}
