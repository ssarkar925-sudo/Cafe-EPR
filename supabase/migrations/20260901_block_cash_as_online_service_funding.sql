-- Online recharge / Google Play / bill-payment services must never use Cash as provider funding.
-- This is enforced at the database boundary so the restriction cannot be bypassed by the UI.

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
  v_collection_type text;
  v_customer_method text := lower(trim(coalesce(new.customer_pay_method, '')));
  v_funding_method text := lower(trim(coalesce(new.pay_from_method, '')));
  v_online_service boolean := lower(coalesce(new.service_type,'')) in ('recharge','google_play_recharge','google_play','bill_payment','utility_bill','utility','recharge_due');
begin
  if lower(coalesce(new.status, '')) not in ('success','successful','completed','posted') or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  if v_online_service and new.pay_from_instrument_id is not null then
    select lower(type) into v_funding_type from public.payment_instruments where id=new.pay_from_instrument_id;
    if v_funding_type='cash' then
      raise exception 'Cash cannot be used as the Funding Account for online service transactions (%)',new.service_type;
    end if;
  end if;

  -- Legacy payload compatibility: some older screens placed the funding account in instrument_id.
  if new.pay_from_instrument_id is null and new.instrument_id is not null and v_customer_method not in ('','due') then
    select lower(type) into v_collection_type from public.payment_instruments where id=new.instrument_id and is_active=true;
    if v_collection_type is not null and not (
      v_collection_type=v_customer_method
      or (v_customer_method in ('upi','qr','upi_qr') and v_collection_type in ('upi','upi_qr'))
      or (v_customer_method='card' and v_collection_type in ('debit_card','credit_card'))
    ) then
      v_funding_id := new.instrument_id;
      new.instrument_id := null;
    end if;
  end if;

  if new.instrument_id is null then
    case v_customer_method
      when 'cash' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type)='cash' order by created_at asc limit 1;
      when 'upi','qr','upi_qr' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
      when 'bank' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type)='bank' order by created_at asc limit 1;
      when 'card' then select id into v_collection_id from public.payment_instruments where is_active=true and lower(type) in ('debit_card','credit_card') order by created_at asc limit 1;
      else v_collection_id := null;
    end case;
    if v_collection_id is not null then new.instrument_id := v_collection_id; end if;
  end if;

  if new.pay_from_instrument_id is null then
    if v_funding_id is not null then
      new.pay_from_instrument_id := v_funding_id;
    elsif v_funding_method in ('cash','cash_drawer') then
      if not v_online_service then
        select id into v_funding_id from public.payment_instruments where is_active=true and lower(type)='cash' order by created_at asc limit 1;
      end if;
    elsif v_funding_method in ('bank','bank_account') then
      select id into v_funding_id from public.payment_instruments where is_active=true and lower(type)='bank' order by created_at asc limit 1;
    elsif v_funding_method in ('upi','qr','upi_qr') then
      select id into v_funding_id from public.payment_instruments where is_active=true and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
    elsif v_funding_method='card' then
      select id into v_funding_id from public.payment_instruments where is_active=true and lower(type) in ('debit_card','credit_card') order by created_at asc limit 1;
    elsif v_funding_method in ('wallet','aeps','aeps_portal','dmt','dmt_portal') then
      select id into v_funding_id from public.payment_instruments where is_active=true and lower(type)=v_funding_method order by created_at asc limit 1;
    elsif lower(coalesce(new.service_type,'')) in ('aeps','dmt') and lower(coalesce(new.paid_from,''))='portal' and new.portal_id is not null then
      select ap.payment_instrument_id into v_funding_id from public.aeps_portals ap where ap.id=new.portal_id and ap.is_active=true;
    elsif lower(coalesce(new.service_type,''))='upi' and new.merchant_qr_id is not null then
      select q.payment_instrument_id into v_funding_id from public.upi_merchant_qrs q where q.id=new.merchant_qr_id and q.is_active=true;
    end if;
    if v_funding_id is not null then new.pay_from_instrument_id := v_funding_id; end if;
  end if;

  if v_online_service and new.pay_from_instrument_id is null and coalesce(new.pool_out,0)>0 then
    raise exception 'An online Funding Account is required for %; Cash is not permitted',new.service_type;
  end if;

  if new.pay_from_instrument_id is not null then
    select lower(type) into v_funding_type from public.payment_instruments where id=new.pay_from_instrument_id and is_active=true;
    if v_online_service and v_funding_type='cash' then
      raise exception 'Cash cannot be used as the Funding Account for online service transactions (%)',new.service_type;
    end if;
    if v_funding_type is not null then new.pay_from_method := v_funding_type; end if;
  end if;

  return new;
end;
$$;
