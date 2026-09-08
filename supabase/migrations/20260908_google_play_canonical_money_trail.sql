-- Google Play: canonical provider/customer money trail
-- The Google Play client historically inserted the transaction first and then
-- attempted to append cash_entries in follow-up requests. This makes the
-- funding leg dependent on client sequencing and can leave HDFC Current
-- un-debited. Keep the accounting source of truth in the database trigger.

create or replace function public.dedupe_transaction_money_entry()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_instrument uuid;
begin
  if new.ref_type <> 'transaction' or new.ref_id is null then
    return new;
  end if;

  if new.instrument_id is null then
    v_instrument := public.resolve_payment_instrument(new.method, null);
    if v_instrument is not null then
      new.instrument_id := v_instrument;
    end if;
  end if;

  -- Idempotent money trail: do not create a second transaction/instrument/
  -- direction leg when the canonical trigger already created it.
  if new.instrument_id is not null
     and exists (
       select 1
       from public.cash_entries ce
       where ce.ref_type='transaction'
         and ce.ref_id=new.ref_id
         and ce.instrument_id=new.instrument_id
         and ce.direction=new.direction
     ) then
    return null;
  end if;

  return new;
end;
$function$;

create or replace function public.sync_google_play_money_legs()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_collection_inst uuid;
  v_collection_method text;
  v_collection numeric;
  v_due numeric;
  v_funding numeric;
  v_funding_method text;
  v_total numeric;
begin
  if lower(coalesce(new.status,'')) not in ('success','successful','completed','posted') then
    return new;
  end if;
  if lower(coalesce(new.service_type,'')) not in ('google_play_recharge','google_play') then
    return new;
  end if;

  perform set_config('erp.internal_cash_mutation_authorized','on',true);

  v_total := round(coalesce(new.amount,0)+coalesce(new.service_fee,0)+coalesce(new.portal_charge,0),2);
  v_collection := greatest(0,coalesce(new.customer_collected_amount,0));
  v_due := greatest(0,coalesce(new.customer_due_amount,0));

  if v_collection=0 and v_due=0 and lower(coalesce(new.customer_pay_method,''))='due' then
    v_due := v_total;
  elsif v_collection=0 and v_due=0 then
    v_collection := v_total;
  end if;

  -- Customer collection leg.
  if v_collection>0 then
    v_collection_inst := new.customer_collection_instrument_id;
    v_collection_method := lower(coalesce(new.customer_collection_method,new.customer_pay_method,'cash'));

    if v_collection_inst is null then
      if v_collection_method='cash' then
        select id into v_collection_inst from public.payment_instruments
        where is_active and lower(type)='cash' order by created_at asc limit 1;
      elsif v_collection_method in ('upi','qr','upi_qr') then
        select id into v_collection_inst from public.payment_instruments
        where is_active and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
      elsif v_collection_method='bank' then
        select id into v_collection_inst from public.payment_instruments
        where is_active and lower(type)='bank' order by created_at asc limit 1;
      elsif v_collection_method='wallet' then
        select id into v_collection_inst from public.payment_instruments
        where is_active and lower(type)='wallet' order by created_at asc limit 1;
      elsif v_collection_method in ('card','credit_card','debit_card') then
        select id into v_collection_inst from public.payment_instruments
        where is_active and lower(type) in ('credit_card','debit_card') order by created_at asc limit 1;
      end if;
    end if;

    if v_collection_inst is null then
      raise exception 'Google Play customer collection instrument is missing';
    end if;

    insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
    values(
      coalesce(new.transaction_date,current_date),
      case when v_collection_method in ('qr','upi_qr') then 'upi' else v_collection_method end,
      'in',v_collection,
      'Google Play '||new.transaction_number||' customer collection',
      'transaction',new.id,v_collection_inst
    );
  end if;

  -- Provider funding leg. This is the authoritative debit from the selected
  -- shop funding account (bank/wallet/credit card); it is not optional.
  if new.pay_from_instrument_id is null then
    raise exception 'Google Play recharge requires a funding account';
  end if;

  v_funding := greatest(0,round(coalesce(nullif(new.pool_out,0),coalesce(new.amount,0)-coalesce(new.portal_commission,0)),2));
  if v_funding<=0 then
    raise exception 'Google Play recharge has invalid provider funding amount';
  end if;

  select lower(type) into v_funding_method
  from public.payment_instruments
  where id=new.pay_from_instrument_id and is_active;

  if v_funding_method is null then
    raise exception 'Google Play funding account is missing or inactive';
  end if;
  if v_funding_method='cash' then
    raise exception 'Cash is not permitted as a funding account for Google Play recharge';
  end if;

  insert into public.cash_entries(entry_date,method,direction,amount,description,ref_type,ref_id,instrument_id)
  values(
    coalesce(new.transaction_date,current_date),
    v_funding_method,
    'out',v_funding,
    'Google Play '||new.transaction_number||' provider funding debit',
    'transaction',new.id,new.pay_from_instrument_id
  );

  return new;
end;
$function$;

drop trigger if exists trg_sync_google_play_money_legs on public.transactions;
create trigger trg_sync_google_play_money_legs
after insert on public.transactions
for each row execute function public.sync_google_play_money_legs();
