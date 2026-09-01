-- Resolve customer collection and service funding to canonical payment_instruments IDs.
-- instrument_id = customer collection instrument.
-- pay_from_instrument_id = cost/funding instrument.

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
  v_existing_collection_type text;
  v_customer_method text := lower(trim(coalesce(new.customer_pay_method, '')));
  v_funding_method text := lower(trim(coalesce(new.pay_from_method, '')));
begin
  if lower(coalesce(new.status, '')) not in ('success','successful','completed','posted')
     or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  -- instrument_id is the CUSTOMER COLLECTION instrument. Some service UIs
  -- historically reused it for the selected funding account. If it conflicts
  -- with the customer's payment method, replace it with the canonical type.
  if v_customer_method <> '' and v_customer_method <> 'due' then
    if new.instrument_id is not null then
      select lower(type) into v_existing_collection_type
      from public.payment_instruments
      where id = new.instrument_id and is_active = true;
    end if;

    if v_customer_method = 'cash' and v_existing_collection_type <> 'cash' then
      new.instrument_id := null;
    elsif v_customer_method = 'bank' and v_existing_collection_type <> 'bank' then
      new.instrument_id := null;
    elsif v_customer_method in ('upi','qr','upi_qr')
      and v_existing_collection_type not in ('upi','upi_qr') then
      new.instrument_id := null;
    elsif v_customer_method = 'card'
      and v_existing_collection_type not in ('debit_card','credit_card') then
      new.instrument_id := null;
    end if;

    if new.instrument_id is null then
      case v_customer_method
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
          where is_active = true and lower(type) = 'bank'
          order by created_at asc limit 1;
        when 'card' then
          select id into v_collection_id from public.payment_instruments
          where is_active = true and lower(type) in ('debit_card','credit_card')
          order by created_at asc limit 1;
        else
          v_collection_id := null;
      end case;
      if v_collection_id is not null then new.instrument_id := v_collection_id; end if;
    end if;
  end if;

  -- pay_from_instrument_id is the COST/FUNDING instrument and is independent
  -- from instrument_id. Resolve it from the selected funding method when the UI
  -- supplies only the method.
  if new.pay_from_instrument_id is null then
    if v_funding_method in ('cash','cash_drawer') then
      select id into v_funding_id from public.payment_instruments
      where is_active = true and lower(type) = 'cash'
      order by created_at asc limit 1;
    elsif v_funding_method in ('bank','bank_account') then
      select id into v_funding_id from public.payment_instruments
      where is_active = true and lower(type) = 'bank'
      order by created_at asc limit 1;
    elsif v_funding_method in ('upi','qr','upi_qr') then
      select id into v_funding_id from public.payment_instruments
      where is_active = true and lower(type) in ('upi','upi_qr')
      order by created_at asc limit 1;
    elsif v_funding_method = 'card' then
      select id into v_funding_id from public.payment_instruments
      where is_active = true and lower(type) in ('debit_card','credit_card')
      order by created_at asc limit 1;
    elsif v_funding_method in ('wallet','aeps','aeps_portal','dmt','dmt_portal') then
      select id into v_funding_id from public.payment_instruments
      where is_active = true and lower(type) = v_funding_method
      order by created_at asc limit 1;
    elsif lower(coalesce(new.service_type,'')) in ('aeps','dmt')
       and lower(coalesce(new.paid_from,'')) = 'portal'
       and new.portal_id is not null then
      select ap.payment_instrument_id into v_funding_id
      from public.aeps_portals ap
      where ap.id = new.portal_id and ap.is_active = true;
    elsif lower(coalesce(new.service_type,'')) = 'upi'
       and new.merchant_qr_id is not null then
      select q.payment_instrument_id into v_funding_id
      from public.upi_merchant_qrs q
      where q.id = new.merchant_qr_id and q.is_active = true;
    end if;
    if v_funding_id is not null then new.pay_from_instrument_id := v_funding_id; end if;
  end if;

  if new.pay_from_instrument_id is not null then
    select lower(type) into v_funding_type
    from public.payment_instruments
    where id = new.pay_from_instrument_id and is_active = true;
    if v_funding_type is not null then new.pay_from_method := v_funding_type; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_000_resolve_transaction_payment_instruments on public.transactions;
create trigger trg_000_resolve_transaction_payment_instruments
before insert or update on public.transactions
for each row execute function public.resolve_transaction_payment_instruments();

revoke all on function public.resolve_transaction_payment_instruments() from public, anon;
grant execute on function public.resolve_transaction_payment_instruments() to authenticated, service_role;
