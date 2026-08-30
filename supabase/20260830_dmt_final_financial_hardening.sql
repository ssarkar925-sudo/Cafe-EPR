-- Final DMT financial hardening.
-- Applied to the Cafe ERP Supabase production project on 2026-08-30.
--
-- Includes:
-- 1) Persist portal/provider charge on transactions.
-- 2) Atomic DMT posting RPC: transaction + charge/collection adjustment commit together.
-- 3) Server-side DMT reconciliation helper.

alter table public.transactions
  add column if not exists portal_charge numeric not null default 0;

create or replace function public.create_dmt_business_txn(
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
  p_receiver_name text default null,
  p_portal_charge numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_txn_id uuid;
  v_full_collection numeric;
  v_adjustment numeric;
  v_customer_balance numeric;
  v_updated integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;
  if p_service_type <> 'dmt' then raise exception 'This RPC only accepts DMT transactions'; end if;
  if coalesce(p_portal_charge, 0) < 0 then raise exception 'Portal charge cannot be negative'; end if;

  v_result := public.create_business_txn(
    p_service_type, p_transaction_date, p_transaction_timestamp,
    p_customer_id, p_customer_mobile, p_reference, p_remarks, p_status,
    p_bank_id, p_portal_id, p_merchant_qr_id, p_aadhaar_last4,
    p_transfer_method, p_sender_name, p_sender_mobile,
    p_beneficiary_name, p_beneficiary_mobile, p_beneficiary_bank,
    p_beneficiary_ifsc, p_beneficiary_account, p_upi_id,
    p_amount, p_service_fee, p_portal_commission, p_fee_source,
    p_paid_from, p_customer_pay_method, p_pay_from_instrument_id,
    p_pay_from_method, p_receiver_name
  );

  v_txn_id := (v_result->>'id')::uuid;
  v_full_collection := coalesce(p_amount, 0) + coalesce(p_service_fee, 0) + coalesce(p_portal_charge, 0);
  v_adjustment := coalesce(p_portal_charge, 0);

  update public.transactions
     set portal_charge = v_adjustment
   where id = v_txn_id;

  if p_status = 'success' and v_adjustment > 0 then
    if coalesce(p_customer_pay_method, 'cash') = 'cash' then
      update public.cash_entries
         set amount = amount + v_adjustment
       where ref_id = v_txn_id
         and ref_type = 'transaction'
         and direction = 'in'
         and method = 'cash';
      get diagnostics v_updated = row_count;
      if v_updated = 0 then raise exception 'DMT collection entry was not found for cash adjustment'; end if;

    elsif coalesce(p_customer_pay_method, 'cash') in ('bank', 'upi') then
      update public.cash_entries
         set amount = amount + v_adjustment
       where ref_id = v_txn_id
         and ref_type = 'transaction'
         and direction = 'in'
         and method = 'bank';
      get diagnostics v_updated = row_count;
      if v_updated = 0 then raise exception 'DMT collection entry was not found for bank/UPI adjustment'; end if;

    elsif coalesce(p_customer_pay_method, 'cash') = 'due' then
      if p_customer_id is null then raise exception 'Please select a customer to mark this DMT transfer as Due.'; end if;

      select coalesce(balance, 0) into v_customer_balance
        from public.customers where id = p_customer_id for update;
      if not found then raise exception 'Customer not found for DMT due collection'; end if;

      update public.customers set balance = coalesce(balance, 0) + v_adjustment where id = p_customer_id;

      update public.customer_ledger
         set debit = coalesce(debit, 0) + v_adjustment,
             balance_after = coalesce(balance_after, v_customer_balance) + v_adjustment
       where ref_id = v_txn_id;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'transaction_number', v_result->>'transaction_number',
    'id', v_txn_id,
    'portal_charge', v_adjustment,
    'total_collected', v_full_collection
  );
end;
$$;

grant execute on function public.create_dmt_business_txn(
  text,date,timestamptz,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric
) to authenticated;

create or replace function public.get_dmt_reconciliation(p_as_of date default current_date)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_opening numeric := 0;
  v_seed date;
  v_movement numeric := 0;
  v_canonical numeric := 0;
  v_expected numeric := 0;
  v_variance numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  select s.opening, s.seed_date into v_opening, v_seed
    from public.get_pool_seed('dmt', p_as_of) s;

  v_movement := public.get_pool_movements('dmt', coalesce(v_seed, '0001-01-01'::date), p_as_of);
  v_expected := coalesce(v_opening, 0) + coalesce(v_movement, 0);

  select coalesce((b->>'current')::numeric, 0) into v_canonical
    from (select public.get_pool_balances(p_as_of) as all_pools) q,
         lateral jsonb_extract_path(q.all_pools, 'dmt') b;

  v_variance := round(v_canonical - v_expected, 2);

  return jsonb_build_object(
    'as_of', p_as_of,
    'seed_date', v_seed,
    'opening', round(coalesce(v_opening, 0), 2),
    'ledger_movement', round(coalesce(v_movement, 0), 2),
    'expected', round(v_expected, 2),
    'canonical', round(v_canonical, 2),
    'variance', v_variance,
    'status', case when abs(v_variance) < 0.005 then 'reconciled' else 'reconciliation_required' end
  );
end;
$$;

grant execute on function public.get_dmt_reconciliation(date) to authenticated;
