-- ==============================================================================
-- UNIFIED DOUBLE-ENTRY ACCOUNTING & CROSS-MODULE RECONCILIATION MIGRATION
-- Migration: 20260906_02_unified_double_entry_accounting.sql
-- ==============================================================================

-- 1. Ensure Chart of Accounts has 5210 (Cash Shortage and Overage)
insert into public.accounting_accounts (code, name, account_type, is_active)
values ('5210', 'Cash Shortage and Overage', 'expense', true)
on conflict (code) do update set name = excluded.name, is_active = true;

-- Ensure default cash instrument exists
do $$
declare v_id uuid;
begin
  select id into v_id from public.payment_instruments where type = 'cash' and is_active = true order by created_at limit 1;
  if v_id is null then
    insert into public.payment_instruments (name, type, is_active, opening_balance, current_balance, details)
    values ('Cash', 'cash', true, 0, 0, '{"system_default":true}')
    returning id into v_id;
  end if;
end $$;

-- 2. Update trg_post_cash_entry_journal
-- Non-operational cash movements post directly; operational movements (invoices, purchases,
-- quick sales, expenses, service transactions, settlements) are journaled by their parent bridges.
create or replace function public.trg_post_cash_entry_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset text;
  v_dr text;
  v_cr text;
  v_desc text;
  v_source uuid;
  v_amount numeric;
begin
  if new.amount <= 0 then return new; end if;

  -- Operational records that have dedicated multi-line journal entries:
  -- Do not double-post 2-legged clearing entries for these!
  if new.ref_type in ('invoice', 'purchase', 'quick_sale', 'expense', 'transaction', 'settlement') then
    return new;
  end if;

  -- Resolve asset account code:
  if new.instrument_id is not null then
    v_asset := public.accounting_instrument_account_code(new.instrument_id);
  end if;
  if v_asset is null then
    v_asset := public.accounting_asset_code(new.method);
  end if;

  v_amount := round(new.amount, 2);
  v_source := new.id;

  if new.direction = 'in' then
    v_dr := v_asset;
    v_cr := case
      when new.ref_type in ('customer_payment', 'due_collection') then '1300' -- Customer Due Collection -> Cr Accounts Receivable
      when new.ref_type = 'return' then '5100'                            -- Sales Return reversal
      when new.ref_type = 'purchase_return' then '2000'                   -- Supplier refund -> Cr Accounts Payable
      when new.ref_type = 'day_close' then '3000'                         -- Owner deposit at day close -> Cr Owner Equity
      when new.ref_type in ('capital', 'owner_equity') then '3000'           -- Owner capital injection
      when new.ref_type in ('cash_variance', 'cash_overage') then '5210'     -- Day close cash overage -> Cr Variance
      else '1400'                                          -- Unallocated suspense / clearing
    end;
  else
    v_cr := v_asset;
    v_dr := case
      when new.ref_type in ('supplier_payment', 'purchase_payment') then '2000' -- Supplier Due Payment -> Dr Accounts Payable
      when new.ref_type in ('customer_payment', 'due_collection') then '1300'   -- Customer refund -> Dr Accounts Receivable
      when new.ref_type = 'return' then '5100'                               -- Customer return refund
      when new.ref_type = 'purchase_return' then '2000'                      -- Purchase return
      when new.ref_type = 'day_close' then '3000'                            -- Owner withdrawal at day close -> Dr Owner Equity
      when new.ref_type in ('capital', 'owner_equity') then '3000'              -- Owner drawings
      when new.ref_type in ('cash_variance', 'cash_shortage') then '5210'       -- Day close cash shortage -> Dr Variance
      else '1400'                                             -- Unallocated suspense / clearing
    end;
  end if;

  v_desc := coalesce(new.description, 'Cash movement');
  perform public.post_journal_entry(
    new.entry_date,
    'cash_entry',
    v_source,
    v_desc,
    jsonb_build_array(
      jsonb_build_object('account_code', v_dr, 'debit', v_amount, 'credit', 0),
      jsonb_build_object('account_code', v_cr, 'debit', 0, 'credit', v_amount)
    ),
    null
  );

  return new;
end;
$$;

-- 3. Update create_business_txn with authoritative multi-leg money recording and instrument resolution
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
  p_customer_pay_method text default null,
  p_pay_from_instrument_id uuid default null,
  p_pay_from_method text default 'bank',
  p_receiver_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_prev_bal numeric := 0;
  v_new_bal numeric := 0;
  v_pay_from_method text;
  v_pay_from_instrument_id uuid;
  v_customer_instrument_id uuid;
  v_cash_instrument_id uuid;
  v_portal_instrument_id uuid;
  v_qr_instrument_id uuid;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_service_type not in ('aeps', 'dmt', 'upi') then raise exception 'Invalid service type'; end if;
  if p_status not in ('success', 'pending', 'failed') then raise exception 'Invalid status'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_service_fee is null or p_service_fee < 0 then raise exception 'Service fee cannot be negative'; end if;
  if p_portal_commission is null or p_portal_commission < 0 then raise exception 'Portal commission cannot be negative'; end if;
  v_fee := coalesce(p_service_fee, 0);

  -- Always resolve default system cash instrument
  select id into v_cash_instrument_id
  from public.payment_instruments
  where type = 'cash' and is_active = true
  order by created_at limit 1;

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
    v_pool_credit := p_amount + coalesce(p_portal_commission, 0);
    v_pool_out := 0;
    v_pool_type := 'aeps';

    -- Resolve portal instrument for float credit
    select payment_instrument_id into v_portal_instrument_id
    from public.aeps_portals
    where id = p_portal_id and is_active = true;
    if v_portal_instrument_id is null then
      select id into v_portal_instrument_id
      from public.payment_instruments
      where type = 'aeps' and is_active = true
      order by created_at limit 1;
    end if;
    v_pay_from_instrument_id := v_cash_instrument_id;
    v_pay_from_method := 'cash';

  elsif p_service_type = 'dmt' then
    if p_transfer_method not in ('bank_account', 'upi') then raise exception 'Select a transfer method'; end if;
    if p_reference is null or p_reference = '' then raise exception 'RRN / reference is required'; end if;
    v_direction := 'in'; v_prefix := 'DMT'; v_seq := 'public.dmt_seq'; v_label := 'DMT';

    -- Resolve funding instrument
    if coalesce(p_paid_from, 'bank') = 'portal' then
      v_pool_out := p_amount;
      v_pool_type := 'dmt';
      if p_portal_id is not null then
        select payment_instrument_id into v_portal_instrument_id
        from public.aeps_portals
        where id = p_portal_id and is_active = true;
      end if;
      if v_portal_instrument_id is null then
        select id into v_portal_instrument_id
        from public.payment_instruments
        where type = 'dmt' and is_active = true
        order by created_at limit 1;
      end if;
      v_pay_from_instrument_id := v_portal_instrument_id;
      v_pay_from_method := 'dmt';
    else
      v_bank_out := p_amount;
      v_pay_from_instrument_id := p_pay_from_instrument_id;
      if v_pay_from_instrument_id is null and p_bank_id is not null then
        if exists(select 1 from public.payment_instruments where id = p_bank_id and is_active = true) then
          v_pay_from_instrument_id := p_bank_id;
        end if;
      end if;
      if v_pay_from_instrument_id is null then
        select id into v_pay_from_instrument_id
        from public.payment_instruments
        where type = 'bank' and is_active = true
        order by created_at limit 1;
      end if;
      select type into v_pay_from_method
      from public.payment_instruments
      where id = v_pay_from_instrument_id and is_active = true;
      v_pay_from_method := coalesce(v_pay_from_method, 'bank');
    end if;

    -- Resolve customer collection instrument
    if coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
      v_bank_in := p_amount + v_fee;
      select id into v_customer_instrument_id
      from public.payment_instruments
      where type = coalesce(p_customer_pay_method, 'bank') and is_active = true
      order by created_at limit 1;
    elsif coalesce(p_customer_pay_method, 'cash') = 'due' then
      if p_customer_id is null then raise exception 'Please select a customer to mark this DMT transfer as Due.'; end if;
      v_cash_in := 0;
      v_bank_in := 0;
      v_customer_instrument_id := null;
    else
      v_cash_in := p_amount + v_fee;
      v_customer_instrument_id := v_cash_instrument_id;
    end if;

  else -- upi cash out
    v_direction := 'out'; v_prefix := 'UPI'; v_seq := 'public.upi_seq'; v_label := 'UPI';
    v_cash_out := p_amount;
    if coalesce(p_customer_pay_method, 'qr') = 'cash' then
      v_cash_in := p_amount + v_fee;
      v_customer_instrument_id := v_cash_instrument_id;
    else
      v_pool_credit := p_amount + v_fee;
      v_pool_type := 'upi_qr';
      if p_merchant_qr_id is not null then
        select payment_instrument_id into v_qr_instrument_id
        from public.upi_merchant_qrs
        where id = p_merchant_qr_id and is_active = true;
      end if;
      if v_qr_instrument_id is null then
        select id into v_qr_instrument_id
        from public.payment_instruments
        where type in ('upi', 'upi_qr') and is_active = true
        order by created_at limit 1;
      end if;
      v_customer_instrument_id := v_qr_instrument_id;
    end if;
    v_pay_from_instrument_id := v_cash_instrument_id;
    v_pay_from_method := 'cash';
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
    instrument_id, pay_from_instrument_id, pay_from_method,
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
    coalesce(v_customer_instrument_id, v_cash_instrument_id), v_pay_from_instrument_id, v_pay_from_method,
    v_cash_out, v_cash_in, v_bank_out, v_bank_in, v_pool_out, v_pool_credit, v_pool_type, v_upi_fee
  ) returning id into v_txn_id;

  if p_status = 'success' then
    -- 1. Cash Payout Leg (AEPS, UPI)
    if v_cash_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'cash', 'out', v_cash_out, v_label || ' ' || v_number || ' cash payout', 'transaction', v_txn_id, v_cash_instrument_id);
    end if;

    -- 2. Customer Inflow Leg (Cash)
    if v_cash_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'cash', 'in', v_cash_in, v_label || ' ' || v_number || ' received in cash', 'transaction', v_txn_id, v_cash_instrument_id);
    end if;

    -- 3. Customer Inflow Leg (Bank / UPI)
    if v_bank_in > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, coalesce(p_customer_pay_method, 'bank'), 'in', v_bank_in, v_label || ' ' || v_number || ' received via ' || coalesce(p_customer_pay_method, 'Bank'), 'transaction', v_txn_id, v_customer_instrument_id);
    end if;

    -- 4. Payout Leg from Bank (DMT)
    if v_bank_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, 'bank', 'out', v_bank_out, v_label || ' ' || v_number || ' transfer sent to beneficiary', 'transaction', v_txn_id, v_pay_from_instrument_id);
    end if;

    -- 5. Payout Leg from Portal Wallet (DMT from portal)
    if v_pool_out > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_transaction_date, coalesce(v_pool_type, 'dmt'), 'out', v_pool_out, v_label || ' ' || v_number || ' payout from portal wallet', 'transaction', v_txn_id, v_pay_from_instrument_id);
    end if;

    -- 6. Float Credit Leg (AEPS float credit or UPI QR credit)
    if v_pool_credit > 0 then
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (
        p_transaction_date,
        coalesce(v_pool_type, 'aeps'),
        'in',
        v_pool_credit,
        case when p_service_type = 'aeps' then v_label || ' ' || v_number || ' float credited'
             else v_label || ' ' || v_number || ' received via Shop QR' end,
        'transaction',
        v_txn_id,
        case when p_service_type = 'aeps' then v_portal_instrument_id else v_qr_instrument_id end
      );
    end if;

    -- 7. Credit Sale (Customer Khata Due)
    if coalesce(p_customer_pay_method, 'cash') = 'due' and p_customer_id is not null then
      select coalesce(balance, 0) into v_prev_bal from public.customers where id = p_customer_id for update;
      v_new_bal := v_prev_bal + (p_amount + v_fee);
      update public.customers set balance = v_new_bal, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after, ref_type, ref_id)
      values (p_customer_id, p_transaction_date, p_service_type, v_label || ' ' || v_number || ' on credit', p_amount + v_fee, 0, v_new_bal, 'transaction', v_txn_id);
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

-- 4. Update post_service_transaction_accounting_bridge with Khata AR 1300 support
create or replace function public.post_service_transaction_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn record;
  v_lines jsonb := '[]'::jsonb;
  v_net numeric;
  v_code text;
  v_funding_code text;
  v_collection_code text;
  v_fee numeric;
  v_commission numeric;
  v_total_customer numeric;
  v_any boolean := false;
  v_has_money_legs boolean := false;
  r record;
begin
  select * into v_txn from public.transactions where id = new.id;
  if lower(coalesce(v_txn.status, '')) not in ('success', 'successful', 'completed', 'posted') then
    return new;
  end if;
  if exists(select 1 from public.journal_entries where source_type = 'service_transaction' and source_id = v_txn.id) then
    return new;
  end if;

  v_fee := coalesce(v_txn.service_fee, 0) + coalesce(v_txn.portal_charge, 0);
  v_commission := coalesce(v_txn.portal_commission, 0);
  v_total_customer := coalesce(v_txn.amount, 0) + v_fee;

  for r in
    select ce.instrument_id, sum(case when ce.direction = 'in' then ce.amount else -ce.amount end) net
    from public.cash_entries ce
    where ce.ref_type = 'transaction' and ce.ref_id = v_txn.id and ce.instrument_id is not null
    group by ce.instrument_id
  loop
    v_net := round(coalesce(r.net, 0), 2);
    if abs(v_net) <= 0.005 then continue; end if;
    v_code := public.accounting_instrument_account_code(r.instrument_id);
    if v_code is null then
      select public.accounting_asset_code(type) into v_code
      from public.payment_instruments where id = r.instrument_id;
    end if;
    if v_code is null then v_code := '1400'; end if;

    if v_net > 0 then
      v_lines := v_lines || jsonb_build_object('account_code', v_code, 'debit', v_net, 'credit', 0);
    else
      v_lines := v_lines || jsonb_build_object('account_code', v_code, 'debit', 0, 'credit', abs(v_net));
    end if;
    v_any := true;
    v_has_money_legs := true;
  end loop;

  -- If customer bought on credit (due): debit Accounts Receivable (1300)
  if lower(coalesce(v_txn.customer_pay_method, '')) = 'due' and v_total_customer > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', '1300', 'debit', v_total_customer, 'credit', 0);
    v_any := true;
  end if;

  -- Fallback if money legs were not recorded in cash_entries
  if not v_has_money_legs and lower(coalesce(v_txn.customer_pay_method, '')) <> 'due' then
    v_collection_code := public.accounting_instrument_account_code(v_txn.instrument_id);
    v_funding_code := public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);
    if v_collection_code is null then v_collection_code := public.accounting_asset_code(v_txn.customer_pay_method); end if;
    if v_funding_code is null then v_funding_code := public.accounting_asset_code(v_txn.pay_from_method); end if;

    if v_total_customer > 0 and lower(coalesce(v_txn.direction, '')) in ('in', 'both') then
      v_lines := v_lines || jsonb_build_object('account_code', coalesce(v_collection_code, '1000'), 'debit', v_total_customer, 'credit', 0);
      v_any := true;
    end if;
    if coalesce(v_txn.pool_out, 0) > 0 or coalesce(v_txn.bank_out, 0) > 0 then
      v_lines := v_lines || jsonb_build_object('account_code', coalesce(v_funding_code, '1010'), 'debit', 0, 'credit', round(coalesce(nullif(v_txn.pool_out, 0), v_txn.bank_out), 2));
      v_any := true;
    end if;
  end if;

  if v_fee > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', '4020', 'debit', 0, 'credit', v_fee);
  end if;
  if v_commission > 0 then
    v_lines := v_lines || jsonb_build_object('account_code', '4030', 'debit', 0, 'credit', v_commission);
  end if;

  if jsonb_array_length(v_lines) > 0 then
    perform public.post_journal_entry(
      v_txn.transaction_date,
      'service_transaction',
      v_txn.id,
      'Service ' || v_txn.transaction_number,
      v_lines,
      v_txn.created_by
    );
  end if;
  return new;
end;
$$;

-- Make service transaction journal posting trigger deferred constraint trigger
drop trigger if exists trg_post_service_transaction_accounting_bridge on public.transactions;
create constraint trigger trg_post_service_transaction_accounting_bridge
after insert on public.transactions
deferrable initially deferred
for each row execute function public.post_service_transaction_accounting_bridge();

-- 5. Ensure Invoice Accounting Bridge fires on INSERT as well as UPDATE
drop trigger if exists trg_post_invoice_accounting_bridge on public.invoices;
create constraint trigger trg_post_invoice_accounting_bridge
after insert or update of paid, due, status on public.invoices
deferrable initially deferred
for each row execute function public.post_invoice_accounting_bridge();

-- 6. Day Close Variance Reconciliation Function
create or replace function public.reconcile_day_close_variance(p_closing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing record;
  v_cash_adj numeric := 0;
  v_cash_inst_id uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  select * into v_closing from public.closings where id = p_closing_id;
  if not found then raise exception 'Day close not found'; end if;

  select id into v_cash_inst_id
  from public.payment_instruments
  where type = 'cash' and is_active = true
  order by created_at limit 1;

  select coalesce(adjustment, 0) into v_cash_adj
  from public.closing_balances
  where closing_id = p_closing_id and pool = 'cash';

  if v_cash_adj <> 0 then
    if v_cash_adj < 0 then
      -- Shortage: Dr 5210 (Cash Shortage Expense), Cr 1000 (Cash Drawer)
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', '5210', 'debit', abs(v_cash_adj), 'credit', 0),
        jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', abs(v_cash_adj))
      );
    else
      -- Overage: Dr 1000 (Cash Drawer), Cr 5210 (Cash Overage Gain)
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', '1000', 'debit', abs(v_cash_adj), 'credit', 0),
        jsonb_build_object('account_code', '5210', 'debit', 0, 'credit', abs(v_cash_adj))
      );
    end if;

    perform public.post_journal_entry(
      v_closing.close_date,
      'day_close_variance',
      p_closing_id,
      'Day Close Variance ' || v_closing.closing_number || case when v_cash_adj < 0 then ' (Shortage)' else ' (Overage)' end,
      v_lines,
      auth.uid()
    );
  end if;

  return jsonb_build_object('ok', true, 'closing_id', p_closing_id, 'variance', v_cash_adj);
end;
$$;

-- 7. Grant / Revoke security controls
revoke all on function public.create_business_txn(
  p_service_type text, p_transaction_date date, p_transaction_timestamp timestamptz,
  p_customer_id uuid, p_customer_mobile text, p_reference text, p_remarks text, p_status text,
  p_bank_id uuid, p_portal_id uuid, p_merchant_qr_id uuid, p_aadhaar_last4 text,
  p_transfer_method text, p_sender_name text, p_sender_mobile text, p_beneficiary_name text,
  p_beneficiary_mobile text, p_beneficiary_bank text, p_beneficiary_ifsc text,
  p_beneficiary_account text, p_upi_id text, p_amount numeric, p_service_fee numeric,
  p_portal_commission numeric, p_fee_source text, p_paid_from text, p_customer_pay_method text,
  p_pay_from_instrument_id uuid, p_pay_from_method text, p_receiver_name text
) from public, anon;

grant execute on function public.create_business_txn(
  p_service_type text, p_transaction_date date, p_transaction_timestamp timestamptz,
  p_customer_id uuid, p_customer_mobile text, p_reference text, p_remarks text, p_status text,
  p_bank_id uuid, p_portal_id uuid, p_merchant_qr_id uuid, p_aadhaar_last4 text,
  p_transfer_method text, p_sender_name text, p_sender_mobile text, p_beneficiary_name text,
  p_beneficiary_mobile text, p_beneficiary_bank text, p_beneficiary_ifsc text,
  p_beneficiary_account text, p_upi_id text, p_amount numeric, p_service_fee numeric,
  p_portal_commission numeric, p_fee_source text, p_paid_from text, p_customer_pay_method text,
  p_pay_from_instrument_id uuid, p_pay_from_method text, p_receiver_name text
) to authenticated;

revoke all on function public.reconcile_day_close_variance(uuid) from public, anon;
grant execute on function public.reconcile_day_close_variance(uuid) to authenticated;

revoke execute on function public.trg_post_cash_entry_journal() from public, anon, authenticated;
revoke execute on function public.post_service_transaction_accounting_bridge() from public, anon, authenticated;
