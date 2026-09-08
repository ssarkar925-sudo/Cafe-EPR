create or replace function public.bind_upi_transaction_to_merchant_qr() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_qr_pi uuid; v_type text;
begin
  if lower(coalesce(new.service_type,'')) <> 'upi'
     or lower(coalesce(new.status,'')) not in ('success','successful','completed','posted')
     or coalesce(new.amount,0) <= 0 then
    return new;
  end if;
  if new.merchant_qr_id is null then
    raise exception 'UPI transaction % requires a Merchant QR',new.transaction_number;
  end if;
  select q.payment_instrument_id, lower(pi.type)
    into v_qr_pi,v_type
    from public.upi_merchant_qrs q
    join public.payment_instruments pi on pi.id=q.payment_instrument_id
   where q.id=new.merchant_qr_id and q.is_active and pi.is_active;
  if v_qr_pi is null or v_type not in ('upi','upi_qr') then
    raise exception 'Selected Merchant QR is not linked to an active UPI payment account';
  end if;
  new.pay_from_instrument_id:=v_qr_pi;
  new.pay_from_method:=v_type;
  new.instrument_id:=v_qr_pi;
  return new;
end;
$function$;

create or replace function public.enforce_transaction_money_instrument() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_qr_pi uuid;
begin
  if lower(coalesce(new.status,'')) in ('success','successful','completed','posted') and coalesce(new.amount,0)>0 then
    if lower(coalesce(new.service_type,''))='upi' then
      if new.merchant_qr_id is null then raise exception 'UPI transaction % requires a Merchant QR',new.transaction_number; end if;
      select q.payment_instrument_id into v_qr_pi from public.upi_merchant_qrs q where q.id=new.merchant_qr_id and q.is_active;
      if v_qr_pi is null then raise exception 'UPI transaction % uses a Merchant QR without a payment account',new.transaction_number; end if;
      if coalesce(new.instrument_id,new.pay_from_instrument_id) is distinct from v_qr_pi then
        raise exception 'UPI transaction % payment instrument must match the selected Merchant QR',new.transaction_number;
      end if;
    elsif lower(coalesce(new.service_type,'')) in ('aeps','dmt','mobile_recharge','dth','bill_payment','bbps','utility','google_play','recharge')
      and coalesce(new.instrument_id,new.pay_from_instrument_id) is null then
      raise exception 'Financial transaction % requires an explicit funding/payment instrument',new.transaction_number;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_000_a_upi_qr_binding on public.transactions;
create trigger trg_000_a_upi_qr_binding
before insert or update on public.transactions
for each row execute function public.bind_upi_transaction_to_merchant_qr();
