-- =====================================================================
-- Acréscimo por produto + telefone do cliente no pedido (para impressão)
-- Rode DEPOIS do 001_init.sql: SQL Editor > New query > Run
-- =====================================================================

alter table public.order_items
  add column extra_amount numeric(10,2) not null default 0 check (extra_amount >= 0),
  add column extra_note   text;

alter table public.orders
  add column customer_phone text;

-- Mesma função, agora com acréscimo por item.
-- subtotal do item = (preço do produto + acréscimo) x quantidade
create or replace function public.create_order(
  p_client_key  uuid,
  p_customer_id uuid,
  p_order_type  text,
  p_address     text,
  p_payment     text,
  p_received    numeric,
  p_items       jsonb
) returns public.orders
language plpgsql
as $$
declare
  v_order    public.orders;
  v_total    numeric(10,2) := 0;
  v_name     text := 'Cliente avulso';
  v_phone    text;
  v_change   numeric(10,2);
  v_item     jsonb;
  v_product  public.products;
  v_qty      integer;
  v_extra    numeric(10,2);
begin
  select * into v_order from public.orders where client_key = p_client_key;
  if found then
    return v_order;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa ter pelo menos um item.';
  end if;
  if p_order_type = 'entrega' and length(btrim(coalesce(p_address, ''))) = 0 then
    raise exception 'Informe o endereço de entrega.';
  end if;

  if p_customer_id is not null then
    select name, phone into v_name, v_phone from public.customers where id = p_customer_id;
    if not found then
      raise exception 'Cliente não encontrado.';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_item->>'quantity')::integer;
    v_extra := round(coalesce((v_item->>'extra_amount')::numeric, 0), 2);
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and active;
    if not found then
      raise exception 'Um dos produtos do pedido não está mais disponível.';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida.';
    end if;
    if v_extra < 0 then
      raise exception 'Acréscimo inválido.';
    end if;
    v_total := v_total + (v_product.price + v_extra) * v_qty;
  end loop;

  if p_payment = 'dinheiro' and p_received is not null then
    if p_received < v_total then
      raise exception 'O valor recebido é menor que o total.';
    end if;
    v_change := p_received - v_total;
  end if;

  insert into public.orders (
    client_key, customer_id, customer_name, customer_phone, order_type, delivery_address,
    payment_method, total, amount_received, change_amount
  ) values (
    p_client_key, p_customer_id, v_name, v_phone, p_order_type,
    case when p_order_type = 'entrega' then btrim(p_address) else null end,
    p_payment, v_total,
    case when p_payment = 'dinheiro' then p_received else null end,
    v_change
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_item->>'quantity')::integer;
    v_extra := round(coalesce((v_item->>'extra_amount')::numeric, 0), 2);
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal, extra_amount, extra_note
    ) values (
      v_order.id, v_product.id, v_product.name, v_product.price, v_qty,
      (v_product.price + v_extra) * v_qty, v_extra,
      nullif(btrim(coalesce(v_item->>'extra_note', '')), '')
    );
  end loop;

  return v_order;
end $$;
