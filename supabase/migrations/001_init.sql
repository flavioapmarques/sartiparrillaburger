-- =====================================================================
-- PDV Restaurante - criação do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Função para atualizar updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Produtos ----------
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  category    text,
  price       numeric(10,2) not null check (price >= 0),
  description text,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create index products_active_idx on public.products (active);

-- ---------- Clientes ----------
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  phone      text,
  address    text,
  complement text,
  reference  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------- Pedidos ----------
create sequence public.order_number_seq start 1;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     bigint not null unique default nextval('public.order_number_seq'),
  client_key       uuid not null unique,  -- evita pedido duplicado (duplo clique)
  customer_id      uuid references public.customers(id) on delete set null,
  customer_name    text not null default 'Cliente avulso',  -- cópia no momento da venda
  order_type       text not null check (order_type in ('retirada', 'entrega')),
  delivery_address text,                                    -- cópia no momento da venda
  payment_method   text not null check (payment_method in ('pix', 'dinheiro', 'debito', 'credito')),
  total            numeric(10,2) not null check (total >= 0),
  amount_received  numeric(10,2) check (amount_received >= 0),
  change_amount    numeric(10,2) check (change_amount >= 0),
  status           text not null default 'concluido' check (status in ('concluido', 'cancelado')),
  created_at       timestamptz not null default now(),
  constraint delivery_requires_address check (
    order_type = 'retirada' or length(btrim(coalesce(delivery_address, ''))) > 0
  )
);
create index orders_created_at_idx on public.orders (created_at desc);

-- ---------- Itens do pedido ----------
create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text not null,                                  -- nome no momento da venda
  unit_price   numeric(10,2) not null check (unit_price >= 0), -- preço no momento da venda
  quantity     integer not null check (quantity > 0),
  subtotal     numeric(10,2) not null check (subtotal >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------- Função que grava o pedido de forma segura ----------
-- Os preços vêm da tabela products (não do navegador) e tudo é gravado
-- numa única transação. Se o mesmo client_key chegar de novo, devolve o
-- pedido que já existe em vez de criar outro.
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
  v_change   numeric(10,2);
  v_item     jsonb;
  v_product  public.products;
  v_qty      integer;
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
    select name into v_name from public.customers where id = p_customer_id;
    if not found then
      raise exception 'Cliente não encontrado.';
    end if;
  end if;

  -- total calculado com os preços atuais do cadastro
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and active;
    if not found then
      raise exception 'Um dos produtos do pedido não está mais disponível.';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida.';
    end if;
    v_total := v_total + v_product.price * v_qty;
  end loop;

  if p_payment = 'dinheiro' and p_received is not null then
    if p_received < v_total then
      raise exception 'O valor recebido é menor que o total.';
    end if;
    v_change := p_received - v_total;
  end if;

  insert into public.orders (
    client_key, customer_id, customer_name, order_type, delivery_address,
    payment_method, total, amount_received, change_amount
  ) values (
    p_client_key, p_customer_id, v_name, p_order_type,
    case when p_order_type = 'entrega' then btrim(p_address) else null end,
    p_payment, v_total,
    case when p_payment = 'dinheiro' then p_received else null end,
    v_change
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order.id, v_product.id, v_product.name, v_product.price, v_qty, v_product.price * v_qty);
  end loop;

  return v_order;
end $$;

-- ---------- Segurança (RLS) ----------
-- Só usuários logados (role "authenticated") acessam os dados.
-- Visitantes sem login (role "anon") não enxergam nada.
alter table public.products    enable row level security;
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

create policy "products_all_authenticated" on public.products
  for all to authenticated using (true) with check (true);

create policy "customers_all_authenticated" on public.customers
  for all to authenticated using (true) with check (true);

-- Pedidos e itens: pode consultar e criar; não pode editar nem apagar
-- (preserva o histórico de vendas).
create policy "orders_select_authenticated" on public.orders
  for select to authenticated using (true);
create policy "orders_insert_authenticated" on public.orders
  for insert to authenticated with check (true);

create policy "order_items_select_authenticated" on public.order_items
  for select to authenticated using (true);
create policy "order_items_insert_authenticated" on public.order_items
  for insert to authenticated with check (true);

grant usage, select on sequence public.order_number_seq to authenticated;
grant execute on function public.create_order(uuid, uuid, text, text, text, numeric, jsonb) to authenticated;
revoke execute on function public.create_order(uuid, uuid, text, text, text, numeric, jsonb) from anon, public;

-- ---------- Imagens dos produtos (Storage) ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product_images_read" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "product_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
create policy "product_images_update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');
create policy "product_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');
