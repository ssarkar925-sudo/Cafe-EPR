-- Resolve recharge/bill-payment funding methods to canonical payment_instruments IDs.
-- The financial validation trigger requires pay_from_instrument_id whenever
-- pay_from_method is populated. UI funding selectors may provide the method
-- before the canonical UUID, so resolve it before validation runs.

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
  v_customer_method text := lower(trim(coalesce(new.customer_pay_method, '')));
  v_funding_method text := lower(trim(coalesce(new.pay_from_method, '')));
begin
  if lower(coalesce(new.status, '')) not in ('success','successful','completed','posted')
     or coalesce(new.amount, 0) <= 0 then
    return new;
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
