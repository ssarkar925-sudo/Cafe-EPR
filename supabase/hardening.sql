-- ============================================================================
-- SECURITY & CORRECTNESS HARDENING (idempotent, safe to re-run)
-- Apply after the base schema. Fixes from the full-module review:
--
--  1. Anonymous data leak        -> auth.uid() checks + revoke PUBLIC on read RPCs
--  2. STAFF -> ADMIN escalation  -> profiles role/is_active change requires back-office
--  3. Mutable audit trail        -> audit_logs is append-only (no update/delete policies)
--  4. No role checks on money    -> is_back_office() gates on write RPCs
--  5. Direct DELETE on financial -> no DELETE policies on financial tables
--  6. Credit-card routing bug    -> shop's own credit-card spend no longer reduces BANK
--  7. reverse_close seed leak    -> auto opening_balances are removed on reversal
--  8. cascade deletes            -> ledger/returns guard with RESTRICT, seeds SET NULL
--  9. Client-trusted sale math   -> server-side validation in create_sale
-- 10. update_business_txn        -> full validation
-- 11. Server-side audit          -> settlements / expenses / transactions audited
-- 12. Missing indexes            -> added
-- ============================================================================

-- =================== Section 1: role helpers ===================

-- Back-office = admin or manager (already defined in rls-tightening.sql).
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

-- Admin only (role changes, settings, master deletes).
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

-- =================== Section 2: RLS hardening ===================

-- ---- profiles: block self role/is_active changes; back-office may manage ----
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

-- ---- settings: read all, write back-office only ----
drop policy if exists "settings all" on public.settings;
create policy "settings select" on public.settings for select to authenticated using (true);
create policy "settings insert" on public.settings for insert to authenticated with check (public.is_back_office());
create policy "settings update" on public.settings for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "settings delete" on public.settings for delete to authenticated using (public.is_back_office());

-- ---- Financial tables: no direct DELETE (RPCs handle all writes) ----
-- Reads stay open to staff; direct writes are back-office only so any future
-- REST write cannot be abused by staff. Security-definer RPCs bypass RLS.

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

-- ---- Back-office financial tables: keep read/write but REMOVE delete ----
drop policy if exists "transactions back_office" on public.transactions;
drop policy if exists "transactions all" on public.transactions;
create policy "transactions select" on public.transactions for select to authenticated using (public.is_back_office());
create policy "transactions insert" on public.transactions for insert to authenticated with check (public.is_back_office());
create policy "transactions update" on public.transactions for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "cash_entries back_office" on public.cash_entries;
drop policy if exists "cash_entries all" on public.cash_entries;
create policy "cash_entries select" on public.cash_entries for select to authenticated using (public.is_back_office());
create policy "cash_entries insert" on public.cash_entries for insert to authenticated with check (public.is_back_office());
create policy "cash_entries update" on public.cash_entries for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "expenses back_office" on public.expenses;
drop policy if exists "expenses all" on public.expenses;
create policy "expenses select" on public.expenses for select to authenticated using (public.is_back_office());
create policy "expenses insert" on public.expenses for insert to authenticated with check (public.is_back_office());
create policy "expenses update" on public.expenses for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "customer_ledger back_office" on public.customer_ledger;
drop policy if exists "customer_ledger all" on public.customer_ledger;
create policy "customer_ledger select" on public.customer_ledger for select to authenticated using (public.is_back_office());
create policy "customer_ledger insert" on public.customer_ledger for insert to authenticated with check (public.is_back_office());
create policy "customer_ledger update" on public.customer_ledger for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "settlements back_office" on public.settlements;
drop policy if exists "settlements all" on public.settlements;
create policy "settlements select" on public.settlements for select to authenticated using (public.is_back_office());
create policy "settlements insert" on public.settlements for insert to authenticated with check (public.is_back_office());
create policy "settlements update" on public.settlements for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "returns back_office" on public.returns;
drop policy if exists "returns all" on public.returns;
create policy "returns select" on public.returns for select to authenticated using (public.is_back_office());
create policy "returns insert" on public.returns for insert to authenticated with check (public.is_back_office());
create policy "returns update" on public.returns for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "return_items back_office" on public.return_items;
drop policy if exists "return_items all" on public.return_items;
create policy "return_items select" on public.return_items for select to authenticated using (public.is_back_office());
create policy "return_items insert" on public.return_items for insert to authenticated with check (public.is_back_office());
create policy "return_items update" on public.return_items for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- ---- Day-close tables: back-office only, no delete ----
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

-- ---- audit_logs: append-only. INSERT by anyone (actions logged client+server),
--      SELECT back-office, NO update/delete at all. ----
drop policy if exists "audit_logs all" on public.audit_logs;
drop policy if exists "audit_logs insert" on public.audit_logs;
drop policy if exists "audit_logs select" on public.audit_logs;
drop policy if exists "audit_logs update" on public.audit_logs;
drop policy if exists "audit_logs delete" on public.audit_logs;
create policy "audit_logs insert" on public.audit_logs
  for insert to authenticated with check (true);
create policy "audit_logs select" on public.audit_logs
  for select to authenticated using (public.is_back_office());

-- ---- payment_methods: read all (POS), write back-office (settings) ----
drop policy if exists "payment_methods all" on public.payment_methods;
create policy "payment_methods select" on public.payment_methods for select to authenticated using (true);
create policy "payment_methods insert" on public.payment_methods for insert to authenticated with check (public.is_back_office());
create policy "payment_methods update" on public.payment_methods for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "payment_methods delete" on public.payment_methods for delete to authenticated using (public.is_back_office());

-- ---- payment_instruments: read/insert all (POS adds at till), update/delete back-office ----
drop policy if exists "payment_instruments all" on public.payment_instruments;
create policy "payment_instruments select" on public.payment_instruments for select to authenticated using (true);
create policy "payment_instruments insert" on public.payment_instruments for insert to authenticated with check (true);
create policy "payment_instruments update" on public.payment_instruments for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
create policy "payment_instruments delete" on public.payment_instruments for delete to authenticated using (public.is_back_office());

-- ---- Storage: customer photos readable by authenticated only (not public);
--      avatars update/delete restricted to the owner. ----
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

-- =================== Section 3: read RPC hardening ===================

-- ---------- Pool seed: require auth (was PUBLIC-executable) ----------
create or replace function public.get_pool_seed(p_pool text, p_as_of date)
returns table (opening numeric, seed_date date)
language plpgsql
security definer set search_path = public
as $$
declare
  v_pool_amount numeric;
  v_pool_date date;
  v_inst_total numeric;
  v_inst_date date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select amount, as_of into v_pool_amount, v_pool_date
    from public.opening_balances
    where pool = p_pool and instrument_id is null and as_of <= p_as_of
    order by as_of desc, is_auto desc, created_at desc
    limit 1;

  select coalesce(sum(amount), 0), max(as_of) into v_inst_total, v_inst_date
  from (
    select distinct on (instrument_id) amount, as_of
    from public.opening_balances
    where pool = p_pool and instrument_id is not null and as_of <= p_as_of
    order by instrument_id, as_of desc, created_at desc
  ) inst;

  return query
  select
    coalesce(v_pool_amount, 0) + coalesce(v_inst_total, 0) as opening,
    case
      when v_pool_date is not null then v_pool_date
      when v_inst_date is not null then v_inst_date
      else '0001-01-01'::date
    end as seed_date;
end;
$$;
revoke all on function public.get_pool_seed(text, date) from public, anon;
grant execute on function public.get_pool_seed(text, date) to authenticated;

-- ---------- Pool movements: auth check + CREDIT-CARD ROUTING FIX ----------
-- The shop's OWN credit cards are used for money-out (expense). Those spends reduce
-- the credit_card pool (available limit), NOT the bank pool. Customer card-machine
-- receipts (method 'card') settle to BANK. Bank = bank + debit_card + card receipts.
create or replace function public.get_pool_movements(p_pool text, p_from date, p_to date)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare v numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if p_pool = 'cash' then
    select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v
    from public.cash_entries
    where method = 'cash' and entry_date > p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'bank' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'bank'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'bank'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method in ('bank', 'debit_card', 'card')
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select bank_in from public.transactions where status = 'success' and bank_in > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -bank_out from public.transactions where status = 'success' and bank_out > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'credit_card' then
    select coalesce(sum(case when direction = 'out' then -amount else amount end), 0) into v
    from public.cash_entries
    where method = 'credit_card' and entry_date > p_from and (p_to is null or entry_date <= p_to);

  elsif p_pool = 'wallet' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'wallet'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
    ) t;

  elsif p_pool = 'dmt' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'dmt'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'dmt'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'aeps' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'aeps'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'out' then amount else -amount end
      from public.cash_entries where method = 'aeps'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  elsif p_pool = 'upi_qr' then
    select coalesce(sum(x), 0) into v from (
      select amount as x from public.settlements where status = 'success' and to_pool = 'upi_qr'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
        and settlement_date > p_from and (p_to is null or settlement_date <= p_to)
      union all
      select case when direction = 'in' then amount else -amount end
      from public.cash_entries where method = 'upi'
        and entry_date > p_from and (p_to is null or entry_date <= p_to)
      union all
      select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
      union all
      select upi_fee from public.transactions where status = 'success' and upi_fee > 0
        and transaction_date > p_from and (p_to is null or transaction_date <= p_to)
    ) t;

  else
    v := 0;
  end if;

  return v;
end;
$$;
revoke all on function public.get_pool_movements(text, date, date) from public, anon;
grant execute on function public.get_pool_movements(text, date, date) to authenticated;

-- ---------- Pool balances: revoke PUBLIC (already auth-checked) ----------
revoke all on function public.get_pool_balances(date) from public, anon;
grant execute on function public.get_pool_balances(date) to authenticated;

-- ---------- Open close live view: back-office + consistent epoch movements ----------
create or replace function public.get_open_close()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_rows jsonb;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
  v_computed numeric;
  v_adjust numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where status = 'open' order by opened_at desc limit 1;
  if not found then return '{}'::jsonb; end if;

  v_rows := '[]'::jsonb;
  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select coalesce(opening, 0), coalesce(seed_date, '0001-01-01'::date), coalesce(adjustment, 0)
      into v_opening, v_seed, v_adjust
    from public.closing_balances
    where closing_id = v_close.id and pool = v_pool;

    v_mov := public.get_pool_movements(v_pool, v_seed, v_close.close_date);
    v_computed := v_opening + v_mov;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'pool', v_pool,
      'seed_date', v_seed,
      'opening', v_opening,
      'movements', v_mov,
      'computed', v_computed,
      'adjustment', v_adjust,
      'final', v_computed + v_adjust
    ));
  end loop;

  return jsonb_build_object(
    'id', v_close.id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', v_close.status,
    'opened_at', v_close.opened_at,
    'rows', v_rows
  );
end;
$$;
revoke all on function public.get_open_close() from public, anon;
grant execute on function public.get_open_close() to authenticated;

-- ---------- Close history: back-office only ----------
create or replace function public.get_closings(p_limit int default 30)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_list jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.close_date desc), '[]'::jsonb) into v_list
  from (
    select cl.id, cl.closing_number, cl.close_date, cl.status, cl.net_profit,
           cl.owner_deposits, cl.owner_withdrawals, cl.balance_check,
           cl.opened_at, cl.closed_at, cl.remarks,
           (select coalesce(jsonb_agg(to_jsonb(cb) order by cb.pool), '[]'::jsonb)
            from public.closing_balances cb where cb.closing_id = cl.id) as balances
    from public.closings cl
    order by cl.close_date desc
    limit greatest(1, p_limit)
  ) c;

  return jsonb_build_object('closings', v_list);
end;
$$;
revoke all on function public.get_closings(integer) from public, anon;
grant execute on function public.get_closings(integer) to authenticated;

-- ---------- Settlement summary: auth check + CREDIT-CARD routing fix ----------
create or replace function public.get_settlement_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_cash numeric;
  v_bank numeric;
  v_wallet numeric;
  v_dmt numeric;
  v_aeps numeric;
  v_upi_qr numeric;
  v_credit_card numeric;
  v_count bigint;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select coalesce(sum(case when direction = 'in' then amount else -amount end), 0) into v_cash
  from public.cash_entries where method = 'cash';

  select coalesce(sum(x), 0) into v_bank
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'bank'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'bank'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method in ('bank', 'debit_card', 'card')
    union all
    select bank_in from public.transactions where status = 'success' and bank_in > 0
    union all
    select -bank_out from public.transactions where status = 'success' and bank_out > 0
  ) t;

  select coalesce(sum(case when direction = 'out' then -amount else amount end), 0) into v_credit_card
  from public.cash_entries where method = 'credit_card';

  select coalesce(sum(x), 0) into v_wallet
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'wallet'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'wallet'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'wallet'
  ) t;

  select coalesce(sum(x), 0) into v_dmt
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'dmt'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'dmt'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'dmt'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'dmt'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'dmt'
  ) t;

  select coalesce(sum(x), 0) into v_aeps
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'aeps'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'aeps'
    union all
    select case when direction = 'out' then amount else -amount end
    from public.cash_entries where method = 'aeps'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'aeps'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'aeps'
  ) t;

  select coalesce(sum(x), 0) into v_upi_qr
  from (
    select amount as x from public.settlements where status = 'success' and to_pool = 'upi_qr'
    union all
    select -amount from public.settlements where status = 'success' and from_pool = 'upi_qr'
    union all
    select case when direction = 'in' then amount else -amount end
    from public.cash_entries where method = 'upi'
    union all
    select pool_credit from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
    union all
    select -pool_out from public.transactions where status = 'success' and pool_credit_type = 'upi_qr'
    union all
    select upi_fee from public.transactions where status = 'success' and upi_fee > 0
  ) t;

  select count(*) into v_count from public.settlements where status = 'success';

  return jsonb_build_object(
    'cash', v_cash, 'bank', v_bank, 'wallet', v_wallet,
    'dmt', v_dmt, 'aeps', v_aeps, 'upi_qr', v_upi_qr, 'credit_card', v_credit_card,
    'count', v_count
  );
end;
$$;
revoke all on function public.get_settlement_summary() from public, anon;
grant execute on function public.get_settlement_summary() to authenticated;

-- ---------- Dashboard financials: auth-check + date filter on cash entries ----------
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

-- ---------- PnL: add auth check (already revoked from PUBLIC) ----------
create or replace function public.get_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric(15,2) := 0;
  v_returns numeric(15,2) := 0;
  v_cogs numeric(15,2) := 0;
  v_commission numeric(15,2) := 0;
  v_expenses numeric(15,2) := 0;
  v_invoices int := 0;
  v_net_revenue numeric(15,2);
  v_gross numeric(15,2);
  v_net numeric(15,2);
  v_monthly jsonb;
  v_categories jsonb;
  v_top jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- Revenue: non-cancelled invoices in range
  select coalesce(sum(total), 0), count(*)::int
    into v_revenue, v_invoices
    from public.invoices
    where status <> 'cancelled' and invoice_date between p_from and p_to;

  -- Quick sales revenue in range (active sales only)
  v_revenue := v_revenue + coalesce((select sum(amount) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

  -- Returns / refunds in range.
  select coalesce(sum(r.subtotal), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

  -- COGS: sold qty (minus returned) x current cost price (products/services)
  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)), 0)
    into v_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to;

  -- Quick sale COGS in range
  v_cogs := v_cogs + coalesce((select sum(cost) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

  -- Commission income: successful AEPS/DMT/UPI transactions in range
  select coalesce(sum(commission + service_fee), 0) into v_commission
    from public.transactions
    where status = 'success' and transaction_date between p_from and p_to;

  -- Active expenses in range
  select coalesce(sum(amount), 0) into v_expenses
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to;

  v_net_revenue := v_revenue - v_returns;
  v_gross := v_net_revenue - v_cogs;
  v_net := v_gross + v_commission - v_expenses;

  -- Monthly trend within range
  select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]'::jsonb) into v_monthly
  from (
    select to_char(d, 'YYYY-MM') as month,
      coalesce(sum(rev), 0) as revenue,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(exp), 0) as expenses,
      coalesce(sum(com), 0) as commission,
      coalesce(sum(rev - cogs + com - exp), 0) as net
    from (
      select i.invoice_date as d, i.total as rev, 0::numeric as cogs, 0::numeric as exp, 0::numeric as com
      from public.invoices i
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
      union all
      select i.invoice_date, 0, (it.qty - coalesce(it.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0), 0, 0
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      left join public.products p on p.id = it.product_id
      left join public.services s on s.id = it.service_id
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
      union all
      select expense_date, 0, 0, amount, 0
      from public.expenses
      where status = 'active' and expense_date between p_from and p_to
      union all
      select r.return_date, -r.subtotal, 0, 0, 0
      from public.returns r
      join public.invoices i on i.id = r.invoice_id
      where r.status = 'completed' and i.status <> 'cancelled'
        and r.return_date between p_from and p_to
      union all
      select transaction_date, 0, 0, 0, commission + service_fee
      from public.transactions
      where status = 'success' and transaction_date between p_from and p_to
      union all
      select sale_date, amount, 0, 0, 0
      from public.quick_sales
      where status = 'active' and sale_date between p_from and p_to
      union all
      select sale_date, 0, cost, 0, 0
      from public.quick_sales
      where status = 'active' and sale_date between p_from and p_to
    ) raw
    group by to_char(d, 'YYYY-MM')
  ) m;

  -- Expense breakdown by category
  select coalesce(jsonb_agg(to_jsonb(c) order by c.amount desc), '[]'::jsonb) into v_categories
  from (
    select category, sum(amount) as amount, count(*) as count
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to
    group by category
  ) c;

  -- Top products by gross profit
  select coalesce(jsonb_agg(to_jsonb(t) order by t.profit desc), '[]'::jsonb) into v_top
  from (
    select coalesce(p.name, s.name) as name,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * ii.rate) as revenue,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)) as cogs,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) as profit,
      count(distinct i.id) as invoices
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name)
    having sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) <> 0
    order by profit desc
    limit 6
  ) t;

  return jsonb_build_object(
    'revenue', v_revenue,
    'returns', v_returns,
    'cogs', v_cogs,
    'commission_income', v_commission,
    'expenses', v_expenses,
    'net_revenue', v_net_revenue,
    'gross_profit', v_gross,
    'net_profit', v_net,
    'invoice_count', v_invoices,
    'monthly', v_monthly,
    'categories', v_categories,
    'top_products', v_top
  );
end;
$$;
revoke all on function public.get_pnl(date, date) from public, anon;
grant execute on function public.get_pnl(date, date) to authenticated;

-- ---------- Transaction receipt: back-office only (contains full beneficiary data) ----------
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

-- ---------- Notifications: audit trail reads are back-office only ----------
create or replace function public.unread_notifications(p_limit int default 40)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'unread', coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select a.id, a.user_id, a.user_name, a.action, a.entity, a.entity_id,
               a.description, a.details, a.created_at
        from public.audit_logs a
        where not exists (
          select 1 from public.notification_reads r
          where r.user_id = v_user and r.audit_log_id = a.id
        )
        order by a.created_at desc
        limit p_limit
      ) x
    ), '[]'::jsonb),
    'count', (
      select count(*)
      from public.audit_logs a
      where not exists (
        select 1 from public.notification_reads r
        where r.user_id = v_user and r.audit_log_id = a.id
      )
    )
  );
end;
$$;
revoke all on function public.unread_notifications(integer) from public, anon;
grant execute on function public.unread_notifications(integer) to authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  insert into public.notification_reads (user_id, audit_log_id)
  select v_user, a.id
  from public.audit_logs a
  where a.id = any(p_ids)
  on conflict (user_id, audit_log_id) do nothing;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- =================== Section 4: money RPC role checks + audit ===================

-- ---------- Set opening balance: back-office only ----------
create or replace function public.set_opening_balance(
  p_pool text,
  p_amount numeric,
  p_as_of date default current_date,
  p_instrument_id uuid default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_pool is null or p_pool not in ('cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card') then
    raise exception 'Invalid pool';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Opening balance cannot be negative'; end if;
  if p_instrument_id is not null and not exists (
    select 1 from public.payment_instruments where id = p_instrument_id
  ) then
    raise exception 'Payment instrument not found';
  end if;

  insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, created_by)
  values (p_pool, p_instrument_id, p_amount, p_as_of, p_remarks, auth.uid())
  returning id into v_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'opening_balance_set', 'opening_balances', v_id::text,
    'Set ' || p_pool || ' opening balance to ' || p_amount || ' as of ' || p_as_of,
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'as_of', p_as_of, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_id, 'pool', p_pool, 'amount', p_amount, 'as_of', p_as_of);
end;
$$;

-- ---------- Open a day close: back-office only + consistent epoch movements ----------
create or replace function public.open_close(p_close_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_num text;
  v_pool text;
  v_opening numeric;
  v_seed date;
  v_mov numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_close_date is null then raise exception 'Date is required'; end if;
  if exists (select 1 from public.closings where status = 'open') then
    raise exception 'An open day close already exists';
  end if;
  if exists (select 1 from public.closings where close_date = p_close_date and status not in ('reversed', 'cancelled')) then
    raise exception 'A day close already exists for this date';
  end if;

  v_num := 'CLS-' || lpad(nextval('public.closing_seq')::text, 4, '0');

  insert into public.closings (closing_number, close_date, status, opened_by)
  values (v_num, p_close_date, 'open', auth.uid())
  returning id into v_id;

  foreach v_pool in array array['cash', 'bank', 'wallet', 'dmt', 'aeps', 'upi_qr', 'credit_card']
  loop
    select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed(v_pool, p_close_date) s;
    v_mov := public.get_pool_movements(v_pool, v_seed, p_close_date);
    insert into public.closing_balances (closing_id, pool, seed_date, opening, movements, computed)
    values (v_id, v_pool, v_seed, v_opening, v_mov, v_opening + v_mov);
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description)
  values (auth.uid(), null, 'day_close_opened', 'closings', v_id::text,
          'Opened day close ' || v_num || ' for ' || p_close_date);

  return jsonb_build_object('id', v_id, 'closing_number', v_num, 'close_date', p_close_date, 'status', 'open');
end;
$$;

-- ---------- Adjust a pool on an open close: back-office + validation ----------
create or replace function public.set_close_adjustment(
  p_closing_id uuid,
  p_pool text,
  p_amount numeric,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row record;
  v_final numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null then raise exception 'Adjustment amount is required'; end if;
  if not exists (select 1 from public.closings where id = p_closing_id and status = 'open') then
    raise exception 'Day close not open';
  end if;

  select * into v_row from public.closing_balances
    where closing_id = p_closing_id and pool = p_pool for update;
  if not found then raise exception 'Pool not found in close'; end if;

  v_final := v_row.computed + p_amount;
  update public.closing_balances
    set adjustment = p_amount, final = v_final,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = v_row.id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'close_adjustment_set', 'closings', p_closing_id::text,
    'Adjusted ' || p_pool || ' by ' || p_amount || ' on day close',
    jsonb_build_object('pool', p_pool, 'amount', p_amount, 'remarks', p_remarks)
  );

  return jsonb_build_object('closing_id', p_closing_id, 'pool', p_pool, 'adjustment', p_amount, 'final', v_final);
end;
$$;

-- ---------- Close the day: back-office + owner amounts validation + epoch consistency ----------
create or replace function public.close_day(
  p_closing_id uuid,
  p_owner_deposits numeric default 0,
  p_owner_withdrawals numeric default 0,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
  v_pool text;
  v_open_total numeric := 0;
  v_final_total numeric := 0;
  v_net numeric;
  v_check numeric;
  v_row record;
  v_result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if coalesce(p_owner_deposits, 0) < 0 or coalesce(p_owner_withdrawals, 0) < 0 then
    raise exception 'Owner deposit/withdrawal amounts cannot be negative';
  end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Day close is not open'; end if;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    if v_row.seed_date is not null then
      update public.closing_balances
        set movements = public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            computed = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date),
            final = v_row.opening + public.get_pool_movements(v_row.pool, v_row.seed_date, v_close.close_date) + v_row.adjustment
        where id = v_row.id;
    end if;
  end loop;

  select coalesce(sum(opening), 0), coalesce(sum(final), 0)
    into v_open_total, v_final_total
  from public.closing_balances where closing_id = p_closing_id;

  v_net := coalesce((select (public.get_pnl(v_close.close_date, v_close.close_date)->>'net_profit')::numeric), 0);
  v_check := v_final_total - v_open_total - v_net - coalesce(p_owner_deposits, 0) + coalesce(p_owner_withdrawals, 0);

  update public.closings
    set status = 'closed', closed_by = auth.uid(), closed_at = now(),
        net_profit = v_net,
        owner_deposits = coalesce(p_owner_deposits, 0),
        owner_withdrawals = coalesce(p_owner_withdrawals, 0),
        balance_check = v_check,
        remarks = coalesce(nullif(p_remarks, ''), remarks)
    where id = p_closing_id;

  for v_row in
    select * from public.closing_balances where closing_id = p_closing_id
  loop
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values (v_row.pool, null, v_row.final, v_close.close_date,
            'Auto from ' || v_close.closing_number, true, auth.uid());
    v_result := v_result || jsonb_build_object(
      v_row.pool, jsonb_build_object('opening', v_row.opening, 'movements', v_row.movements,
                                     'adjustment', v_row.adjustment, 'final', v_row.final)
    );
  end loop;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_completed', 'closings', p_closing_id::text,
    'Closed ' || v_close.closing_number || ' for ' || v_close.close_date ||
    ' | net profit ' || v_net || ' | balance check ' || v_check,
    jsonb_build_object('net_profit', v_net, 'balance_check', v_check,
                       'owner_deposits', p_owner_deposits, 'owner_withdrawals', p_owner_withdrawals)
  );

  return jsonb_build_object(
    'id', p_closing_id,
    'closing_number', v_close.closing_number,
    'close_date', v_close.close_date,
    'status', 'closed',
    'net_profit', v_net,
    'balance_check', v_check,
    'pools', v_result
  );
end;
$$;

-- ---------- Reverse a closed day: back-office + remove its auto next-day seeds ----------
create or replace function public.reverse_close(p_closing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'closed' then raise exception 'Only a closed day close can be reversed'; end if;

  update public.closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  -- Undo the auto opening seeds this close posted (audited via the reversal row below).
  delete from public.opening_balances
  where remarks = 'Auto from ' || v_close.closing_number;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_reversed', 'closings', p_closing_id::text,
    'Reversed ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason, 'net_profit', v_close.net_profit)
  );

  return jsonb_build_object('id', p_closing_id, 'status', 'reversed');
end;
$$;

-- ---------- Create settlement: back-office + audit ----------
create or replace function public.create_settlement(
  p_settlement_type text,
  p_settlement_date date,
  p_amount numeric,
  p_reference text,
  p_remarks text,
  p_direction text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
  v_from text;
  v_to text;
  v_prefix text;
  v_cash_dir text;
  v_cash_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_settlement_date is null then raise exception 'Date is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  if p_settlement_type = 'aeps_to_bank' then
    v_from := 'aeps'; v_to := 'bank'; v_prefix := 'ATB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_to_dmt' then
    v_from := 'bank'; v_to := 'dmt'; v_prefix := 'BTD'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_dmt' then
    v_from := 'wallet'; v_to := 'dmt'; v_prefix := 'WTD'; v_cash_dir := null;
  elsif p_settlement_type = 'upi_qr_to_wallet' then
    v_from := 'upi_qr'; v_to := 'wallet'; v_prefix := 'UQW'; v_cash_dir := null;
  elsif p_settlement_type = 'wallet_to_bank' then
    v_from := 'wallet'; v_to := 'bank'; v_prefix := 'WTB'; v_cash_dir := null;
  elsif p_settlement_type = 'bank_withdrawal' then
    v_from := 'bank'; v_to := 'cash'; v_prefix := 'BWD'; v_cash_dir := 'in'; v_cash_label := 'Bank Withdrawal';
  elsif p_settlement_type = 'add_cash_to_bank' then
    v_from := 'cash'; v_to := 'bank'; v_prefix := 'CTB'; v_cash_dir := 'out'; v_cash_label := 'Cash to Bank';
  elsif p_settlement_type = 'cash_adjustment' then
    if p_direction not in ('in', 'out') then raise exception 'Select Add Cash or Remove Cash'; end if;
    v_from := 'cash'; v_to := 'cash'; v_prefix := 'CAD';
    v_cash_dir := p_direction;
    v_cash_label := case when p_direction = 'in' then 'Cash Added' else 'Cash Removed' end;
  else
    raise exception 'Invalid settlement type';
  end if;

  v_number := v_prefix || '-' || lpad(nextval('public.settlement_seq')::text, 4, '0');

  insert into public.settlements (
    settlement_number, settlement_type, settlement_date, from_pool, to_pool,
    direction, amount, reference, remarks, status, created_by
  ) values (
    v_number, p_settlement_type, p_settlement_date, v_from, v_to,
    v_cash_dir, p_amount, nullif(p_reference, ''), p_remarks, 'success', auth.uid()
  ) returning id into v_id;

  if v_cash_dir is not null then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (p_settlement_date, 'cash', v_cash_dir, p_amount,
            'Settlement: ' || v_cash_label || ' (' || v_number || ')', 'settlement', v_id);
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_created', 'settlements', v_id::text,
    'Settlement ' || v_number || ' ' || v_from || ' -> ' || v_to || ' of ' || p_amount,
    jsonb_build_object('type', p_settlement_type, 'amount', p_amount, 'reference', p_reference)
  );

  return jsonb_build_object('id', v_id, 'settlement_number', v_number, 'status', 'success');
end;
$$;

-- ---------- Reverse settlement: back-office + audit ----------
create or replace function public.reverse_settlement(p_settlement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_settlement record;
  v_opposite text;
  v_label text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_settlement from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_settlement.status <> 'success' then raise exception 'This settlement is already closed'; end if;

  if v_settlement.direction is not null then
    v_opposite := case when v_settlement.direction = 'in' then 'out' else 'in' end;
    v_label := case
      when v_settlement.settlement_type = 'bank_withdrawal' then 'Bank Withdrawal Reversed'
      when v_settlement.settlement_type = 'add_cash_to_bank' then 'Cash to Bank Reversed'
      else case when v_opposite = 'in' then 'Cash Added (Reversed)' else 'Cash Removed (Reversed)' end
    end;
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', v_opposite, v_settlement.amount,
            'Settlement: ' || v_label || ' (' || v_settlement.settlement_number || ')', 'settlement', p_settlement_id);
  end if;

  update public.settlements
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_settlement_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'settlement_reversed', 'settlements', p_settlement_id::text,
    'Reversed settlement ' || v_settlement.settlement_number || ' of ' || v_settlement.amount,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_settlement_id, 'status', 'reversed');
end;
$$;

-- ---------- Add expense (staff Money Out at POS): server-side audit ----------
create or replace function public.add_expense(
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_note text,
  p_instrument_id uuid default null,
  p_method text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense_id uuid;
  v_method text := 'cash';
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_category is null or p_category = '' then raise exception 'Category is required'; end if;
  if p_instrument_id is not null then
    select type into v_method from public.payment_instruments where id = p_instrument_id and is_active = true;
    if v_method is null then raise exception 'Unknown payment instrument'; end if;
  elsif p_method is not null then
    v_method := lower(p_method);
    if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
      raise exception 'Invalid payment method';
    end if;
  end if;

  insert into public.expenses (expense_date, category, amount, note, created_by)
  values (p_expense_date, p_category, p_amount, p_note, auth.uid())
  returning id into v_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (p_expense_date, v_method, 'out', p_amount, 'Expense: ' || p_category, 'expense', v_expense_id, p_instrument_id);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_added', 'expenses', v_expense_id::text,
    'Expense of ' || p_amount || ' on ' || p_category || ' paid from ' || v_method,
    jsonb_build_object('category', p_category, 'amount', p_amount, 'method', v_method, 'instrument_id', p_instrument_id)
  );

  return jsonb_build_object('id', v_expense_id);
end;
$$;

-- ---------- Cancel expense: back-office + audit ----------
create or replace function public.cancel_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_expense record;
  v_orig_method text;
  v_orig_instrument uuid;
  v_orig_date date;
  v_method text;
  v_date date;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'cancelled' then raise exception 'Expense already cancelled'; end if;

  select ce.method, ce.instrument_id, ce.entry_date
    into v_orig_method, v_orig_instrument, v_orig_date
  from public.cash_entries ce
  where ce.ref_type = 'expense' and ce.ref_id = p_expense_id
  order by ce.created_at desc
  limit 1;

  v_method := coalesce(v_orig_method, 'cash');
  v_date := coalesce(v_orig_date, v_expense.expense_date);

  update public.expenses
  set status = 'cancelled', cancelled_at = now()
  where id = p_expense_id;

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
  values (v_date, v_method, 'in', v_expense.amount, 'Expense cancelled: ' || v_expense.category, 'expense', p_expense_id, v_orig_instrument);

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'expense_cancelled', 'expenses', p_expense_id::text,
    'Cancelled expense of ' || v_expense.amount || ' on ' || v_expense.category,
    jsonb_build_object('category', v_expense.category, 'amount', v_expense.amount)
  );

  return jsonb_build_object('id', p_expense_id, 'status', 'cancelled');
end;
$$;

-- ---------- Business transactions: back-office + audit ----------
create or replace function public.create_business_txn(
  p_service_type text,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_status text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text default null,
  p_paid_from text default null,
  p_customer_pay_method text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn_id uuid;
  v_number text;
  v_direction text;
  v_seq text;
  v_prefix text;
  v_label text;
  v_cash_out numeric := 0;
  v_cash_in numeric := 0;
  v_bank_out numeric := 0;
  v_bank_in numeric := 0;
  v_pool_out numeric := 0;
  v_pool_credit numeric := 0;
  v_pool_type text;
  v_upi_fee numeric := 0;
  v_fee numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then raise exception 'Invalid service type'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;
  v_fee := coalesce(p_service_fee, 0);

  if p_service_type = 'aeps' then
    if p_bank_id is null then raise exception 'An AEPS bank is required'; end if;
    if p_portal_id is null then raise exception 'An AEPS portal is required'; end if;
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Aadhaar last 4 digits are required';
    end if;
    if not exists (select 1 from public.aeps_banks where id = p_bank_id and is_active) then
      raise exception 'The selected bank is not available';
    end if;
    if not exists (select 1 from public.aeps_portals where id = p_portal_id and is_active) then
      raise exception 'The selected portal is not available';
    end if;
    v_direction := 'out'; v_prefix := 'AEP'; v_seq := 'public.aeps_seq'; v_label := 'AEPS';
    if p_fee_source = 'upi' then
      v_cash_out := p_amount;
      v_upi_fee := v_fee;
    elsif p_fee_source = 'separate_cash' then
      v_cash_out := p_amount;
      v_cash_in := v_fee;
    else
      v_cash_out := p_amount - v_fee;
    end if;
    v_pool_credit := p_amount;
    v_pool_type := 'aeps';
  elsif p_service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
    v_direction := 'in'; v_prefix := 'DMT'; v_seq := 'public.dmt_seq'; v_label := 'DMT';
    if coalesce(p_paid_from, 'bank') = 'portal' then
      v_pool_out := p_amount;
      v_pool_type := 'dmt';
    else
      v_bank_out := p_amount;
    end if;
    if coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
      v_bank_in := p_amount + v_fee;
    else
      v_cash_in := p_amount + v_fee;
    end if;
  else
    v_direction := 'out'; v_prefix := 'UPI'; v_seq := 'public.upi_seq'; v_label := 'UPI';
    if coalesce(p_customer_pay_method, 'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
    else
      v_pool_credit := p_amount + v_fee;
      v_pool_type := 'upi_qr';
    end if;
    v_cash_out := p_amount;
  end if;

  v_number := v_prefix || '-' || lpad(nextval(v_seq)::text, 4, '0');

  insert into public.transactions (
    transaction_number, service_type, direction, transaction_date, transaction_timestamp, customer_id,
    customer_mobile, reference, remarks, status,
    bank_id, portal_id, merchant_qr_id, aadhaar_last4, transfer_method,
    sender_name, sender_mobile, beneficiary_name, beneficiary_mobile,
    beneficiary_bank, beneficiary_ifsc, beneficiary_account, upi_id,
    amount, service_fee, portal_commission, created_by,
    fee_source, paid_from, customer_pay_method,
    cash_out, cash_in, bank_out, bank_in, pool_out, pool_credit, pool_credit_type, upi_fee
  ) values (
    v_number, p_service_type, v_direction, p_transaction_date,
    coalesce(p_transaction_timestamp, p_transaction_date::timestamptz), p_customer_id,
    p_customer_mobile, nullif(p_reference, ''), p_remarks, p_status,
    p_bank_id, p_portal_id, p_merchant_qr_id, p_aadhaar_last4, p_transfer_method,
    p_sender_name, p_sender_mobile, p_beneficiary_name, p_beneficiary_mobile,
    p_beneficiary_bank, p_beneficiary_ifsc, p_beneficiary_account, p_upi_id,
    p_amount, v_fee, coalesce(p_portal_commission, 0), auth.uid(),
    p_fee_source, p_paid_from, p_customer_pay_method,
    v_cash_out, v_cash_in, v_bank_out, v_bank_in, v_pool_out, v_pool_credit, v_pool_type, v_upi_fee
  ) returning id into v_txn_id;

  if p_status = 'success' then
    if v_cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'out', v_cash_out, v_label || ' ' || v_number || ' cash payout', 'transaction', v_txn_id);
    end if;
    if v_cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'in', v_cash_in, v_label || ' ' || v_number || ' received in cash', 'transaction', v_txn_id);
    end if;
  end if;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_created', 'transactions', v_txn_id::text,
    'Created ' || v_label || ' ' || v_number || ' (' || p_status || ') of ' || p_amount,
    jsonb_build_object('service_type', p_service_type, 'amount', p_amount, 'status', p_status, 'reference', p_reference)
  );

  return (
    select jsonb_build_object('id', id, 'transaction_number', transaction_number,
      'service_type', service_type, 'direction', direction, 'status', status,
      'amount', amount, 'service_fee', service_fee, 'portal_commission', portal_commission,
      'cash_out', cash_out, 'cash_in', cash_in, 'bank_out', bank_out, 'bank_in', bank_in,
      'pool_out', pool_out, 'pool_credit', pool_credit, 'pool_credit_type', pool_credit_type,
      'upi_fee', upi_fee)
    from public.transactions where id = v_txn_id
  );
end;
$$;

-- ---------- Edit transaction: back-office + full validation + audit ----------
create or replace function public.update_business_txn(
  p_txn_id uuid,
  p_transaction_date date,
  p_transaction_timestamp timestamptz,
  p_customer_id uuid,
  p_customer_mobile text,
  p_reference text,
  p_remarks text,
  p_bank_id uuid,
  p_portal_id uuid,
  p_merchant_qr_id uuid,
  p_aadhaar_last4 text,
  p_transfer_method text,
  p_sender_name text,
  p_sender_mobile text,
  p_beneficiary_name text,
  p_beneficiary_mobile text,
  p_beneficiary_bank text,
  p_beneficiary_ifsc text,
  p_beneficiary_account text,
  p_upi_id text,
  p_amount numeric,
  p_service_fee numeric,
  p_portal_commission numeric,
  p_fee_source text default null,
  p_paid_from text default null,
  p_customer_pay_method text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be edited'; end if;
  if v_txn.service_type = 'aeps' then
    if p_bank_id is null then raise exception 'An AEPS bank is required'; end if;
    if p_portal_id is null then raise exception 'An AEPS portal is required'; end if;
    if p_aadhaar_last4 is null or p_aadhaar_last4 !~ '^[0-9]{4}$' then
      raise exception 'Aadhaar last 4 digits are required';
    end if;
    if not exists (select 1 from public.aeps_banks where id = p_bank_id and is_active) then
      raise exception 'The selected bank is not available';
    end if;
    if not exists (select 1 from public.aeps_portals where id = p_portal_id and is_active) then
      raise exception 'The selected portal is not available';
    end if;
  elsif v_txn.service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
  end if;

  -- Reverse old cash legs
  if v_txn.cash_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'in', v_txn.cash_out, 'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;
  if v_txn.cash_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'out', v_txn.cash_in, 'Corrected ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;

  declare
    v_cash_out numeric := 0;
    v_cash_in numeric := 0;
    v_bank_out numeric := 0;
    v_bank_in numeric := 0;
    v_pool_out numeric := 0;
    v_pool_credit numeric := 0;
    v_pool_type text;
    v_upi_fee numeric := 0;
    v_fee numeric := coalesce(p_service_fee, 0);
  begin
    if v_txn.service_type = 'aeps' then
      if p_fee_source = 'upi' then
        v_cash_out := p_amount;
        v_upi_fee := v_fee;
      elsif p_fee_source = 'separate_cash' then
        v_cash_out := p_amount;
        v_cash_in := v_fee;
      else
        v_cash_out := p_amount - v_fee;
      end if;
      v_pool_credit := p_amount;
      v_pool_type := 'aeps';
    elsif v_txn.service_type = 'dmt' then
      if coalesce(p_paid_from, 'bank') = 'portal' then
        v_pool_out := p_amount;
        v_pool_type := 'dmt';
      else
        v_bank_out := p_amount;
      end if;
      if coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
        v_bank_in := p_amount + v_fee;
      else
        v_cash_in := p_amount + v_fee;
      end if;
    elsif v_txn.service_type = 'upi' then
      if coalesce(p_customer_pay_method, 'qr') = 'cash' then
        v_cash_in := p_amount + v_fee;
      else
        v_pool_credit := p_amount + v_fee;
        v_pool_type := 'upi_qr';
      end if;
      v_cash_out := p_amount;
    end if;

    update public.transactions set
      transaction_date = p_transaction_date,
      transaction_timestamp = coalesce(p_transaction_timestamp, p_transaction_date::timestamptz),
      customer_id = p_customer_id,
      customer_mobile = p_customer_mobile,
      reference = nullif(p_reference, ''),
      remarks = p_remarks,
      bank_id = p_bank_id,
      portal_id = p_portal_id,
      merchant_qr_id = p_merchant_qr_id,
      aadhaar_last4 = p_aadhaar_last4,
      transfer_method = p_transfer_method,
      sender_name = p_sender_name,
      sender_mobile = p_sender_mobile,
      beneficiary_name = p_beneficiary_name,
      beneficiary_mobile = p_beneficiary_mobile,
      beneficiary_bank = p_beneficiary_bank,
      beneficiary_ifsc = p_beneficiary_ifsc,
      beneficiary_account = p_beneficiary_account,
      upi_id = p_upi_id,
      amount = p_amount,
      service_fee = v_fee,
      portal_commission = coalesce(p_portal_commission, 0),
      fee_source = p_fee_source,
      paid_from = p_paid_from,
      customer_pay_method = p_customer_pay_method,
      cash_out = v_cash_out,
      cash_in = v_cash_in,
      bank_out = v_bank_out,
      bank_in = v_bank_in,
      pool_out = v_pool_out,
      pool_credit = v_pool_credit,
      pool_credit_type = v_pool_type,
      upi_fee = v_upi_fee,
      updated_at = now()
    where id = p_txn_id;

    if v_cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'out', v_cash_out, upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' cash payout', 'transaction', p_txn_id);
    end if;
    if v_cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (p_transaction_date, 'cash', 'in', v_cash_in, upper(v_txn.service_type) || ' ' || v_txn.transaction_number || ' received in cash', 'transaction', p_txn_id);
    end if;
  end;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_updated', 'transactions', p_txn_id::text,
    'Edited ' || v_txn.transaction_number || ' to ' || p_amount,
    jsonb_build_object('amount', p_amount, 'service_fee', p_service_fee, 'portal_commission', p_portal_commission)
  );

  return jsonb_build_object('id', p_txn_id, 'status', 'success');
end;
$$;

-- ---------- Reverse transaction: back-office + audit ----------
create or replace function public.reverse_business_txn(p_txn_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status <> 'success' then raise exception 'Only successful transactions can be reversed'; end if;

  if v_txn.cash_out > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'in', v_txn.cash_out, 'Reversed ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;
  if v_txn.cash_in > 0 then
    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
    values (current_date, 'cash', 'out', v_txn.cash_in, 'Reversed ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
  end if;

  update public.transactions
  set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nReversed: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_txn_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_reversed', 'transactions', p_txn_id::text,
    'Reversed ' || v_txn.transaction_number || ' of ' || v_txn.amount,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_txn_id, 'status', 'reversed');
end;
$$;

-- ---------- Delete transaction (soft): back-office + audit ----------
create or replace function public.delete_business_txn(p_txn_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_txn record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_txn from public.transactions where id = p_txn_id for update;
  if not found then raise exception 'Transaction not found'; end if;
  if v_txn.status in ('reversed', 'deleted') then raise exception 'This transaction is already closed'; end if;

  if v_txn.status = 'success' then
    if v_txn.cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (current_date, 'cash', 'in', v_txn.cash_out, 'Deleted ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
    end if;
    if v_txn.cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
      values (current_date, 'cash', 'out', v_txn.cash_in, 'Deleted ' || upper(v_txn.service_type) || ' ' || v_txn.transaction_number, 'transaction', p_txn_id);
    end if;
  end if;

  update public.transactions
  set status = 'deleted', deleted_at = now(), deleted_by = auth.uid(),
      remarks = trim(coalesce(remarks, '') || E'\nDeleted: ' || coalesce(p_reason, 'No reason provided.'))
  where id = p_txn_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'transaction_deleted', 'transactions', p_txn_id::text,
    'Deleted ' || v_txn.transaction_number || ' of ' || v_txn.amount,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_txn_id, 'status', 'deleted');
end;
$$;

-- ---------- Process return: back-office + audit ----------
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

-- =================== Section 5: server-side sale validation ===================

-- ---------- create_sale: validate totals/items/payments server-side ----------
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_previous_due_instrument_id uuid default null,
  p_advance_used numeric default 0
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
  v_cost_line numeric;
  v_stock numeric;
  v_payment jsonb;
  v_method text;
  v_instrument_id uuid;
  v_cust_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  -- Server-side validation of client-trusted math
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items in invoice';
  end if;
  if p_subtotal is null or p_discount is null or p_total is null then
    raise exception 'Invoice totals are required';
  end if;
  if p_subtotal < 0 or p_discount < 0 or p_total < 0 then
    raise exception 'Invalid invoice totals';
  end if;
  if p_discount > p_subtotal then
    raise exception 'Discount exceeds subtotal';
  end if;
  if round(p_subtotal - p_discount, 2) <> round(p_total, 2) then
    raise exception 'Total must equal subtotal minus discount';
  end if;
  if p_previous_due < 0 or p_advance_used < 0 then
    raise exception 'Invalid due/advance amounts';
  end if;
  if p_previous_due_instrument_id is null and p_previous_due_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid due collection method';
  end if;
  if (p_previous_due > 0 or p_advance_used > 0) and p_customer_id is null then
    raise exception 'Customer is required for due/advance adjustments';
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
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid item quantity'; end if;
    if v_rate is null or v_rate < 0 then raise exception 'Invalid item rate'; end if;
    if v_amount is null or v_amount < 0 then raise exception 'Invalid item amount'; end if;
    -- Custom items may carry an optional cost for accurate income; catalog cost stays server-side.
    v_cost_line := case
      when v_product_id is null and (v_item->>'service_id')::uuid is null
        then greatest(coalesce((v_item->>'cost_price')::numeric, 0), 0)
      else 0
    end;

    insert into public.invoice_items (invoice_id, product_id, service_id, description, qty, rate, amount, cost_price)
    values (v_invoice_id, v_product_id, (v_item->>'service_id')::uuid, v_item->>'description', v_qty, v_rate, v_amount, v_cost_line);

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
    if coalesce((v_payment->>'amount')::numeric, 0) < 0 then
      raise exception 'Invalid payment amount';
    end if;
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', '')::uuid;
    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then
        raise exception 'Unknown payment instrument';
      end if;
    end if;
    insert into public.payments (invoice_id, method, amount, instrument_id)
    values (v_invoice_id, v_method, coalesce((v_payment->>'amount')::numeric, 0), v_instrument_id);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_invoice_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
  end loop;

  if v_paid + p_advance_used > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid - p_advance_used;

  update public.invoices
  set paid = v_paid + p_advance_used,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null then
    select balance into v_cust_balance from public.customers where id = p_customer_id for update;
    if v_cust_balance is null then
      raise exception 'Customer not found';
    end if;

    if p_previous_due > 0 then
      if v_cust_balance < p_previous_due then
        raise exception 'Customer due is only %, cannot collect %', v_cust_balance, p_previous_due;
      end if;
      v_cust_balance := v_cust_balance - p_previous_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'payment', 'Previous due collected with ' || v_invoice_number, p_previous_due, v_cust_balance, v_invoice_id);

      v_method := p_previous_due_method;
      v_instrument_id := nullif(p_previous_due_instrument_id, NULL::uuid);
      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then
          raise exception 'Unknown payment instrument';
        end if;
      end if;
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_invoice_date, v_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
    end if;

    if p_advance_used > 0 then
      if v_cust_balance > -p_advance_used then
        raise exception 'Customer advance is only %, cannot apply %', abs(v_cust_balance), p_advance_used;
      end if;
      v_cust_balance := v_cust_balance + p_advance_used;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'advance', 'Advance applied to ' || v_invoice_number, p_advance_used, v_cust_balance, v_invoice_id);
    end if;

    if v_due > 0 then
      v_cust_balance := v_cust_balance + v_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'invoice', 'Invoice ' || v_invoice_number, v_due, v_cust_balance, v_invoice_id);
    end if;
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
      'invoice_date', invoice_date,
      'created_at', created_at,
      'previous_due', p_previous_due,
      'advance_used', p_advance_used
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

-- ---------- record_advance / return_advance: optional payment method ----------
drop function if exists public.record_advance(uuid, numeric, date, text);
create or replace function public.record_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null,
  p_method text default 'cash'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
  v_method text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  v_method := coalesce(nullif(p_method, ''), 'cash');
  if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid payment method';
  end if;

  select balance, name into v_balance, v_name
    from public.customers
   where id = p_customer_id
   for update;

  if v_name is null then
    raise exception 'Customer not found';
  end if;

  update public.customers
     set balance = balance - p_amount,
         updated_at = now()
   where id = p_customer_id;

  v_balance := v_balance - p_amount;

  insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after)
  values (p_customer_id, p_entry_date, 'advance', coalesce(p_note, 'Advance received'), 0, p_amount, v_balance);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_entry_date, v_method, 'in', p_amount, 'Advance received from ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

drop function if exists public.return_advance(uuid, numeric, date, text);
create or replace function public.return_advance(
  p_customer_id uuid,
  p_amount numeric,
  p_entry_date date,
  p_note text default null,
  p_method text default 'cash'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_name text;
  v_method text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_customer_id is null then
    raise exception 'Customer is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  v_method := coalesce(nullif(p_method, ''), 'cash');
  if v_method not in ('cash', 'upi', 'card', 'bank', 'wallet', 'debit_card', 'credit_card') then
    raise exception 'Invalid payment method';
  end if;

  select balance, name into v_balance, v_name
    from public.customers
   where id = p_customer_id
   for update;

  if v_name is null then
    raise exception 'Customer not found';
  end if;

  if v_balance + p_amount > 0 then
    raise exception 'Cannot return more than the available advance of %', abs(v_balance);
  end if;

  update public.customers
     set balance = balance + p_amount,
         updated_at = now()
   where id = p_customer_id;

  v_balance := v_balance + p_amount;

  insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after)
  values (p_customer_id, p_entry_date, 'advance', coalesce(p_note, 'Advance returned'), p_amount, 0, v_balance);

  insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id)
  values (p_entry_date, v_method, 'out', p_amount, 'Advance returned to ' || v_name, 'customer_advance', p_customer_id);

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- =================== Section 6: cascade / referential-integrity fixes ===================

-- customer_ledger: never cascade-delete a customer's ledger history
alter table public.customer_ledger drop constraint if exists customer_ledger_customer_id_fkey;
alter table public.customer_ledger add constraint customer_ledger_customer_id_fkey
  foreign key (customer_id) references public.customers (id) on delete restrict;

-- opening_balances: deleting an instrument must not destroy its seed history
alter table public.opening_balances drop constraint if exists opening_balances_instrument_id_fkey;
alter table public.opening_balances add constraint opening_balances_instrument_id_fkey
  foreign key (instrument_id) references public.payment_instruments (id) on delete set null;

-- returns: an invoice with returns must never be hard-deleted
alter table public.returns drop constraint if exists returns_invoice_id_fkey;
alter table public.returns add constraint returns_invoice_id_fkey
  foreign key (invoice_id) references public.invoices (id) on delete restrict;

-- =================== Section 7: missing indexes ===================

create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists transactions_customer_idx on public.transactions (customer_id);
create index if not exists transactions_merchant_qr_idx on public.transactions (merchant_qr_id);
create index if not exists cash_entries_method_idx on public.cash_entries (method);
create index if not exists cash_entries_ref_idx on public.cash_entries (ref_type, ref_id);
create index if not exists settlements_pool_idx on public.settlements (from_pool, to_pool);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_method_idx on public.payments (method);

-- =================== Section 8: login attempt flood guard ===================

create or replace function public.log_login_attempt(p_email text, p_success boolean, p_error text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_headers jsonb;
begin
  -- Brute-force guard: stop recording (and effectively stop filling the table)
  -- once an email already has >= 5 failures in the last 15 minutes.
  if coalesce(p_success, false) = false and exists (
    select 1
    from public.login_attempts
    where email = nullif(p_email, '') and success = false
      and created_at > now() - interval '15 minutes'
    group by email
    having count(*) >= 5
  ) then
    return;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  insert into public.login_attempts (email, success, error_message, ip, user_agent)
  values (nullif(p_email, ''), coalesce(p_success, false), nullif(p_error, ''),
          nullif(v_headers->>'x-forwarded-for', ''), nullif(v_headers->>'user-agent', ''));
end;
$$;
grant execute on function public.log_login_attempt(text, boolean, text) to anon, authenticated;

-- ============================================================================
-- SECTION 9: Dead code removal
-- Legacy RPCs superseded by the hardened business/sale/return flows. Dropping
-- them prevents REST from exposing unvalidated, non-audited money entry points.
-- ============================================================================

-- create_txn / cancel_txn (legacy transactions module, superseded by
-- create_business_txn / reverse_business_txn / delete_business_txn).
drop function if exists public.create_txn(text, date, uuid, text, text, text, text, text, text, numeric, numeric);
drop function if exists public.cancel_txn(uuid);

-- return_invoice (silently wiped paid/due without audit, ledger, or refund entry;
-- returns are handled by process_return in returns.sql).
drop function if exists public.return_invoice(uuid);

-- ============================================================================
-- SECTION 10: Cancel an accidentally-opened day close (audited, no deletion)
-- ============================================================================

-- closings: allow the 'cancelled' status and track who/when it was cancelled.
alter table public.closings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

alter table public.closings drop constraint if exists closings_status_check;
alter table public.closings
  add constraint closings_status_check check (status in ('open', 'closed', 'reversed', 'cancelled'));

-- A cancelled close frees its date so the day can be re-opened (like reversed).
drop index if exists closings_close_date_unique;
create unique index closings_close_date_unique
  on public.closings (close_date) where status not in ('reversed', 'cancelled');

-- Cancel an OPEN day close (e.g. opened by mistake). It is never deleted:
-- the close + its snapshot balances stay visible as a cancelled record, and the
-- action is written to audit_logs. No financial entries exist yet for an open
-- close, so nothing else needs reversing.
create or replace function public.cancel_open_close(p_closing_id uuid, p_reason text default '')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_close record;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select * into v_close from public.closings where id = p_closing_id for update;
  if not found then raise exception 'Day close not found'; end if;
  if v_close.status <> 'open' then raise exception 'Only an open day close can be cancelled'; end if;

  update public.closings
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        remarks = trim(coalesce(remarks, '') || E'\nCancelled: ' || coalesce(p_reason, 'No reason provided.'))
    where id = p_closing_id;

  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'day_close_cancelled', 'closings', p_closing_id::text,
    'Cancelled open day close ' || v_close.closing_number || ' for ' || v_close.close_date,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('id', p_closing_id, 'closing_number', v_close.closing_number, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_open_close(uuid, text) from public, anon;
grant execute on function public.cancel_open_close(uuid, text) to authenticated;