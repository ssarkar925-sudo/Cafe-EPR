create table if not exists public.payment_routing_defaults (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('customer_collection','provider_funding','settlement_source','settlement_destination','pos_payment','invoice_payment','supplier_payment')),
  service_type text,
  provider_key text,
  customer_payment_method text,
  funding_method text,
  scope text not null default 'business' check (scope in ('business','user')),
  user_id uuid references public.profiles(id) on delete cascade,
  instrument_id uuid not null references public.payment_instruments(id),
  priority integer not null default 100 check (priority between 0 and 10000),
  is_active boolean not null default true,
  is_system_default boolean not null default false,
  source text not null default 'business' check (source in ('system','business','user')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_routing_defaults_scope_user_ck check ((scope='business' and user_id is null) or (scope='user' and user_id is not null))
);

create unique index if not exists payment_routing_defaults_active_unique_idx
  on public.payment_routing_defaults (
    purpose,
    coalesce(service_type,''),
    coalesce(provider_key,''),
    coalesce(customer_payment_method,''),
    coalesce(funding_method,''),
    scope,
    coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid)
  ) where is_active;

create index if not exists payment_routing_defaults_lookup_idx
  on public.payment_routing_defaults (purpose, service_type, provider_key, customer_payment_method, funding_method, scope, user_id)
  where is_active;

create index if not exists payment_routing_defaults_instrument_idx
  on public.payment_routing_defaults (instrument_id)
  where is_active;

alter table public.payment_routing_defaults enable row level security;

drop policy if exists payment_routing_defaults_admin_select on public.payment_routing_defaults;
drop policy if exists payment_routing_defaults_admin_insert on public.payment_routing_defaults;
drop policy if exists payment_routing_defaults_admin_update on public.payment_routing_defaults;
drop policy if exists payment_routing_defaults_admin_delete on public.payment_routing_defaults;

create policy payment_routing_defaults_admin_select on public.payment_routing_defaults
  for select to authenticated using (public.is_admin());
create policy payment_routing_defaults_admin_insert on public.payment_routing_defaults
  for insert to authenticated with check (public.is_admin());
create policy payment_routing_defaults_admin_update on public.payment_routing_defaults
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy payment_routing_defaults_admin_delete on public.payment_routing_defaults
  for delete to authenticated using (public.is_admin());

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
  if auth.uid() is null and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Not authenticated';
  end if;
  if p_purpose not in ('customer_collection','provider_funding','settlement_source','settlement_destination','pos_payment','invoice_payment','supplier_payment') then
    raise exception 'Invalid routing purpose';
  end if;
  if v_method in ('qr','upi_qr') then v_method := 'upi'; end if;
  if v_method = 'card' then v_method := null; end if;

  select d.*, i.name as instrument_name, lower(i.type) as instrument_type
    into v_route
    from public.payment_routing_defaults d
    join public.payment_instruments i on i.id=d.instrument_id and i.is_active
   where d.is_active
     and d.purpose=p_purpose
     and ((d.scope='business' and d.user_id is null) or (d.scope='user' and d.user_id=v_uid))
     and (d.service_type is null or (v_service is not null and lower(d.service_type)=v_service))
     and (d.provider_key is null or (v_provider is not null and d.provider_key=v_provider))
     and (d.customer_payment_method is null or (v_method is not null and lower(d.customer_payment_method)=v_method))
     and (d.funding_method is null or (v_funding is not null and lower(d.funding_method)=v_funding))
   order by
     case when d.scope='user' then 10000 else 0 end desc,
     case when d.service_type is not null then 1000 else 0 end desc,
     case when d.provider_key is not null then 500 else 0 end desc,
     case when d.customer_payment_method is not null then 250 else 0 end desc,
     case when d.funding_method is not null then 250 else 0 end desc,
     d.priority desc,
     d.created_at asc,
     d.id asc
   limit 1;

  if not found then
    return jsonb_build_object('success',false,'reason','no_default_configured','purpose',p_purpose);
  end if;

  v_score := case when v_route.scope='user' then 10000 else 0 end
    + case when v_route.service_type is not null then 1000 else 0 end
    + case when v_route.provider_key is not null then 500 else 0 end
    + case when v_route.customer_payment_method is not null then 250 else 0 end
    + case when v_route.funding_method is not null then 250 else 0 end
    + coalesce(v_route.priority,100);

  return jsonb_build_object(
    'success',true,
    'id',v_route.id,
    'instrument_id',v_route.instrument_id,
    'instrument_name',v_route.instrument_name,
    'instrument_type',v_route.instrument_type,
    'purpose',v_route.purpose,
    'service_type',v_route.service_type,
    'provider_key',v_route.provider_key,
    'customer_payment_method',v_route.customer_payment_method,
    'funding_method',v_route.funding_method,
    'scope',v_route.scope,
    'source',v_route.source,
    'is_system_default',v_route.is_system_default,
    'priority',v_route.priority,
    'score',v_score
  );
end;
$$;

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
  if p_purpose not in ('customer_collection','provider_funding','settlement_source','settlement_destination','pos_payment','invoice_payment','supplier_payment') then
    raise exception 'Invalid routing purpose';
  end if;
  if p_instrument_id is null then raise exception 'Instrument is required'; end if;
  if p_user_id is not null and p_user_id<>v_uid then raise exception 'Only the signed-in user can manage a user-scoped default'; end if;
  v_scope := case when p_user_id is null then 'business' else 'user' end;

  select lower(type), name into v_inst_type, v_name
    from public.payment_instruments
   where id=p_instrument_id and is_active;
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

  update public.payment_routing_defaults
     set is_active=false, updated_at=now()
   where is_active
     and purpose=p_purpose
     and coalesce(service_type,'')=coalesce(v_service,'')
     and coalesce(provider_key,'')=coalesce(v_provider,'')
     and coalesce(customer_payment_method,'')=coalesce(v_method,'')
     and coalesce(funding_method,'')=coalesce(v_funding,'')
     and scope=v_scope
     and coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_user_id,'00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.payment_routing_defaults (
    purpose, service_type, provider_key, customer_payment_method, funding_method,
    scope, user_id, instrument_id, priority, is_active, is_system_default, source, notes, created_by, updated_at
  ) values (
    p_purpose, v_service, v_provider, v_method, v_funding,
    v_scope, p_user_id, p_instrument_id, coalesce(p_priority,100), true, false,
    case when v_scope='user' then 'user' else 'business' end,
    p_notes, v_uid, now()
  ) returning id into v_new_id;

  perform public.log_audit_event('update','payment_routing_default',v_new_id::text,
    'Default route set: '||p_purpose||' → '||v_name,
    jsonb_build_object('purpose',p_purpose,'service_type',v_service,'provider_key',v_provider,'customer_payment_method',v_method,'funding_method',v_funding,'instrument_id',p_instrument_id,'instrument_name',v_name,'scope',v_scope));

  return jsonb_build_object('success',true,'id',v_new_id,'instrument_id',p_instrument_id,'instrument_name',v_name,'purpose',p_purpose,'service_type',v_service,'customer_payment_method',v_method,'funding_method',v_funding);
end;
$$;

create or replace function public.clear_payment_routing_default(
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
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  update public.payment_routing_defaults
     set is_active=false, updated_at=now()
   where is_active
     and purpose=p_purpose
     and coalesce(service_type,'')=coalesce(nullif(trim(coalesce(p_service_type,'')),''),'')
     and coalesce(provider_key,'')=coalesce(nullif(trim(coalesce(p_provider_key,'')),''),'')
     and coalesce(customer_payment_method,'')=coalesce(lower(nullif(trim(coalesce(p_customer_payment_method,'')),'')),'')
     and coalesce(funding_method,'')=coalesce(lower(nullif(trim(coalesce(p_funding_method,'')),'')),'')
     and scope=case when p_user_id is null then 'business' else 'user' end
     and coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_user_id,'00000000-0000-0000-0000-000000000000'::uuid);
  get diagnostics v_count = row_count;
  return jsonb_build_object('success',true,'deactivated',v_count);
end;
$$;

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

revoke execute on function public.resolve_default_payment_route(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.resolve_default_payment_route(text,text,text,text,text,uuid) to authenticated;
revoke execute on function public.set_payment_routing_default(text,uuid,text,text,text,text,uuid,integer,text) from public, anon;
grant execute on function public.set_payment_routing_default(text,uuid,text,text,text,text,uuid,integer,text) to authenticated;
revoke execute on function public.clear_payment_routing_default(text,text,text,text,text,uuid) from public, anon;
grant execute on function public.clear_payment_routing_default(text,text,text,text,text,uuid) to authenticated;
revoke execute on function public.resolve_payment_instrument(text,uuid) from public, anon;
grant execute on function public.resolve_payment_instrument(text,uuid) to authenticated;

insert into public.payment_routing_defaults (purpose, customer_payment_method, instrument_id, priority, is_system_default, source, notes)
select 'customer_collection','cash',pi.id,100,true,'system','Seeded because exactly one active cash instrument exists.'
from public.payment_instruments pi
where pi.is_active and lower(pi.type)='cash'
  and (select count(*) from public.payment_instruments x where x.is_active and lower(x.type)='cash')=1
  and not exists (select 1 from public.payment_routing_defaults d where d.is_active and d.purpose='customer_collection' and d.customer_payment_method='cash');

insert into public.payment_routing_defaults (purpose, customer_payment_method, instrument_id, priority, is_system_default, source, notes)
select 'customer_collection','bank',pi.id,100,true,'system','Seeded because exactly one active bank instrument exists.'
from public.payment_instruments pi
where pi.is_active and lower(pi.type)='bank'
  and (select count(*) from public.payment_instruments x where x.is_active and lower(x.type)='bank')=1
  and not exists (select 1 from public.payment_routing_defaults d where d.is_active and d.purpose='customer_collection' and d.customer_payment_method='bank');

insert into public.payment_routing_defaults (purpose, customer_payment_method, instrument_id, priority, is_system_default, source, notes)
select 'customer_collection','upi',pi.id,100,true,'system','Seeded because exactly one active UPI instrument exists.'
from public.payment_instruments pi
where pi.is_active and lower(pi.type) in ('upi','upi_qr')
  and (select count(*) from public.payment_instruments x where x.is_active and lower(x.type) in ('upi','upi_qr'))=1
  and not exists (select 1 from public.payment_routing_defaults d where d.is_active and d.purpose='customer_collection' and d.customer_payment_method='upi');

insert into public.payment_routing_defaults (purpose, service_type, instrument_id, priority, is_system_default, source, notes)
select 'provider_funding',v.service_type,pi.id,100,true,'system','Seeded because exactly one active bank instrument exists; replace in Defaults & Routing when another funding account is preferred.'
from (values ('recharge'),('bill_payment'),('google_play')) v(service_type)
cross join public.payment_instruments pi
where pi.is_active and lower(pi.type)='bank'
  and (select count(*) from public.payment_instruments x where x.is_active and lower(x.type)='bank')=1
  and not exists (select 1 from public.payment_routing_defaults d where d.is_active and d.purpose='provider_funding' and d.service_type=v.service_type);
