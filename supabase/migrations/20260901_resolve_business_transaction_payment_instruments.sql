-- Resolve canonical payment-instrument identity before the financial validation triggers run.
-- This fixes AEPS/DMT/UPI service transactions that previously supplied only
-- human-facing method/portal selectors while the accounting layer requires IDs.

create or replace function public.resolve_transaction_payment_instruments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_collection_id uuid;
  v_funding_id uuid;
  v_funding_type text;
begin
  if lower(coalesce(new.status, '')) not in ('success','successful','completed','posted')
     or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  if new.instrument_id is null then
    case lower(trim(coalesce(new.customer_pay_method, '')))
      when 'cash' then
        select id into v_collection_id from public.payment_instruments
        where is_active = true and lower(type) = 'cash'
        order by created_at asc limit 1;
      when 'upi', 'qr', 'upi_qr' then
        select id into v_collection_id from public.payment_instruments
        where is_active = true and lower(type) in ('upi','upi_qr')
        order by created_at asc limit 1;
      when 'bank' then
        select id into v_collection_id from public.payment_instruments
        where is_active = true and lower(type) in ('bank','debit_card')
        order by created_at asc limit 1;
      when 'card' then
        select id into v_collection_id from public.payment_instruments
        where is_active = true and lower(type) in ('debit_card','credit_card')
        order by created_at asc limit 1;
      else
        v_collection_id := null;
    end case;

    if v_collection_id is not null then
      new.instrument_id := v_collection_id;
    end if;
  end if;

  if new.pay_from_instrument_id is null then
    if lower(coalesce(new.service_type, '')) in ('aeps','dmt')
       and lower(coalesce(new.paid_from, '')) = 'portal'
       and new.portal_id is not null then
      select ap.payment_instrument_id into v_funding_id
      from public.aeps_portals ap
      where ap.id = new.portal_id and ap.is_active = true;

      if v_funding_id is not null then
        new.pay_from_instrument_id := v_funding_id;
      end if;
    elsif lower(coalesce(new.service_type, '')) = 'upi'
       and new.merchant_qr_id is not null then
      select q.payment_instrument_id into v_funding_id
      from public.upi_merchant_qrs q
      where q.id = new.merchant_qr_id and q.is_active = true;

      if v_funding_id is not null then
        new.pay_from_instrument_id := v_funding_id;
      end if;
    end if;
  end if;

  if new.pay_from_instrument_id is not null then
    select lower(type) into v_funding_type
    from public.payment_instruments
    where id = new.pay_from_instrument_id and is_active = true;

    if v_funding_type is not null then
      new.pay_from_method := v_funding_type;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_000_resolve_transaction_payment_instruments on public.transactions;
create trigger trg_000_resolve_transaction_payment_instruments
before insert or update on public.transactions
for each row
execute function public.resolve_transaction_payment_instruments();

-- "due" represents customer credit, not a payment account. It therefore must
-- not be rejected for lacking a collection instrument. Real payment methods
-- remain strictly tied to an active payment_instruments row.
create or replace function public.validate_financial_account_linkage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_type text;
  funding_type text;
  customer_method text := lower(trim(coalesce(new.customer_pay_method,'')));
  funding_method text := lower(trim(coalesce(new.pay_from_method,'')));
begin
  if new.status in ('failed','reversed','cancelled') then
    return new;
  end if;

  if customer_method <> '' and customer_method <> 'due' and new.instrument_id is null then
    raise exception 'Customer payment method % requires a collection payment instrument', new.customer_pay_method;
  end if;

  if new.instrument_id is not null then
    select lower(type) into customer_type
    from public.payment_instruments
    where id = new.instrument_id and is_active = true;

    if customer_type is null then
      raise exception 'Collection payment instrument is missing or inactive';
    end if;

    if customer_method <> '' and customer_method <> 'due'
       and customer_type <> customer_method
       and not (customer_method = 'upi' and customer_type in ('upi','upi_qr'))
       and not (customer_method = 'upi_qr' and customer_type in ('upi','upi_qr'))
       and not (customer_method = 'qr' and customer_type in ('upi','upi_qr'))
       and not (customer_method = 'card' and customer_type in ('debit_card','credit_card')) then
      raise exception 'Collection instrument type (%) does not match customer payment method (%)', customer_type, new.customer_pay_method;
    end if;
  end if;

  if funding_method <> '' and new.pay_from_instrument_id is null then
    raise exception 'Funding payment method % requires a funding payment instrument', new.pay_from_method;
  end if;

  if new.pay_from_instrument_id is not null then
    select lower(type) into funding_type
    from public.payment_instruments
    where id = new.pay_from_instrument_id and is_active = true;

    if funding_type is null then
      raise exception 'Funding payment instrument is missing or inactive';
    end if;

    if funding_method <> '' and funding_type <> funding_method
       and not (funding_method = 'upi' and funding_type in ('upi','upi_qr'))
       and not (funding_method = 'upi_qr' and funding_type in ('upi','upi_qr'))
       and not (funding_method = 'qr' and funding_type in ('upi','upi_qr'))
       and not (funding_method = 'card' and funding_type in ('debit_card','credit_card')) then
      raise exception 'Funding instrument type (%) does not match funding method (%)', funding_type, new.pay_from_method;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.resolve_transaction_payment_instruments() from public, anon;
grant execute on function public.resolve_transaction_payment_instruments() to authenticated, service_role;
