create or replace function public.set_payment_routing_default(
  p_purpose text,
  p_instrument_id uuid,
  p_service_type text default null,
  p_provider_key text default null,
  p_customer_payment_method text default null,
  p_funding_method text default null,
  p_user_id uuid default null,
  p_priority integer default 100,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_scope text;
  v_inst_type text;
  v_method text := lower(nullif(trim(coalesce(p_customer_payment_method,'')),''));
  v_funding text := lower(nullif(trim(coalesce(p_funding_method,'')),''));
  v_service text := lower(nullif(trim(coalesce(p_service_type,'')),''));
  v_provider text := nullif(trim(coalesce(p_provider_key,'')), '');
  v_new_id uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if p_purpose not in ('customer_collection','provider_funding','settlement_source','settlement_destination','pos_payment','invoice_payment','supplier_payment') then raise exception 'Invalid routing purpose'; end if;
  if p_instrument_id is null then raise exception 'Instrument is required'; end if;
  if p_user_id is not null and p_user_id<>v_uid then raise exception 'Only the signed-in user can manage a user-scoped default'; end if;
  v_scope := case when p_user_id is null then 'business' else 'user' end;
  select lower(type), name into v_inst_type, v_name from public.payment_instruments where id=p_instrument_id and is_active;
  if v_inst_type is null then raise exception 'Selected payment instrument is missing or inactive'; end if;
  if v_method in ('qr','upi_qr') then v_method := 'upi'; end if;
  if v_method='card' then
    if v_inst_type not in ('debit_card','credit_card') then raise exception 'Card default requires a card instrument'; end if;
  elsif v_method is not null then
    if v_method='cash' and v_inst_type<>'cash' then raise exception 'Cash default requires a cash instrument'; end if;
    if v_method='bank' and v_inst_type<>'bank' then raise exception 'Bank default requires a bank instrument'; end if;
    if v_method='upi' and v_inst_type not in ('upi','upi_qr') then raise exception 'UPI default requires a UPI instrument'; end if;
    if v_method='wallet' and v_inst_type<>'wallet' then raise exception 'Wallet default requires a wallet instrument'; end if;
    if v_method='debit_card' and v_inst_type<>'debit_card' then raise exception 'Debit card default requires a debit card instrument'; end if;
    if v_method='credit_card' and v_inst_type<>'credit_card' then raise exception 'Credit card default requires a credit card instrument'; end if;
  end if;
  if p_purpose='provider_funding' and v_inst_type='cash' then raise exception 'Cash cannot be a provider funding default'; end if;
  if p_purpose='provider_funding' and v_service is null then raise exception 'Service type is required for provider funding defaults'; end if;
  if p_purpose='customer_collection' and v_method is null then raise exception 'Customer payment method is required for collection defaults'; end if;
  update public.payment_routing_defaults set is_active=false, updated_at=now()
   where is_active and purpose=p_purpose and coalesce(service_type,'')=coalesce(v_service,'') and coalesce(provider_key,'')=coalesce(v_provider,'') and coalesce(customer_payment_method,'')=coalesce(v_method,'') and coalesce(funding_method,'')=coalesce(v_funding,'') and scope=v_scope and coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_user_id,'00000000-0000-0000-0000-000000000000'::uuid);
  insert into public.payment_routing_defaults (purpose,service_type,provider_key,customer_payment_method,funding_method,scope,user_id,instrument_id,priority,is_active,is_system_default,source,notes,created_by,updated_at)
  values (p_purpose,v_service,v_provider,v_method,v_funding,v_scope,p_user_id,p_instrument_id,coalesce(p_priority,100),true,false,case when v_scope='user' then 'user' else 'business' end,p_notes,v_uid,now()) returning id into v_new_id;
  insert into public.audit_logs(user_id,user_name,action,entity,entity_id,description,details)
  values(v_uid,null,'update','payment_routing_default',v_new_id::text,'Default route set: '||p_purpose||' → '||v_name,jsonb_build_object('purpose',p_purpose,'service_type',v_service,'provider_key',v_provider,'customer_payment_method',v_method,'funding_method',v_funding,'instrument_id',p_instrument_id,'instrument_name',v_name,'scope',v_scope));
  return jsonb_build_object('success',true,'id',v_new_id,'instrument_id',p_instrument_id,'instrument_name',v_name,'purpose',p_purpose,'service_type',v_service,'customer_payment_method',v_method,'funding_method',v_funding);
end;
$$;

revoke execute on function public.set_payment_routing_default(text,uuid,text,text,text,text,uuid,integer,text) from public, anon;
grant execute on function public.set_payment_routing_default(text,uuid,text,text,text,text,uuid,integer,text) to authenticated;
