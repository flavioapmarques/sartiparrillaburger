import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { BRAND, formatDateTime, money, orderTypeLabel, paymentLabel, round2 } from '../lib/format'
import { Modal } from './ui'
import type { Order } from '../types'

type Via = 'chapa' | 'motoboy' | 'ambas'
type Paper = '80' | '58'

const paperWidth: Record<Paper, string> = { '80': '76mm', '58': '54mm' }

function loadPaper(): Paper {
  try { return localStorage.getItem('paper') === '58' ? '58' : '80' } catch { return '80' }
}

const ticketStyle = (paper: Paper): React.CSSProperties => ({
  width: '100%',
  maxWidth: paperWidth[paper],
  padding: '3mm',
  boxSizing: 'border-box',
  color: '#000',
  background: '#fff',
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: paper === '58' ? '12px' : '13px',
  lineHeight: 1.3,
})

const dash: React.CSSProperties = { borderTop: '1px dashed #000', margin: '6px 0' }
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8 }

function Header({ title, order }: { title: string; order: Order }) {
  return (
    <>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.15em' }}>{BRAND}</div>
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{title}</div>
      <div style={dash} />
      <div style={{ textAlign: 'center', fontSize: '2em', fontWeight: 700 }}>PEDIDO {order.order_number}</div>
      <div style={{ textAlign: 'center' }}>{formatDateTime(order.created_at)}</div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.2em', marginTop: 4 }}>
        {order.order_type === 'entrega' ? 'ENTREGA' : 'RETIRADA'}
      </div>
      <div style={dash} />
    </>
  )
}

// Via da chapa: sem preços, itens grandes e acréscimos em destaque
function KitchenTicket({ order, paper }: { order: Order; paper: Paper }) {
  return (
    <div className="ticket" style={ticketStyle(paper)}>
      <Header title="VIA DA CHAPA" order={order} />
      <div>Cliente: <strong>{order.customer_name}</strong></div>
      <div style={dash} />
      {(order.order_items ?? []).map((i) => (
        <div key={i.id} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: '1.2em' }}>{i.quantity}x {i.product_name}</div>
          {(i.extra_amount > 0 || i.extra_note) && (
            <div style={{ fontWeight: 700, paddingLeft: 12 }}>+ ACRÉSCIMO{i.extra_note ? `: ${i.extra_note}` : ''}</div>
          )}
          {i.note && <div style={{ fontWeight: 700, paddingLeft: 12 }}>OBS: {i.note}</div>}
        </div>
      ))}
      <div style={dash} />
    </div>
  )
}

// Via do motoboy (entrega) ou comprovante (retirada): endereço, valores e pagamento
function DeliveryTicket({ order, paper }: { order: Order; paper: Paper }) {
  const delivery = order.order_type === 'entrega'
  return (
    <div className="ticket" style={ticketStyle(paper)}>
      <Header title={delivery ? 'VIA DO MOTOBOY' : 'COMPROVANTE'} order={order} />
      <div>Cliente: <strong>{order.customer_name}</strong></div>
      {order.customer_phone && <div>Tel.: {order.customer_phone}</div>}
      {delivery && (
        <>
          <div style={dash} />
          <div style={{ fontWeight: 700 }}>ENDEREÇO:</div>
          <div style={{ fontSize: '1.1em', fontWeight: 700, whiteSpace: 'pre-wrap' }}>{order.delivery_address}</div>
        </>
      )}
      <div style={dash} />
      {(order.order_items ?? []).map((i) => (
        <div key={i.id} style={{ marginBottom: 4 }}>
          <div style={row}><span>{i.quantity}x {i.product_name}</span><span>{money(i.subtotal)}</span></div>
          {(i.extra_amount > 0 || i.extra_note) && (
            <div style={{ paddingLeft: 12 }}>+ Acréscimo{i.extra_note ? ` (${i.extra_note})` : ''}{i.extra_amount > 0 ? ` ${money(i.extra_amount)} cada` : ''}</div>
          )}
          {i.note && <div style={{ paddingLeft: 12 }}>Obs: {i.note}</div>}
        </div>
      ))}
      <div style={dash} />
      {order.delivery_fee > 0 && (
        <>
          <div style={row}><span>Subtotal</span><span>{money(round2(order.total - order.delivery_fee))}</span></div>
          <div style={row}><span>Taxa de entrega</span><span>{money(order.delivery_fee)}</span></div>
        </>
      )}
      <div style={{ ...row, fontWeight: 700, fontSize: '1.3em' }}><span>TOTAL</span><span>{money(order.total)}</span></div>
      <div style={{ ...row, marginTop: 4 }}><span>Pagamento</span><span>{paymentLabel[order.payment_method]}</span></div>
      {order.amount_received !== null && <div style={row}><span>Valor recebido</span><span>{money(order.amount_received)}</span></div>}
      {order.change_amount !== null && order.change_amount > 0 && (
        <div style={{ ...row, fontWeight: 700 }}><span>TROCO</span><span>{money(order.change_amount)}</span></div>
      )}
      <div style={dash} />
      <div style={{ textAlign: 'center' }}>{orderTypeLabel[order.order_type]}</div>
      <div style={{ textAlign: 'center' }}>Obrigado pela preferência!</div>
    </div>
  )
}

export function PrintDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const [via, setVia] = useState<Via>('ambas')
  const [paper, setPaper] = useState<Paper>(loadPaper)

  const choosePaper = (p: Paper) => {
    setPaper(p)
    try { localStorage.setItem('paper', p) } catch { /* sem armazenamento: ignora */ }
  }

  const tickets = (
    <>
      {via !== 'motoboy' && <KitchenTicket order={order} paper={paper} />}
      {via !== 'chapa' && <DeliveryTicket order={order} paper={paper} />}
    </>
  )

  const vias: [Via, string][] = [
    ['ambas', 'As duas vias'],
    ['chapa', 'Via da chapa'],
    ['motoboy', order.order_type === 'entrega' ? 'Via do motoboy' : 'Comprovante'],
  ]

  return (
    <Modal title={`Imprimir pedido ${order.order_number}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {vias.map(([v, label]) => (
            <button key={v} onClick={() => setVia(v)} aria-pressed={via === v}
              className={`rounded-lg border-2 px-2 py-3 text-sm font-semibold sm:text-base ${via === v ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white hover:border-brand'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Largura da bobina</span>
          {(['80', '58'] as Paper[]).map((p) => (
            <button key={p} onClick={() => choosePaper(p)} aria-pressed={paper === p}
              className={`rounded-lg border px-3 py-1.5 font-semibold ${paper === p ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white'}`}>
              {p} mm
            </button>
          ))}
        </div>

        <div className="max-h-[45dvh] overflow-auto rounded-lg bg-paper p-3">
          <div className="mx-auto flex w-fit flex-col gap-4">
            {via !== 'motoboy' && <div className="shadow"><KitchenTicket order={order} paper={paper} /></div>}
            {via !== 'chapa' && <div className="shadow"><DeliveryTicket order={order} paper={paper} /></div>}
          </div>
        </div>

        <p className="text-sm text-muted">Na janela que abrir, escolha a impressora de bobina e desative "Cabeçalhos e rodapés". Cada via sai em uma página, para a guilhotina cortar entre elas.</p>
        <button className="btn-primary w-full py-4 text-lg" onClick={() => window.print()}><Printer size={22} /> Imprimir</button>
      </div>
      {createPortal(<div id="print-root">{tickets}</div>, document.body)}
    </Modal>
  )
}
