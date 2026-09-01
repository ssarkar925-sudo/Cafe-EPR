-- Fix legacy billing payloads that put the funding instrument in instrument_id.
-- Normalize the canonical collection/funding split before financial validation.

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
begin
  if lower(coalesce(new.status, '')) not in ('success','successful','completed','posted')
     or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  if new.pay_from_instrument_id is null and new.instrument_id is not null and v_customer_method not in ('','due') then
    select lower(type) into v_collection_type
      from public.payment_instruments
     where id = new.instrument_id and is_active = true;

    if v_collection_type is not null and not (
      v_collection_type = v_customer_method
      or (v_customer_method in ('upi','qr','upi_qr') and v_collection_type in ('upi','upi_qr'))
      or (v_customer_method = 'card' and v_collection_type in ('debit_card','credit_card'))
    ) then
      v_funding_id := new.instrument_id;
      new.instrument_id := null;
    end if;
  end if;

  if new.instrument_id is null then
    case v_customer_method
      when 'cash' then
        select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) = 'cash' order by created_at asc limit 1;
      when 'upi', 'qr', 'upi_qr' then
        select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
      when 'bank' then
        select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) = 'bank' order by created_at asc limit 1;
      when 'card' then
        select id into v_collection_id from public.payment_instruments where is_active = true and lower(type) in ('debit_card','credit_card') order by created_at asc limit 1;
      else
        v_collection_id := null;
    end case;
    if v_collection_id is not null then new.instrument_id := v_collection_id; end if;
  end if;

  if new.pay_from_instrument_id is null then
    if v_funding_id is not null then
      new.pay_from_instrument_id := v_funding_id;
    elsif v_funding_method in ('cash','cash_drawer') then
      select id into v_funding_id from public.payment_instruments where is_active = true and lower(type) = 'cash' order by created_at asc limit 1;
    elsif v_funding_method in ('bank','bank_account') then
      select id into v_funding_id from public.payment_instruments where is_active = true and lower(type) = 'bank' order by created_at asc limit 1;
    elsif v_funding_method in ('upi','qr','upi_qr') then
      select id into v_funding_id from public.payment_instruments where is_active = true and lower(type) in ('upi','upi_qr') order by created_at asc limit 1;
    elsif v_funding_method = 'card' then
      select id into v_funding_id from public.payment_instruments where is_active = true and lower(type) in ('debit_card','credit_card') order by created_at asc limit 1;
    elsif v_funding_method in ('wallet','aeps','aeps_portal','dmt','dmt_portal') then
      select id into v_funding_id from public.payment_instruments where is_active = true and lower(type) = v_funding_method order by created_at asc limit 1;
    elsif lower(coalesce(new.service_type,'')) in ('aeps','dmt') and lower(coalesce(new.paid_from,'')) = 'portal' and new.portal_id is not null then
      select ap.payment_instrument_id into v_funding_id from public.aeps_portals ap where ap.id = new.portal_id and ap.is_active = true;
    elsif lower(coalesce(new.service_type,'')) = 'upi' and new.merchant_qr_id is not null then
      select q.payment_instrument_id into v_funding_id from public.upi_merchant_qrs q where q.id = new.merchant_qr_id and q.is_active = true;
    end if;
    if v_funding_id is not null then new.pay_from_instrument_id := v_funding_id; end if;
  end if;

  if new.pay_from_instrument_id is not null then
    select lower(type) into v_funding_type from public.payment_instruments where id = new.pay_from_instrument_id and is_active = true;
    if v_funding_type is not null then new.pay_from_method := v_funding_type; end if;
  end if;

  return new;
end;
$$;

-- Recharge/bill-payment screens create their cash_entries after the transaction.
-- Therefore the service journal bridge must derive the complete entry from the
-- canonical transaction fields when no transaction-owned cash legs exist yet.
create or replace function public.post_service_transaction_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn record;
  v_lines jsonb := '[]'::jsonb;
  v_net numeric;
  v_code text;
  v_funding_code text;
  v_collection_code text;
  v_fee numeric;
  v_commission numeric;
  v_total_customer numeric;
  v_any boolean := false;
  v_has_money_legs boolean := false;
  r record;
begin
  select * into v_txn from public.transactions where id=new.id;
  if lower(coalesce(v_txn.status,'')) not in ('success','successful','completed','posted') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='service_transaction' and source_id=v_txn.id) then return new; end if;

  v_fee := coalesce(v_txn.service_fee,0) + coalesce(v_txn.portal_charge,0);
  v_commission := coalesce(v_txn.portal_commission,0);
  v_total_customer := coalesce(v_txn.amount,0) + v_fee;

  for r in
    select ce.instrument_id, sum(case when ce.direction='in' then ce.amount else -ce.amount end) net
      from public.cash_entries ce
     where ce.ref_type='transaction' and ce.ref_id=v_txn.id and ce.instrument_id is not null
     group by ce.instrument_id
  loop
    v_net := round(coalesce(r.net,0),2);
    if abs(v_net)<=0.005 then continue; end if;
    v_code := public.accounting_instrument_account_code(r.instrument_id);
    if v_code is null then raise exception 'Service transaction % has unresolved accounting instrument %',v_txn.transaction_number,r.instrument_id; end if;
    if v_net>0 then
      v_lines := v_lines||jsonb_build_object('account_code',v_code,'debit',v_net,'credit',0);
    else
      v_lines := v_lines||jsonb_build_object('account_code',v_code,'debit',0,'credit',abs(v_net));
    end if;
    v_any := true;
    v_has_money_legs := true;
  end loop;

  if not v_has_money_legs and lower(coalesce(v_txn.service_type,'')) in ('recharge','google_play_recharge','google_play','bill_payment','utility_bill','utility','recharge_due') then
    v_collection_code := case when lower(coalesce(v_txn.customer_pay_method,''))='due' then '1400' else public.accounting_instrument_account_code(v_txn.instrument_id) end;
    v_funding_code := public.accounting_instrument_account_code(v_txn.pay_from_instrument_id);

    if v_collection_code is null and lower(coalesce(v_txn.customer_pay_method,'')) <> 'due' then
      raise exception 'Service transaction % has unresolved customer collection instrument',v_txn.transaction_number;
    end if;
    if v_funding_code is null and coalesce(v_txn.pool_out,0) > 0 then
      raise exception 'Service transaction % has unresolved funding instrument',v_txn.transaction_number;
    end if;

    if v_total_customer > 0 then
      v_lines := v_lines || jsonb_build_object('account_code',v_collection_code,'debit',v_total_customer,'credit',0);
      v_any := true;
    end if;
    if coalesce(v_txn.pool_out,0) > 0 then
      v_lines := v_lines || jsonb_build_object('account_code',v_funding_code,'debit',0,'credit',round(coalesce(v_txn.pool_out,0),2));
    end if;
  end if;

  if not v_any and lower(coalesce(v_txn.customer_pay_method,''))='due' and lower(coalesce(v_txn.direction,''))='in' then
    v_lines := v_lines||jsonb_build_object('account_code','1400','debit',v_total_customer,'credit',0);
    v_any := true;
  end if;

  if v_fee>0 then v_lines := v_lines||jsonb_build_object('account_code','4020','debit',0,'credit',v_fee); end if;
  if v_commission>0 then v_lines := v_lines||jsonb_build_object('account_code','4030','debit',0,'credit',v_commission); end if;

  if jsonb_array_length(v_lines)>0 then
    perform public.post_journal_entry(v_txn.transaction_date,'service_transaction',v_txn.id,'Service '||v_txn.transaction_number,v_lines,v_txn.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_service_transaction_accounting_bridge on public.transactions;
create trigger trg_post_service_transaction_accounting_bridge after insert on public.transactions for each row execute function public.post_service_transaction_accounting_bridge();

-- Backfill service journals that were previously missing because the bridge
-- ran before frontend cash legs were inserted.
do $$
declare
  tx record;
  r record;
  lines jsonb;
  net numeric;
  code text;
  fee numeric;
  commission numeric;
begin
  for tx in
    select tr.* from public.transactions tr
    left join public.journal_entries je on je.source_type='service_transaction' and je.source_id=tr.id
    where lower(coalesce(tr.status,'')) in ('success','successful','completed','posted')
      and lower(coalesce(tr.service_type,'')) in ('recharge','google_play_recharge','google_play','bill_payment','utility_bill','utility','recharge_due','aeps','dmt','upi')
      and je.id is null
    order by tr.created_at
  loop
    lines := '[]'::jsonb;
    for r in
      select ce.instrument_id, sum(case when ce.direction='in' then ce.amount else -ce.amount end) net
      from public.cash_entries ce
      where ce.ref_type='transaction' and ce.ref_id=tx.id and ce.instrument_id is not null
      group by ce.instrument_id
    loop
      net := round(coalesce(r.net,0),2);
      if abs(net)<=0.005 then continue; end if;
      code := public.accounting_instrument_account_code(r.instrument_id);
      if code is null then raise exception 'Cannot backfill %: unresolved accounting instrument %',tx.transaction_number,r.instrument_id; end if;
      if net>0 then lines := lines||jsonb_build_object('account_code',code,'debit',net,'credit',0);
      else lines := lines||jsonb_build_object('account_code',code,'debit',0,'credit',abs(net)); end if;
    end loop;
    fee := coalesce(tx.service_fee,0) + coalesce(tx.portal_charge,0);
    commission := coalesce(tx.portal_commission,0);
    if fee>0 then lines := lines||jsonb_build_object('account_code','4020','debit',0,'credit',fee); end if;
    if commission>0 then lines := lines||jsonb_build_object('account_code','4030','debit',0,'credit',commission); end if;
    if jsonb_array_length(lines)>0 then
      perform public.post_journal_entry(tx.transaction_date,'service_transaction',tx.id,'Service '||tx.transaction_number,lines,tx.created_by);
    end if;
  end loop;
end;
$$;
