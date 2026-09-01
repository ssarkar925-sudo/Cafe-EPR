-- Fix: Cash is a valid CUSTOMER COLLECTION instrument for online services.
-- Only the provider/pay-from funding instrument must be non-cash.
-- The previous guards incorrectly treated transactions.instrument_id (customer collection)
-- as the provider funding account, blocking legitimate Cash + Credit Card settlements.

create or replace function public.enforce_online_service_funding_account()
returns trigger
language plpgsql
as $$
declare
  pay_from_type text;
begin
  if lower(coalesce(new.service_type,'')) in ('recharge','google_play_recharge','google_play','bill_payment','utility_bill','utility') then
    if new.pay_from_instrument_id is not null then
      select lower(type) into pay_from_type
      from public.payment_instruments
      where id = new.pay_from_instrument_id;

      if pay_from_type = 'cash' then
        raise exception 'Cash is not permitted as Pay-from Funding Account for online service %', new.service_type
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_online_service_funding_account()
returns trigger
language plpgsql
as $$
declare
  pay_from_type text;
begin
  if lower(coalesce(new.service_type, '')) in ('recharge','bill_payment','utility_bill','utility')
     and new.pay_from_instrument_id is not null then
    select lower(type) into pay_from_type
    from public.payment_instruments
    where id = new.pay_from_instrument_id;

    if pay_from_type = 'cash' then
      raise exception 'Cash is not permitted as Pay-from Funding Account for online service %', new.service_type
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
