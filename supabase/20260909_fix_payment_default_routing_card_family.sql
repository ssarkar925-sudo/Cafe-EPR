create or replace function public.resolve_payment_instrument(p_method text, p_instrument_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
  v_method text := lower(coalesce(trim(p_method),''));
  v_count integer;
  v_default jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden'; end if;

  if p_instrument_id is not null then
    select id into v_id from public.payment_instruments where id=p_instrument_id and is_active=true;
    if v_id is null then raise exception 'Selected payment instrument is not active'; end if;
    return v_id;
  end if;

  if v_method in ('upi_qr','qr') then v_method := 'upi'; end if;

  v_default := public.resolve_default_payment_route('customer_collection',null,null,v_method,null,auth.uid());
  if coalesce((v_default->>'success')::boolean,false) and v_default->>'instrument_id' is not null then
    return (v_default->>'instrument_id')::uuid;
  end if;

  -- Existing workflows may pass debit_card/credit_card while the Defaults UI
  -- manages one business-level Card route. Use that family default when there
  -- is no more specific default for the concrete card type.
  if v_method in ('debit_card','credit_card') then
    v_default := public.resolve_default_payment_route('customer_collection',null,null,'card',null,auth.uid());
    if coalesce((v_default->>'success')::boolean,false) and v_default->>'instrument_id' is not null then
      return (v_default->>'instrument_id')::uuid;
    end if;
  end if;

  if v_method='card' then
    select count(*) into v_count from public.payment_instruments where is_active and type in ('debit_card','credit_card');
    if v_count=1 then
      select id into v_id from public.payment_instruments where is_active and type in ('debit_card','credit_card') order by created_at asc limit 1;
      return v_id;
    elsif v_count>1 then
      raise exception 'Multiple active card instruments exist; select a specific payment instrument';
    end if;
    raise exception 'No active card payment instrument is configured';
  end if;

  select count(*) into v_count from public.payment_instruments where is_active and lower(type)=v_method;
  if v_count=1 then
    select id into v_id from public.payment_instruments where is_active and lower(type)=v_method order by created_at asc limit 1;
    return v_id;
  elsif v_count>1 then
    raise exception 'Multiple active % payment instruments exist; select a specific payment instrument', v_method;
  end if;
  raise exception 'No active % payment instrument is configured', v_method;
end;
$$;

revoke execute on function public.resolve_payment_instrument(text,uuid) from public, anon;
grant execute on function public.resolve_payment_instrument(text,uuid) to authenticated;
