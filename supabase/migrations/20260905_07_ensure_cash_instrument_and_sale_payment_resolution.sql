-- Ensure the canonical financial model always has an explicit cash instrument.
do $$
declare v_id uuid;
begin
  select id into v_id
  from public.payment_instruments
  where type='cash' and is_active=true
  order by created_at
  limit 1;

  if v_id is null then
    insert into public.payment_instruments(name,type,is_active,opening_balance,current_balance,details)
    values('Cash','cash',true,0,0,'{"system_default":true}')
    returning id into v_id;
  end if;
end $$;

-- create_sale_internal historically allowed method='cash' without an instrument_id,
-- but the canonical money-trail guard now requires every cash leg to identify its instrument.
do $$
declare
  v_def text;
  v_sig text := 'p_customer_id uuid, p_invoice_date date, p_subtotal numeric, p_discount numeric, p_total numeric, p_payments jsonb, p_items jsonb, p_previous_due numeric, p_previous_due_method text, p_previous_due_instrument_id uuid, p_advance_used numeric, p_place_of_supply text, p_supply_type text, p_customer_gstin text, p_b2b_or_b2c text, p_total_taxable_value numeric, p_total_cgst numeric, p_total_sgst numeric, p_total_igst numeric, p_is_reverse_charge boolean';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_sale_internal'
    and pg_get_function_identity_arguments(p.oid)=v_sig;

  if v_def is null then raise exception 'create_sale_internal not found'; end if;

  v_def:=replace(
    v_def,
    'if v_instrument_id is not null then select type into v_inst_type from public.payment_instruments where id=v_instrument_id and is_active=true;if v_inst_type is null then raise exception ''Unknown or inactive payment instrument'';end if;v_method:=v_inst_type;elsif v_method<>''cash'' then',
    'if v_instrument_id is not null then select type into v_inst_type from public.payment_instruments where id=v_instrument_id and is_active=true;if v_inst_type is null then raise exception ''Unknown or inactive payment instrument'';end if;v_method:=v_inst_type;elsif v_method=''cash'' then select id,type into v_instrument_id,v_inst_type from public.payment_instruments where type=''cash'' and is_active=true order by created_at limit 1;if v_instrument_id is null then raise exception ''Cash payment instrument is not configured'';end if;v_method:=v_inst_type;else'
  );

  execute v_def;
end $$;
