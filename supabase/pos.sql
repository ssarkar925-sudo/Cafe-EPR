-- Run this in Supabase SQL Editor (idempotent).
-- Required for the POS / Quick Sale module.

-- invoice_items can also reference a service
alter table public.invoice_items add column if not exists service_id uuid references public.services (id) on delete set null;

-- Payments (supports split cash/upi/card)
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  method text not null check (method in ('cash', 'upi', 'card')),
  amount numeric(15,2) not null default 0,
  received_at timestamptz not null default now()
);

create sequence if not exists public.invoice_number_seq;
create index if not exists idx_payments_invoice on public.payments (invoice_id);

alter table public.payments enable row level security;
create policy "payments all" on public.payments for all to authenticated using (true) with check (true);

-- Atomic sale: invoice + items + stock deduction + payments + customer balance in ONE transaction
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_paid numeric := 0;
  v_due numeric;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_rate numeric;
  v_amount numeric;
  v_stock numeric;
  v_payment jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_invoice_number := 'INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

  insert into public.invoices (invoice_number, customer_id, invoice_date, subtotal, discount, total, paid, due, status)
  values (v_invoice_number, p_customer_id, p_invoice_date, p_subtotal, p_discount, p_total, 0, 0, 'unpaid')
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 1);
    v_rate := coalesce((v_item->>'rate')::numeric, 0);
    v_amount := coalesce((v_item->>'amount')::numeric, 0);

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount);

    if v_product_id is not null then
      select stock_qty into v_stock from public.products where id = v_product_id for update;
      if v_stock is null then
        raise exception 'Product not found';
      end if;
      if v_stock < v_qty then
        raise exception 'Insufficient stock (have %, need %)', v_stock, v_qty;
      end if;
      update public.products set stock_qty = stock_qty - v_qty, updated_at = now() where id = v_product_id;
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    insert into public.payments (invoice_id, method, amount)
    values (v_invoice_id, v_payment->>'method', coalesce((v_payment->>'amount')::numeric, 0));
  end loop;

  if v_paid > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid;

  update public.invoices
  set paid = v_paid,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null and v_due > 0 then
    update public.customers
    set balance = balance + v_due, updated_at = now()
    where id = p_customer_id;
  end if;

  return (
    select jsonb_build_object(
      'id', id,
      'invoice_number', invoice_number,
      'customer_id', customer_id,
      'total', total,
      'paid', paid,
      'due', due,
      'status', status,
      'invoice_date', invoice_date
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

grant usage, select on sequence public.invoice_number_seq to authenticated;
