-- =====================================================================
-- Edição e cancelamento de pedidos (Supabase / PostgreSQL)
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- 1. Políticas de atualização e exclusão para usuários logados
create policy "orders_update_authenticated" on public.orders
  for update to authenticated using (true) with check (true);

create policy "orders_delete_authenticated" on public.orders
  for delete to authenticated using (true);

create policy "order_items_update_authenticated" on public.order_items
  for update to authenticated using (true) with check (true);

create policy "order_items_delete_authenticated" on public.order_items
  for delete to authenticated using (true);

-- 2. Função transacional para editar pedido e seus itens com segurança
create or replace function public.update_order(
  p_order_id       uuid,
  p_customer_id    uuid,
  p_customer_name  text,
  p_customer_phone text,
  p_order_type     text,
  p_address        text,
  p_payment        text,
  p_received       numeric,
  p_delivery_fee   numeric default 0,
  p_status         text default 'concluido',
  p_items          jsonb default null
) returns public.orders
language plpgsql
security definer
as $$
declare
  v_order    public.orders;
  v_total    numeric(10,2) := 0;
  v_fee      numeric(10,2) := 0;
  v_name     text;
  v_phone    text;
  v_change   numeric(10,2);
  v_item     jsonb;
  v_product  public.products;
  v_qty      integer;
  v_extra    numeric(10,2);
  v_price    numeric(10,2);
  v_pname    text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  if p_order_type = 'entrega' and length(btrim(coalesce(p_address, ''))) = 0 then
    raise exception 'Informe o endereço de entrega.';
  end if;

  v_name := coalesce(nullif(btrim(p_customer_name), ''), 'Cliente avulso');
  v_phone := nullif(btrim(p_customer_phone), '');

  if p_customer_id is not null then
    select name, phone into v_name, v_phone from public.customers where id = p_customer_id;
  end if;

  v_fee := round(coalesce(p_delivery_fee, 0), 2);
  if v_fee < 0 then
    raise exception 'Taxa de entrega inválida.';
  end if;

  -- Se enviou novos itens, recalcula e substitui os itens antigos
  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    -- Calcula o total dos itens
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_qty   := (v_item->>'quantity')::integer;
      v_extra := round(coalesce((v_item->>'extra_amount')::numeric, 0), 2);
      
      if v_qty is null or v_qty <= 0 then
        raise exception 'Quantidade inválida.';
      end if;
      if v_extra < 0 then
        raise exception 'Acréscimo inválido.';
      end if;

      -- Pode buscar o preço do produto cadastrado ou manter o do item
      if (v_item->>'product_id') is not null then
        select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
        if found then
          v_price := coalesce((v_item->>'unit_price')::numeric, v_product.price);
        else
          v_price := coalesce((v_item->>'unit_price')::numeric, 0);
        end if;
      else
        v_price := coalesce((v_item->>'unit_price')::numeric, 0);
      end if;

      v_total := v_total + (v_price + v_extra) * v_qty;
    end loop;

    -- Soma taxa se for entrega
    if p_order_type = 'entrega' then
      v_total := v_total + v_fee;
    end if;

    if p_payment = 'dinheiro' and p_received is not null then
      if p_received < v_total then
        raise exception 'O valor recebido é menor que o total.';
      end if;
      v_change := p_received - v_total;
    end if;

    -- Atualiza cabeçalho do pedido
    update public.orders
    set customer_id      = p_customer_id,
        customer_name    = v_name,
        customer_phone   = v_phone,
        order_type       = p_order_type,
        delivery_address = case when p_order_type = 'entrega' then btrim(p_address) else null end,
        delivery_fee     = case when p_order_type = 'entrega' then v_fee else 0 end,
        payment_method   = p_payment,
        total            = v_total,
        amount_received  = case when p_payment = 'dinheiro' then p_received else null end,
        change_amount    = v_change,
        status           = coalesce(p_status, 'concluido')
    where id = p_order_id
    returning * into v_order;

    -- Remove itens antigos e insere os novos
    delete from public.order_items where order_id = p_order_id;

    for v_item in select * from jsonb_array_elements(p_items) loop
      v_qty   := (v_item->>'quantity')::integer;
      v_extra := round(coalesce((v_item->>'extra_amount')::numeric, 0), 2);
      v_pname := coalesce(v_item->>'product_name', 'Item');

      if (v_item->>'product_id') is not null then
        select * into v_product from public.products where id = (v_item->>'product_id')::uuid;
        if found then
          v_pname := v_product.name;
          v_price := coalesce((v_item->>'unit_price')::numeric, v_product.price);
        else
          v_price := coalesce((v_item->>'unit_price')::numeric, 0);
        end if;
      else
        v_price := coalesce((v_item->>'unit_price')::numeric, 0);
      end if;

      insert into public.order_items (
        order_id, product_id, product_name, unit_price, quantity, subtotal,
        extra_amount, extra_note, note
      ) values (
        v_order.id,
        case when (v_item->>'product_id') is not null then (v_item->>'product_id')::uuid else null end,
        v_pname,
        v_price,
        v_qty,
        (v_price + v_extra) * v_qty,
        v_extra,
        nullif(btrim(coalesce(v_item->>'extra_note', '')), ''),
        nullif(btrim(coalesce(v_item->>'note', '')), '')
      );
    end loop;

  else
    -- Apenas atualiza dados do cabeçalho sem mexer nos itens
    -- Se a taxa mudou, ajusta a diferença no total
    v_total := v_order.total;
    if p_order_type = 'entrega' then
      v_total := v_total - v_order.delivery_fee + v_fee;
    else
      v_total := v_total - v_order.delivery_fee;
    end if;

    if p_payment = 'dinheiro' and p_received is not null then
      if p_received < v_total then
        raise exception 'O valor recebido é menor que o total.';
      end if;
      v_change := p_received - v_total;
    end if;

    update public.orders
    set customer_id      = p_customer_id,
        customer_name    = v_name,
        customer_phone   = v_phone,
        order_type       = p_order_type,
        delivery_address = case when p_order_type = 'entrega' then btrim(p_address) else null end,
        delivery_fee     = case when p_order_type = 'entrega' then v_fee else 0 end,
        payment_method   = p_payment,
        total            = v_total,
        amount_received  = case when p_payment = 'dinheiro' then p_received else null end,
        change_amount    = v_change,
        status           = coalesce(p_status, 'concluido')
    where id = p_order_id
    returning * into v_order;
  end if;

  return v_order;
end $$;

grant execute on function public.update_order to authenticated;
