-- Returns & partial returns (audited, no hard deletes)
-- Adds: returns, return_items tables + process_return RPC
-- Supports full return, partial (line-level) return, and partial refund payment.

create sequence if not exists public.return_number_seq start 1;

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  return_date date not null default current_date,
  reason text,
  subtotal numeric(15,2) not null default 0,
  refund numeric(15,2) not null default 0,
  refund_method text check (refund_method in ('cash','upi','card')),
  status text not null default 'completed' check (status in ('completed','cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items (id),
  product_id uuid references public.products (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  qty numeric(15,3) not null,
  rate numeric(15,2) not null,
  amount numeric(15,2) not null
);

alter table public.invoices add column if not exists returned numeric(15,2) not null default 0;
alter table public.invoices add column if not exists refunded numeric(15,2) not null default 0;
alter table public.invoice_items add column if not exists returned_qty numeric(15,3) not null default 0;

create index if not exists returns_invoice_idx on public.returns (invoice_id);
create index if not exists returns_return_date_idx on public.returns (return_date);
create index if not exists return_items_return_idx on public.return_items (return_id);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
create policy "returns select" on public.returns for select to authenticated using (public.is_back_office());
create policy "returns insert" on public.returns for insert to authenticated with check (public.is_back_office());
create policy "returns update" on public.returns for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

create policy "return_items select" on public.return_items for select to authenticated using (public.is_back_office());
create policy "return_items insert" on public.return_items for insert to authenticated with check (public.is_back_office());
create policy "return_items update" on public.return_items for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- Process a return atomically: restock products, write return + items,
-- post refund cash entry, adjust customer balance/ledger, update invoice.
-- Back-office only; audited server-side.
create or replace function public.process_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund numeric,
  p_refund_method text default 'cash',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_ri jsonb;
  v_qty numeric;
  v_returned numeric := 0;
  v_old_due numeric;
  v_new_due numeric;
  v_delta numeric;
  v_return_id uuid;
  v_return_number text;
  v_full boolean := true;
  v_bal numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Invoice already returned'; end if;

  v_old_due := v_invoice.total - v_invoice.paid;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to return';
  end if;

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid return quantity'; end if;

    select * into v_item from public.invoice_items
    where id = (v_ri->>'invoice_item_id')::uuid and invoice_id = p_invoice_id
    for update;
    if not found then raise exception 'Invoice item not found'; end if;

    if v_qty > (v_item.qty - coalesce(v_item.returned_qty, 0)) then
      raise exception 'Cannot return more than quantity sold';
    end if;

    v_returned := v_returned + round(v_qty * v_item.rate, 2);
  end loop;

  if v_returned <= 0 then raise exception 'Return value must be positive'; end if;
  if p_refund < 0 then raise exception 'Invalid refund amount'; end if;
  if p_refund > least(v_invoice.paid, v_returned) then
    raise exception 'Refund cannot exceed the amount collected on returned items';
  end if;
  if p_refund > 0 and p_refund_method not in ('cash','upi','card') then
    raise exception 'Invalid refund method';
  end if;

  v_return_number := 'RTN-' || lpad(nextval('public.return_number_seq')::text, 4, '0');

  insert into public.returns (return_number, invoice_id, reason, subtotal, refund, refund_method, status, created_by)
  values (v_return_number, p_invoice_id, nullif(p_reason, ''), v_returned, p_refund,
          case when p_refund > 0 then p_refund_method end, 'completed', auth.uid())
  returning id into v_return_id;

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    select * into v_item from public.invoice_items where id = (v_ri->>'invoice_item_id')::uuid for update;

    insert into public.return_items (return_id, invoice_item_id, product_id, service_id, qty, rate, amount)
    values (v_return_id, v_item.id, v_item.product_id, v_item.service_id, v_qty, v_item.rate, round(v_qty * v_item.rate, 2));

    update public.invoice_items
    set returned_qty = returned_qty + v_qty
    where id = v_item.id;

    if v_item.product_id is not null then
      update public.products set stock_qty = stock_qty + v_qty, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  if p_refund > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, p_refund_method, 'out', p_refund, 'Refund ' || v_invoice.invoice_number || ' (' || v_return_number || ')', 'return', v_return_id);
  end if;

  select bool_and(coalesce(i.returned_qty, 0) >= i.qty) into v_full
  from public.invoice_items i where i.invoice_id = p_invoice_id;

  v_new_due := greatest(0, v_invoice.total - (coalesce(v_invoice.returned, 0) + v_returned) - (v_invoice.paid - p_refund));
  v_delta := v_old_due - v_new_due;

  if v_invoice.customer_id is not null and v_delta > 0 then
    update public.customers set balance = balance - v_delta, updated_at = now()
    where id = v_invoice.customer_id;
    select balance into v_bal from public.customers where id = v_invoice.customer_id;
    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'return', 'Return ' || v_return_number || ' (' || v_invoice.invoice_number || ')', v_delta, v_bal, v_return_id);
  end if;

  update public.invoices
  set returned = coalesce(returned, 0) + v_returned,
      refunded = coalesce(refunded, 0) + p_refund,
      paid = greatest(0, paid - p_refund),
      due = v_new_due,
      status = case when v_full then 'cancelled' else status end,
      returned_at = case when v_full then now() else returned_at end
  where id = p_invoice_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'return_processed', 'returns', v_return_id::text,
    'Return ' || v_return_number || ' on ' || v_invoice.invoice_number || ' (refund ' || p_refund || ')',
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'returned', v_returned, 'refund', p_refund)
  );

  return jsonb_build_object(
    'ok', true,
    'return_id', v_return_id,
    'return_number', v_return_number,
    'returned', v_returned,
    'refund', p_refund,
    'full', v_full,
    'paid', v_invoice.paid - p_refund,
    'due', v_new_due,
    'status', case when v_full then 'cancelled' else v_invoice.status end
  );
end;
$$;
