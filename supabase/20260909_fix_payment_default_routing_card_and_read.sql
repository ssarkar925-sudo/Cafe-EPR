drop policy if exists payment_routing_defaults_admin_select on public.payment_routing_defaults;
create policy payment_routing_defaults_backoffice_select on public.payment_routing_defaults
  for select to authenticated using (public.is_back_office());

drop function if exists public.resolve_default_payment_route(text,text,text,text,text,uuid);
create or replace function public.resolve_default_payment_route(
  p_purpose text,
  p_service_type text default null,
  p_provider_key text default null,
  p_customer_payment_method text default null,
  p_funding_method text default null,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_method text := lower(nullif(trim(coalesce(p_customer_payment_method,'')),''));
  v_funding text := lower(nullif(trim(coalesce(p_funding_method,'')),''));
  v_service text := lower(nullif(trim(coalesce(p_service_type,'')),''));
  v_provider text := nullif(trim(coalesce(p_provider_key,'')), '');
  v_route record;
  v_score integer;
begin
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authenticated'; end if;
  if p_purpose not in ('customer_collection','provider_funding','settlement_source','settlement_destination','pos_payment','invoice_payment','supplier_payment') then raise exception 'Invalid routing purpose'; end if;
  if v_method in ('qr','upi_qr') then v_method := 'upi'; end if;
  select d.*, i.name as instrument_name, lower(i.type) as instrument_type into v_route
    from public.payment_routing_defaults d
    join public.payment_instruments i on i.id=d.instrument_id and i.is_active
   where d.is_active
     and d.purpose=p_purpose
     and ((d.scope='business' and d.user_id is null) or (d.scope='user' and d.user_id=v_uid))
     and (d.service_type is null or (v_service is not null and lower(d.service_type)=v_service))
     and (d.provider_key is null or (v_provider is not null and d.provider_key=v_provider))
     and (d.customer_payment_method is null or (v_method is not null and lower(d.customer_payment_method)=v_method))
     and (d.funding_method is null or (v_funding is not null and lower(d.funding_method)=v_funding))
   order by case when d.scope='user' then 10000 else 0 end desc,
            case when d.service_type is not null then 1000 else 0 end desc,
            case when d.provider_key is not null then 500 else 0 end desc,
            case when d.customer_payment_method is not null then 250 else 0 end desc,
            case when d.funding_method is not null then 250 else 0 end desc,
            d.priority desc, d.created_at asc, d.id asc
   limit 1;
  if not found then return jsonb_build_object('success',false,'reason','no_default_configured','purpose',p_purpose); end if;
  v_score := case when v_route.scope='user' then 10000 else 0 end
    + case when v_route.service_type is not null then 1000 else 0 end
    + case when v_route.provider_key is not null then 500 else 0 end
    + case when v_route.customer_payment_method is not null then 250 else 0 end
    + case when v_route.funding_method is not null then 250 else 0 end
    + coalesce(v_route.priority,100);
  return jsonb_build_object('success',true,'id',v_route.id,'instrument_id',v_route.instrument_id,'instrument_name',v_route.instrument_name,'instrument_type',v_route.instrument_type,'purpose',v_route.purpose,'service_type',v_route.service_type,'provider_key',v_route.provider_key,'customer_payment_method',v_route.customer_payment_method,'funding_method',v_route.funding_method,'scope',v_route.scope,'source',v_route.source,'is_system_default',v_route.is_system_default,'priority',v_route.priority,'score',v_score);
end;
$$;
revoke execute on function public.resolve_default_payment_route(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.resolve_default_payment_route(text,text,text,text,text,uuid) to authenticated;
