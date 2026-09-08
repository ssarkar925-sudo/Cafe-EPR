-- UPI fee-source hardening.
-- `cut_from_payment` means the gross customer amount is received/recorded,
-- but the fee is deducted before the net UPI float/cash payout is available.

alter table public.transactions drop constraint if exists transactions_fee_source_check;
alter table public.transactions add constraint transactions_fee_source_check
  check (
    fee_source is null
    or fee_source = any(array[
      'cut_from_withdrawal',
      'cut_from_payment',
      'separate_cash',
      'upi'
    ]::text[])
  );

create or replace function public.canonical_transaction_fee_source(
  p_fee_source text,
  p_customer_pay_method text
)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_source text := lower(trim(coalesce(p_fee_source,'')));
  v_method text := lower(trim(coalesce(p_customer_pay_method,'')));
begin
  if v_source in ('cut_from_payment','payment','cut_from_collection')
     or v_source like '%payment%'
     or v_source like '%collection%' then
    return 'cut_from_payment';
  end if;
  if v_source in ('cut_from_withdrawal','deduct','cut','cut_from_payout')
     or v_source like '%withdrawal%'
     or v_source like '%payout%'
     or v_source like '%deduct%' then
    return 'cut_from_withdrawal';
  end if;
  if v_source in ('upi','upi_fee','separate_upi')
     or v_source like '%upi%'
     or (v_method in ('upi','qr','upi_qr') and (
          v_source = '' or v_source like '%separate%' or v_source like '%extra%' or v_source like '%fee%'
        )) then
    return 'upi';
  end if;
  if v_source in ('cash','cash_drawer','cash-drawer','cashdrawer','separate',
                  'separate_cash_fee','separate_cash','cash_collection','cash_collected_separately',
                  'separate_fee_cash','customer_pays_extra','customer_pays_separately','pay_extra',
                  'fee_extra','extra_cash')
     or v_source like '%cash%'
     or v_source like '%customer%pay%extra%'
     or (v_method='cash' and (v_source like '%separate%' or v_source like '%extra%' or v_source like '%fee%')) then
    return 'separate_cash';
  end if;
  if v_source in ('cut_from_withdrawal','cut_from_payment','separate_cash','upi') then return v_source; end if;
  if v_source='' then return null; end if;
  raise exception 'Unsupported fee source % for customer payment method %',p_fee_source,p_customer_pay_method;
end;
$$;

-- Keep the existing business RPCs but add the new fee mode to their UPI branch.
do $$
declare d text;
begin
  select pg_get_functiondef('public.create_business_txn(text,date,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text,numeric)'::regprocedure) into d;
  d := replace(d,
$old$    if coalesce(p_customer_pay_method,'qr')='cash' then
      v_cash_in:=p_amount+v_fee;
    else
      if p_fee_source='customer_paid_extra' then
        v_pool_credit:=p_amount+v_fee;
        v_cash_out:=p_amount;
      elsif p_fee_source='cut_from_payment' then
        v_pool_credit:=greatest(0,p_amount-v_fee);
        v_cash_out:=greatest(0,p_amount-v_fee);
      else
        v_pool_credit:=p_amount;
        v_cash_out:=greatest(0,p_amount-v_fee);
      end if;
      v_pool_type:='upi_qr';
    end if;$old$,
$new$    if coalesce(p_customer_pay_method,'qr')='cash' then
      v_cash_in:=p_amount+v_fee;
    else
      if p_fee_source='customer_paid_extra' then
        v_pool_credit:=p_amount+v_fee;
        v_cash_out:=p_amount;
      elsif p_fee_source='cut_from_payment' then
        v_pool_credit:=greatest(0,p_amount-v_fee);
        v_cash_out:=greatest(0,p_amount-v_fee);
      else
        v_pool_credit:=p_amount;
        v_cash_out:=greatest(0,p_amount-v_fee);
      end if;
      v_pool_type:='upi_qr';
    end if;$new$);
  execute d;

  select pg_get_functiondef('public.update_business_txn(uuid,date,timestamp with time zone,uuid,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,uuid,text,text)'::regprocedure) into d;
  d := replace(d,
$old$    else
      if p_fee_source = 'customer_paid_extra' then
        v_pool_credit := p_amount + v_fee;
        v_cash_out := p_amount;
      elsif p_fee_source = 'cut_from_payment' then
        v_pool_credit := greatest(0, p_amount - v_fee);
        v_cash_out := greatest(0, p_amount - v_fee);
      else
        v_pool_credit := p_amount;
        v_cash_out := greatest(0, p_amount - v_fee);
      end if;
      v_pool_type := 'upi_qr';$old$,
$new$    else
      if p_fee_source = 'customer_paid_extra' then
        v_pool_credit := p_amount + v_fee;
        v_cash_out := p_amount;
      elsif p_fee_source = 'cut_from_payment' then
        v_pool_credit := greatest(0, p_amount - v_fee);
        v_cash_out := greatest(0, p_amount - v_fee);
      else
        v_pool_credit := p_amount;
        v_cash_out := greatest(0, p_amount - v_fee);
      end if;
      v_pool_type := 'upi_qr';$new$);
  execute d;
end $$;

-- Repair the affected transaction only if it exists and has not already been
-- repaired. The correction entry is immutable and therefore preserves the
-- audit trail instead of editing/deleting historical cash entries.
do $$
declare
  v_tx uuid := '0b21d7af-b28c-4d0c-8ff3-f36bc269e0b6';
  v_upi uuid := '2de9217d-dbe5-4937-bba7-feafb9167cff';
begin
  if exists (select 1 from public.transactions where id=v_tx)
     and not exists (
       select 1 from public.cash_entries
       where ref_type='transaction_correction'
         and ref_id=v_tx
         and instrument_id=v_upi
         and direction='in'
     ) then
    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(current_date,'upi','in',1700,'Correction: UPI-0009 payment credit net of ₹10 fee cut from payment','transaction_correction',v_tx,v_upi);
  end if;
end $$;
