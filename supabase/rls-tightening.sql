-- RLS tightening: restrict financial/audit/back-office tables to admin/manager.
-- Staff keep operational tables (invoices, payments, customers, products, quick_sales,
-- settings reads, profiles reads). Staff-facing financial reads are served by
-- security-definer RPCs below. Financial tables have NO direct DELETE policy; all
-- writes go through security-definer RPCs (which bypass RLS).

-- Role helpers.
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- ============ Financial / back-office tables: read+write back-office, NO delete ============

alter table public.transactions enable row level security;
drop policy if exists "transactions all" on public.transactions;
drop policy if exists "transactions back_office" on public.transactions;
create policy "transactions select" on public.transactions for select to authenticated using (public.is_back_office());
create policy "transactions insert" on public.transactions for insert to authenticated with check (public.is_back_office());
create policy "transactions update" on public.transactions for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "cash_entries all" on public.cash_entries;
drop policy if exists "cash_entries back_office" on public.cash_entries;
create policy "cash_entries select" on public.cash_entries for select to authenticated using (public.is_back_office());
create policy "cash_entries insert" on public.cash_entries for insert to authenticated with check (public.is_back_office());
create policy "cash_entries update" on public.cash_entries for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "expenses all" on public.expenses;
drop policy if exists "expenses back_office" on public.expenses;
create policy "expenses select" on public.expenses for select to authenticated using (public.is_back_office());
create policy "expenses insert" on public.expenses for insert to authenticated with check (public.is_back_office());
create policy "expenses update" on public.expenses for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "customer_ledger all" on public.customer_ledger;
drop policy if exists "customer_ledger back_office" on public.customer_ledger;
create policy "customer_ledger select" on public.customer_ledger for select to authenticated using (public.is_back_office());
create policy "customer_ledger insert" on public.customer_ledger for insert to authenticated with check (public.is_back_office());
create policy "customer_ledger update" on public.customer_ledger for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "settlements all" on public.settlements;
drop policy if exists "settlements back_office" on public.settlements;
create policy "settlements select" on public.settlements for select to authenticated using (public.is_back_office());
create policy "settlements insert" on public.settlements for insert to authenticated with check (public.is_back_office());
create policy "settlements update" on public.settlements for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "returns all" on public.returns;
drop policy if exists "returns back_office" on public.returns;
create policy "returns select" on public.returns for select to authenticated using (public.is_back_office());
create policy "returns insert" on public.returns for insert to authenticated with check (public.is_back_office());
create policy "returns update" on public.returns for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "return_items all" on public.return_items;
drop policy if exists "return_items back_office" on public.return_items;
create policy "return_items select" on public.return_items for select to authenticated using (public.is_back_office());
create policy "return_items insert" on public.return_items for insert to authenticated with check (public.is_back_office());
create policy "return_items update" on public.return_items for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "opening_balances all" on public.opening_balances;
create policy "opening_balances select" on public.opening_balances for select to authenticated using (public.is_back_office());
create policy "opening_balances insert" on public.opening_balances for insert to authenticated with check (public.is_back_office());
create policy "opening_balances update" on public.opening_balances for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "closings all" on public.closings;
create policy "closings select" on public.closings for select to authenticated using (public.is_back_office());
create policy "closings insert" on public.closings for insert to authenticated with check (public.is_back_office());
create policy "closings update" on public.closings for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "closing_balances all" on public.closing_balances;
create policy "closing_balances select" on public.closing_balances for select to authenticated using (public.is_back_office());
create policy "closing_balances insert" on public.closing_balances for insert to authenticated with check (public.is_back_office());
create policy "closing_balances update" on public.closing_balances for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- Business master data (AEPS banks/portals, UPI QRs): back-office only.
drop policy if exists "aeps_banks all" on public.aeps_banks;
drop policy if exists "aeps_banks back_office" on public.aeps_banks;
create policy "aeps_banks back_office" on public.aeps_banks
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "aeps_portals all" on public.aeps_portals;
drop policy if exists "aeps_portals back_office" on public.aeps_portals;
create policy "aeps_portals back_office" on public.aeps_portals
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "upi_merchant_qrs all" on public.upi_merchant_qrs;
drop policy if exists "upi_merchant_qrs back_office" on public.upi_merchant_qrs;
create policy "upi_merchant_qrs back_office" on public.upi_merchant_qrs
  for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- ============ Operational tables with direct REST writes (kept for staff) ============

-- invoices / invoice_items / payments / quick_sales / quick_sale_items: staff read;
-- direct writes back-office only (the app writes through security-definer RPCs);
-- NO delete policy so paid/reference rows cannot be hard-deleted over REST.
drop policy if exists "invoices all" on public.invoices;
create policy "invoices select" on public.invoices for select to authenticated using (true);
create policy "invoices insert" on public.invoices for insert to authenticated with check (public.is_back_office());
create policy "invoices update" on public.invoices for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "invoice_items all" on public.invoice_items;
create policy "invoice_items select" on public.invoice_items for select to authenticated using (true);
create policy "invoice_items insert" on public.invoice_items for insert to authenticated with check (public.is_back_office());
create policy "invoice_items update" on public.invoice_items for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "payments all" on public.payments;
create policy "payments select" on public.payments for select to authenticated using (true);
create policy "payments insert" on public.payments for insert to authenticated with check (public.is_back_office());
create policy "payments update" on public.payments for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "quick_sales all" on public.quick_sales;
create policy "quick_sales select" on public.quick_sales for select to authenticated using (true);
create policy "quick_sales insert" on public.quick_sales for insert to authenticated with check (public.is_back_office());
create policy "quick_sales update" on public.quick_sales for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "quick_sale_items all" on public.quick_sale_items;
create policy "quick_sale_items select" on public.quick_sale_items for select to authenticated using (true);
create policy "quick_sale_items insert" on public.quick_sale_items for insert to authenticated with check (public.is_back_office());
create policy "quick_sale_items update" on public.quick_sale_items for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- profiles: block self role/is_active changes (back-office may manage).
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles
  for update to authenticated
  using (true)
  with check (
    public.is_back_office()
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
      and is_active = (select p.is_active from public.profiles p where p.id = auth.uid())
    )
  );

-- settings: read all, write back-office only.
drop policy if exists "settings all" on public.settings;
create policy "settings select" on public.settings for select to authenticated using (true);
create policy "settings insert" on public.settings for insert to authenticated with check (public.is_back_office());
create policy "settings update" on public.settings for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "settings delete" on public.settings for delete to authenticated using (public.is_back_office());

-- payment_methods: read all (POS), write back-office (settings).
drop policy if exists "payment_methods all" on public.payment_methods;
create policy "payment_methods select" on public.payment_methods for select to authenticated using (true);
create policy "payment_methods insert" on public.payment_methods for insert to authenticated with check (public.is_back_office());
create policy "payment_methods update" on public.payment_methods for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "payment_methods delete" on public.payment_methods for delete to authenticated using (public.is_back_office());

-- payment_instruments: read/insert all (POS adds at till), update/delete back-office.
drop policy if exists "payment_instruments all" on public.payment_instruments;
create policy "payment_instruments select" on public.payment_instruments for select to authenticated using (true);
create policy "payment_instruments insert" on public.payment_instruments for insert to authenticated with check (true);
create policy "payment_instruments update" on public.payment_instruments for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "payment_instruments delete" on public.payment_instruments for delete to authenticated using (public.is_back_office());

-- audit_logs: append-only. INSERT by anyone (client+server), SELECT back-office.
drop policy if exists "audit_logs all" on public.audit_logs;
drop policy if exists "audit_logs insert" on public.audit_logs;
drop policy if exists "audit_logs select" on public.audit_logs;
drop policy if exists "audit_logs update" on public.audit_logs;
drop policy if exists "audit_logs delete" on public.audit_logs;
create policy "audit_logs insert" on public.audit_logs
  for insert to authenticated with check (true);
create policy "audit_logs select" on public.audit_logs
  for select to authenticated using (public.is_back_office());

-- ============ Storage: customer photos authenticated-only; avatars owner-only ============
drop policy if exists "customer-photos read" on storage.objects;
create policy "customer-photos read" on storage.objects
  for select to authenticated using (bucket_id = 'customer-photos');

drop policy if exists "avatars update" on storage.objects;
create policy "avatars update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'user-' || auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'user-' || auth.uid()::text);

drop policy if exists "avatars delete" on storage.objects;
create policy "avatars delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'user-' || auth.uid()::text);

-- ============ Security-definer RPCs serving staff-facing financial reads ============

-- Dashboard: cash entries (last N days), expenses (last N days), transactions (last N days).
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
    where entry_date >= p_from
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

revoke all on function public.get_dashboard_financials(date) from public, anon;
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

revoke all on function public.get_customer_ledger(uuid) from public, anon;
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

revoke all on function public.get_customer_transactions(uuid) from public, anon;
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

revoke all on function public.get_customer_returns(uuid) from public, anon;
grant execute on function public.get_customer_returns(uuid) to authenticated;

-- Business (AEPS/DMT/UPI) receipt: full transaction + related names (back-office only).
create or replace function public.get_transaction_receipt(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
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

revoke all on function public.get_transaction_receipt(uuid) from public, anon;
grant execute on function public.get_transaction_receipt(uuid) to authenticated;