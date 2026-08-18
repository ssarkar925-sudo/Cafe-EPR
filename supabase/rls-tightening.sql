-- RLS tightening: restrict financial/audit/back-office tables to admin/manager.
-- Staff keep operational tables (invoices, payments, customers, products, quick_sales, settings, profiles).
-- Staff-facing financial reads are served by security-definer RPCs below.

-- Role helper: is the current user admin or manager?
create or replace function public.is_back_office()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role in ('admin', 'manager') from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- ============ Replace broad "for all" policies on financial/audit tables ============

drop policy if exists "transactions all" on public.transactions;
create policy "transactions back_office" on public.transactions
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "cash_entries all" on public.cash_entries;
create policy "cash_entries back_office" on public.cash_entries
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "expenses all" on public.expenses;
create policy "expenses back_office" on public.expenses
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "customer_ledger all" on public.customer_ledger;
create policy "customer_ledger back_office" on public.customer_ledger
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "settlements all" on public.settlements;
create policy "settlements back_office" on public.settlements
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "returns all" on public.returns;
create policy "returns back_office" on public.returns
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "return_items all" on public.return_items;
create policy "return_items back_office" on public.return_items
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "aeps_banks all" on public.aeps_banks;
create policy "aeps_banks back_office" on public.aeps_banks
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "aeps_portals all" on public.aeps_portals;
create policy "aeps_portals back_office" on public.aeps_portals
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "upi_merchant_qrs all" on public.upi_merchant_qrs;
create policy "upi_merchant_qrs back_office" on public.upi_merchant_qrs
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- audit_logs: staff can INSERT their own actions, but read/write/delete is back-office only.
drop policy if exists "audit_logs all" on public.audit_logs;
create policy "audit_logs insert" on public.audit_logs
  for insert to authenticated with check (true);
create policy "audit_logs select" on public.audit_logs
  for select to authenticated using (public.is_back_office());
create policy "audit_logs update" on public.audit_logs
  for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "audit_logs delete" on public.audit_logs
  for delete to authenticated using (public.is_back_office());

-- ============ Security-definer RPCs serving staff-facing financial reads ============

-- Dashboard: cash entries, expenses (last N days), transactions (last N days).
create or replace function public.get_dashboard_financials(p_from date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cash jsonb;
  v_exp jsonb;
  v_txn jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_cash
  from (
    select method, direction, amount, entry_date
    from public.cash_entries
    order by entry_date desc
  ) x;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_exp
  from (
    select expense_date, amount, status
    from public.expenses
    where expense_date >= p_from
    order by expense_date desc
  ) x;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_txn
  from (
    select t.id, t.transaction_number, t.service_type, t.direction, t.transaction_date,
           t.amount, t.service_fee, t.portal_commission, t.status, t.customer_mobile,
           case when t.customer_id is null then null
                else jsonb_build_object('name', c.name)
           end as customers
    from public.transactions t
    left join public.customers c on c.id = t.customer_id
    where t.transaction_date >= p_from
    order by t.transaction_date desc
    limit 500
  ) x;

  return jsonb_build_object('cash_entries', v_cash, 'expenses', v_exp, 'transactions', v_txn);
end;
$$;

grant execute on function public.get_dashboard_financials(date) to authenticated;

-- Customer ledger entries (customer pages are staff-accessible).
create or replace function public.get_customer_ledger(p_customer_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x)
    from (
      select entry_date, type, description, debit, credit, balance_after
      from public.customer_ledger
      where customer_id = p_customer_id
      order by created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_customer_ledger(uuid) to authenticated;

-- Customer business transactions.
create or replace function public.get_customer_transactions(p_customer_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x)
    from (
      select transaction_number, service_type, transaction_date, amount,
             service_fee, portal_commission, direction, status
      from public.transactions
      where customer_id = p_customer_id
      order by created_at desc
      limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_customer_transactions(uuid) to authenticated;

-- Customer returns (used by the staff-accessible customer profile).
create or replace function public.get_customer_returns(p_customer_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(x)
    from (
      select r.id, r.return_number, r.return_date, r.reason, r.subtotal,
             r.refund, r.refund_method, r.status,
             jsonb_build_object('invoice_number', i.invoice_number) as invoices
      from public.returns r
      join public.invoices i on i.id = r.invoice_id
      where i.customer_id = p_customer_id
      order by r.created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_customer_returns(uuid) to authenticated;

-- Business (AEPS/DMT/UPI) receipt: full transaction + related names.
create or replace function public.get_transaction_receipt(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select to_jsonb(t)
         || jsonb_build_object(
              'customers', case when t.customer_id is null then null else to_jsonb(c) end,
              'banks', case when t.bank_id is null then null else to_jsonb(b) end,
              'portals', case when t.portal_id is null then null else to_jsonb(p) end,
              'merchant_qrs', case when t.merchant_qr_id is null then null else to_jsonb(q) end
            )
  into v_row
  from public.transactions t
  left join public.customers c on c.id = t.customer_id
  left join public.aeps_banks b on b.id = t.bank_id
  left join public.aeps_portals p on p.id = t.portal_id
  left join public.upi_merchant_qrs q on q.id = t.merchant_qr_id
  where t.id = p_id;

  if v_row is null then return null; end if;
  return v_row;
end;
$$;

grant execute on function public.get_transaction_receipt(uuid) to authenticated;
