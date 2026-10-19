-- =====================================================================
-- Categorias com ícone e ordem, taxa de entrega e observação por item
-- Rode DEPOIS do 001 e do 002: SQL Editor > New query > Run
-- Mantém as categorias que você já digitou nos produtos.
-- =====================================================================

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  icon       text not null default 'utensils',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_key on public.categories (lower(btrim(name)));
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- Cria uma categoria para cada nome que já existe nos produtos
insert into public.categories (name, icon, sort_order)
select distinct on (lower(btrim(category)))
  btrim(category),
  case
    when lower(btrim(category)) like 'lanche%' then 'sandwich'
    when lower(btrim(category)) like 'bebida%' then 'cup-soda'
    when lower(btrim(category)) like 'por%' then 'drumstick'
    when lower(btrim(category)) like 'sobremesa%' then 'ice-cream'
    when lower(btrim(category)) like 'acr%' then 'plus'
    else 'utensils'
  end,
  case
    when lower(btrim(category)) like 'lanche%' then 0
    when lower(btrim(category)) like 'acr%' then 90
    else 10
  end
from public.products
where category is not null and btrim(category) <> '';

-- Liga cada produto à sua categoria
alter table public.products
  add column category_id uuid references public.categories(id) on delete set null;

update public.products p
set category_id = c.id
from public.categories c
where p.category is not null and lower(btrim(p.category)) = lower(btrim(c.name));

alter table public.products drop column category;

-- Segurança (RLS)
alter table public.categories enable row level security;
create policy "categories_all_authenticated" on public.categories
  for all to authenticated using (true) with check (true);

-- =====================================================================
-- Taxa de entrega (no pedido) e observação (em cada item)
-- =====================================================================
alter table public.orders
  add column delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0);

alter table public.order_items
  add column note text;

-- Nova versão da função: agora recebe a taxa de entrega e a observação de cada item.
-- total do pedido = soma dos itens (com acréscimo) + taxa de entrega
drop function if exists public.create_order(uuid, uuid, text, text, text, numeric, jsonb);

create or replace function public.create_order(
  p_client_key   uuid,
  p_customer_id  uuid,
  p_order_type   text,
  p_address      text,
  p_payment      text,
  p_received     numeric,
  p_items        jsonb,
  p_delivery_fee numeric default 0
) returns public.orders
language plpgsql
as $$
declare
  v_order    public.orders;
  v_total    numeric(10,2) := 0;
  v_fee      numeric(10,2) := 0;
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

  if p_order_type = 'entrega' then
    v_fee := round(coalesce(p_delivery_fee, 0), 2);
    if v_fee < 0 then
      raise exception 'Taxa de entrega inválida.';
    end if;
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

  v_total := v_total + v_fee;

  if p_payment = 'dinheiro' and p_received is not null then
    if p_received < v_total then
      raise exception 'O valor recebido é menor que o total.';
    end if;
    v_change := p_received - v_total;
  end if;

  insert into public.orders (
    client_key, customer_id, customer_name, customer_phone, order_type, delivery_address,
    delivery_fee, payment_method, total, amount_received, change_amount
  ) values (
    p_client_key, p_customer_id, v_name, v_phone, p_order_type,
    case when p_order_type = 'entrega' then btrim(p_address) else null end,
    v_fee, p_payment, v_total,
    case when p_payment = 'dinheiro' then p_received else null end,
    v_change
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_item->>'quantity')::integer;
    v_extra := round(coalesce((v_item->>'extra_amount')::numeric, 0), 2);
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    insert into public.order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal, extra_amount, extra_note, note
    ) values (
      v_order.id, v_product.id, v_product.name, v_product.price, v_qty,
      (v_product.price + v_extra) * v_qty, v_extra,
      nullif(btrim(coalesce(v_item->>'extra_note', '')), ''),
      nullif(btrim(coalesce(v_item->>'note', '')), '')
    );
  end loop;

  return v_order;
end $$;

grant execute on function public.create_order(uuid, uuid, text, text, text, numeric, jsonb, numeric) to authenticated;
revoke execute on function public.create_order(uuid, uuid, text, text, text, numeric, jsonb, numeric) from anon, public;
