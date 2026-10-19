export type Product = {
  id: string
  name: string
  category_id: string | null
  price: number
  description: string | null
  image_url: string | null
  active: boolean
}

export type Category = {
  id: string
  name: string
  icon: string
  sort_order: number
}

export type Customer = {
  id: string
  name: string
  phone: string | null
  address: string | null
  complement: string | null
  reference: string | null
}

export type OrderType = 'retirada' | 'entrega'
export type PaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito'

export type OrderItem = {
  id: string
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  extra_amount: number
  extra_note: string | null
  note: string | null
}

export type Order = {
  id: string
  order_number: number
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  order_type: OrderType
  delivery_address: string | null
  delivery_fee: number
  payment_method: PaymentMethod
  total: number
  amount_received: number | null
  change_amount: number | null
  status: 'concluido' | 'cancelado'
  created_at: string
  order_items?: OrderItem[]
}

export type CartLine = {
  key: string
  product: Product
  quantity: number
  extraAmount: number // acréscimo por unidade
  extraNote: string
  extraIds: string[] // produtos de acréscimo escolhidos (repetidos se mais de um)
  note: string // observação do produto (ex.: sem cebola)
}
