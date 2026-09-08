CREATE OR REPLACE FUNCTION public.post_service_transaction_accounting_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_txn record;
  v_lines jsonb := '[]'::jsonb;
  v_net numeric;
  v_code text;
  v_funding_code text;
  v_fee numeric;
  v_commission numeric;
  v_total_customer numeric;
  v_collection numeric;
  v_due numeric;
  v_any boolean := false;
  v_funding_out numeric := 0;
  v_funding_in numeric := 0;
  v_expected_funding numeric := 0;
  v_missing_funding numeric := 0;
  r record;
begin
  select * into v_txn from public.transactions where id = new.id;
  if lower(coalesce(v_txn.status,'')) not in ('success','successful','completed','posted') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='service_transaction' and source_id=v_txn.id) then return new; end if;

  v_fee := coalesce(v_txn.service_fee,0) + coalesce(v_txn.portal_charge,0);
  v_commission := coalesce(v_txn.portal_commission,0);
  v_total_customer := coalesce(v_txn.amount,0) + v_fee;
  v_collection := greatest(0,coalesce(v_txn.customer_collected_amount,0));
  v_due := greatest(0,coalesce(v_txn.customer_due_amount,0));

  if v_collection=0 and v_due=0 and lower(coalesce(v_txn.customer_pay_method,''))='due' then
    v_due := v_total_customer;
  end if;
  if v_collection=0 and v_due=0 and lower(coalesce(v_txn.customer_pay_method,''))<>'due' and v_total_customer>0 then
    v_collection := v_total_customer;
  end if;

  if lower(coalesce(v_txn.service_type,'')) = 'recharge' and v_txn.pay_from_instrument_id is not null then
    v_expected_funding := greatest(0, round(coalesce(nullif(v_txn.pool_out,0), coalesce(v_txn.amount,0) - v_commission), 2));

    for r in
      select ce.instrument_id,
             sum(case when ce.direction='in' then ce.amount else -ce.amount end) net
      from public.cash_entries ce
      where ce.ref_type='transaction'
        and ce.ref_id=v_txn.id
        and ce.instrument_id is not null
      group by ce.instrument_id
    loop
      v_net := round(coalesce(r.net,0),2);
      if abs(v_net)<=0.005 then continue; end if;
      v_code := public.accounting_instrument_account_code(r.instrument_id);
      if v_code is null then
        select public.accounting_asset_code(type) into v_code
        from public.payment_instruments where id=r.instrument_id;
      end if;
      if v_net>0 then
        v_lines := v_lines || jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0);
      end if;
      v_any := true;
    end loop;

    if v_due>0 then
      v_lines := v_lines || jsonb_build_object('account_code','1300','debit',round(v_due,2),'credit',0);
      v_any := true;
    end if;

    select
      coalesce(sum(case when ce.direction='out' then ce.amount else 0 end),0),
      coalesce(sum(case when ce.direction='in' then ce.amount else 0 end),0)
    into v_funding_out, v_funding_in
    from public.cash_entries ce
    where ce.ref_type='transaction'
      and ce.ref_id=v_txn.id
      and ce.instrument_id=v_txn.pay_from_instrument_id;

    v_missing_funding := round(greatest(0, v_expected_funding - coalesce(v_funding_out,0)),2);
    v_funding_code := public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);
    if v_funding_code is null then
      select public.accounting_asset_code(type) into v_funding_code
      from public.payment_instruments where id=v_txn.pay_from_instrument_id;
    end if;
    if v_funding_code is null then v_funding_code := '1010'; end if;

    if v_missing_funding > 0.005 then
      v_lines := v_lines || jsonb_build_object('account_code',v_funding_code,'debit',0,'credit',v_missing_funding);
      v_any := true;
    end if;

    if v_commission>0 then
      v_lines := v_lines || jsonb_build_object('account_code','4030','debit',0,'credit',round(v_commission,2));
      v_any := true;
    end if;

    if v_any and jsonb_array_length(v_lines)>0 then
      select coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'credit')::numeric),0)
        into v_funding_in,v_funding_out
      from jsonb_array_elements(v_lines) x;
      if abs(v_funding_in-v_funding_out)>0.005 then
        raise exception 'Recharge journal would be unbalanced for %: debit %, credit %',v_txn.transaction_number,v_funding_in,v_funding_out;
      end if;
      perform public.post_journal_entry(
        v_txn.transaction_date,
        'service_transaction',
        v_txn.id,
        'Service '||v_txn.transaction_number,
        v_lines,
        v_txn.created_by
      );
    end if;
    return new;
  end if;

  for r in
    select ce.instrument_id,
           sum(case when ce.direction='in' then ce.amount else -ce.amount end) net
    from public.cash_entries ce
    where ce.ref_type='transaction'
      and ce.ref_id=v_txn.id
      and ce.instrument_id is not null
    group by ce.instrument_id
  loop
    v_net := round(coalesce(r.net,0),2);
    if abs(v_net)<=0.005 then continue; end if;
    v_code := public.accounting_instrument_account_code(r.instrument_id);
    if v_code is null then
      select public.accounting_asset_code(type) into v_code
      from public.payment_instruments where id=r.instrument_id;
    end if;
    if v_code is null then v_code := '1400'; end if;
    if v_net>0 then
      v_lines := v_lines || jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0);
    else
      v_lines := v_lines || jsonb_build_object('account_code',v_code,'debit',0,'credit',abs(v_net));
    end if;
    v_any := true;
  end loop;

  if coalesce(v_txn.pool_out,0) > 0 and v_txn.pay_from_instrument_id is not null then
    select
      coalesce(sum(case when ce.direction='out' then ce.amount else 0 end),0),
      coalesce(sum(case when ce.direction='in' then ce.amount else 0 end),0)
    into v_funding_out, v_funding_in
    from public.cash_entries ce
    where ce.ref_type='transaction'
      and ce.ref_id=v_txn.id
      and ce.instrument_id=v_txn.pay_from_instrument_id;

    v_missing_funding := round(greatest(0, coalesce(v_txn.pool_out,0) - coalesce(v_funding_out,0)),2);
    if v_missing_funding > 0.005 then
      v_funding_code := public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);
      if v_funding_code is null then
        select public.accounting_asset_code(type) into v_funding_code
        from public.payment_instruments where id=v_txn.pay_from_instrument_id;
      end if;
      if v_funding_code is null then v_funding_code := '1010'; end if;
      v_lines := v_lines || jsonb_build_object('account_code',v_funding_code,'debit',0,'credit',v_missing_funding);
      v_any := true;
    end if;
  end if;

  if v_due>0 and v_txn.customer_id is not null then
    v_lines := v_lines || jsonb_build_object('account_code','1300','debit',v_due,'credit',0);
    v_any := true;
  end if;

  if v_fee>0 then
    v_lines := v_lines || jsonb_build_object('account_code','4020','debit',0,'credit',round(v_fee,2));
    v_any := true;
  end if;
  if v_commission>0 then
    v_lines := v_lines || jsonb_build_object('account_code','4030','debit',0,'credit',round(v_commission,2));
    v_any := true;
  end if;

  if v_any and jsonb_array_length(v_lines)>0 then
    perform public.post_journal_entry(
      v_txn.transaction_date,
      'service_transaction',
      v_txn.id,
      'Service '||v_txn.transaction_number,
      v_lines,
      v_txn.created_by
    );
  end if;
  return new;
end;
$function$;

NOTIFY pgrst, 'reload schema';
