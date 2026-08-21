-- Run this in Supabase SQL Editor (idempotent).
-- Required for the Invoices module.

-- Track returns
alter table public.invoices add column if not exists returned_at timestamptz;

-- Record a payment against an invoice, update customer balance + cash + ledger atomically.
-- Staff-accessible (POS); auditable server-side via cash_entries + customer_ledger.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_method text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_due numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_method not in ('cash', 'upi', 'card') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Cannot pay a returned invoice'; end if;

  v_due := v_invoice.total - v_invoice.paid;
  if p_amount > v_due then raise exception 'Payment exceeds outstanding due'; end if;

  insert into public.payments (invoice_id, method, amount)
  values (p_invoice_id, p_method, p_amount);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (current_date, p_method, 'in', p_amount, 'Payment ' || v_invoice.invoice_number, 'invoice', p_invoice_id);

  update public.invoices
  set paid = paid + p_amount,
      due = due - p_amount,
      status = case when due - p_amount <= 0 then 'paid' else 'partial' end
  where id = p_invoice_id;

  if v_invoice.customer_id is not null then
    update public.customers
    set balance = balance - p_amount, updated_at = now()
    where id = v_invoice.customer_id;

    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'payment', 'Payment on ' || v_invoice.invoice_number, p_amount,
            (select balance from public.customers where id = v_invoice.customer_id), p_invoice_id);
  end if;

  return (
    select jsonb_build_object('id', id, 'invoice_number', invoice_number,
      'total', total, 'paid', paid, 'due', due, 'status', status)
    from public.invoices where id = p_invoice_id
  );
end;
$$;

-- Returns are processed through process_return() in returns.sql.
-- The legacy return_invoice RPC (which silently wiped paid/due with no audit or
-- ledger) was removed; drop it here defensively in case it exists from older runs.
drop function if exists public.return_invoice(uuid);
