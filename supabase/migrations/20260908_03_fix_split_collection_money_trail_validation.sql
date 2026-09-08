-- Fix false customer-collection alerts for split bill-payment reconciliation.
-- The canonical collection is customer_payment_allocations, not the legacy
-- single customer_collection_instrument_id column.

create or replace function public.validate_service_transaction_money_trail()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expected_collection numeric := 0;
  v_expected_funding numeric := 0;
  v_collection_in numeric := 0;
  v_funding_out numeric := 0;
  v_complete_allocations boolean := false;
begin
  if lower(coalesce(new.status,'')) not in ('success','successful','completed','posted') then
    return new;
  end if;

  v_expected_collection := greatest(0, round(coalesce(new.customer_collected_amount,0),2));

  if lower(coalesce(new.service_type,'')) = 'dmt' then
    v_expected_funding := greatest(0, round(coalesce(new.amount,0),2));
  elsif lower(coalesce(new.service_type,'')) in ('recharge','bill_payment','google_play_recharge','google_play') then
    v_expected_funding := greatest(0, round(coalesce(new.pool_out,0),2));
  end if;

  -- Split customer collection is authoritative by instrument allocation, not by
  -- the legacy single customer_collection_instrument_id column. Reconciliation
  -- corrections are netted; provider funding entries are excluded from collection
  -- so a shared instrument cannot contaminate both concepts.
  if v_expected_collection > 0 then
    v_complete_allocations :=
      jsonb_typeof(new.customer_payment_allocations) = 'array'
      and jsonb_array_length(new.customer_payment_allocations) > 0
      and not exists (
        select 1
        from jsonb_array_elements(new.customer_payment_allocations) a
        where nullif(a->>'instrument_id','') is null
      );

    if v_complete_allocations then
      select coalesce(sum(
        case
          when ce.direction in ('in','deposit') then ce.amount
          else -ce.amount
        end
      ),0)
      into v_collection_in
      from public.cash_entries ce
      where ce.ref_id = new.id
        and ce.ref_type in ('transaction','transaction_correction')
        and ce.instrument_id is not null
        and exists (
          select 1
          from jsonb_array_elements(new.customer_payment_allocations) a
          where nullif(a->>'instrument_id','') = ce.instrument_id::text
        )
        and lower(coalesce(ce.description,'')) not like '%fund%';
    elsif new.customer_collection_instrument_id is not null then
      select coalesce(sum(
        case when ce.direction in ('in','deposit') then ce.amount else -ce.amount end
      ),0)
      into v_collection_in
      from public.cash_entries ce
      where ce.ref_id = new.id
        and ce.ref_type in ('transaction','transaction_correction')
        and ce.instrument_id = new.customer_collection_instrument_id;
    else
      select coalesce(sum(
        case when ce.direction in ('in','deposit') then ce.amount else -ce.amount end
      ),0)
      into v_collection_in
      from public.cash_entries ce
      where ce.ref_id = new.id
        and ce.ref_type in ('transaction','transaction_correction')
        and ce.direction in ('in','deposit');
    end if;

    if v_collection_in < v_expected_collection - 0.005 then
      raise exception 'Service transaction % has missing customer collection: expected %, recorded %', new.transaction_number, v_expected_collection, v_collection_in;
    end if;
  end if;

  if v_expected_funding > 0 then
    if new.pay_from_instrument_id is null then
      raise exception 'Service transaction % has provider funding amount % but no funding instrument', new.transaction_number, v_expected_funding;
    end if;

    select coalesce(sum(
      case
        when v_complete_allocations and exists (
          select 1
          from jsonb_array_elements(new.customer_payment_allocations) a
          where nullif(a->>'instrument_id','') = ce.instrument_id::text
        ) then 0
        when ce.direction in ('out','withdrawal') then ce.amount
        else -ce.amount
      end
    ),0)
    into v_funding_out
    from public.cash_entries ce
    where ce.ref_id = new.id
      and ce.ref_type in ('transaction','transaction_correction')
      and ce.instrument_id = new.pay_from_instrument_id;

    if v_funding_out < v_expected_funding - 0.005 then
      raise exception 'Service transaction % has missing funding OUT: expected %, recorded %', new.transaction_number, v_expected_funding, v_funding_out;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_service_transaction_money_trail on public.transactions;
create constraint trigger trg_validate_service_transaction_money_trail
after insert or update of status, service_type, amount, customer_collected_amount, customer_collection_instrument_id, customer_payment_allocations, pool_out, pay_from_instrument_id, pay_from_method
on public.transactions
deferrable initially deferred
for each row execute function public.validate_service_transaction_money_trail();
