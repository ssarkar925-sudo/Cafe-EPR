-- ============================================================================
-- AEPS PORTAL <-> PAYMENT INSTRUMENT / FLOAT CANONICAL SYNC
-- ============================================================================
-- One logical AEPS provider must have exactly one financial payment instrument.
-- payment_instruments = the authoritative money/float account.
-- aeps_portals       = the operational AEPS provider/portal identity.
-- They are linked 1:1 through aeps_portals.payment_instrument_id.
--
-- This migration fixes two creation paths that previously diverged:
--   1) Payment Accounts -> creates an AEPS float but no portal row.
--   2) AEPS Portals -> creates a portal row but no linked float.
--
-- It also prevents duplicate AEPS portal names (case/whitespace insensitive)
-- and keeps the two records synchronized.
-- ============================================================================

create unique index if not exists aeps_portals_normalized_name_uidx
  on public.aeps_portals (lower(btrim(name)));

create unique index if not exists payment_instruments_aeps_normalized_name_uidx
  on public.payment_instruments (lower(btrim(name)))
  where type = 'aeps_portal';

create or replace function public.sync_aeps_portal_to_payment_instrument()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(new.name);
  v_instrument_id uuid;
  v_instrument_name text;
  v_instrument_type text;
  v_existing_id uuid;
begin
  if v_name = '' then
    raise exception 'AEPS portal name is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));
  new.name := v_name;

  if new.payment_instrument_id is not null then
    select id, name, type
      into v_instrument_id, v_instrument_name, v_instrument_type
    from public.payment_instruments
    where id = new.payment_instrument_id;

    if v_instrument_id is null then
      raise exception 'AEPS payment account % not found', new.payment_instrument_id;
    end if;
    if v_instrument_type <> 'aeps_portal' then
      raise exception 'Payment account % is not an AEPS portal account', new.payment_instrument_id;
    end if;
    if lower(btrim(v_instrument_name)) <> lower(v_name) then
      raise exception 'AEPS portal name and payment account name must match';
    end if;

    select id into v_existing_id
    from public.aeps_portals
    where payment_instrument_id = new.payment_instrument_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    limit 1;
    if v_existing_id is not null then
      raise exception 'AEPS payment account is already linked to another portal';
    end if;

    select id into v_existing_id
    from public.aeps_portals
    where lower(btrim(name)) = lower(v_name)
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    limit 1;
    if v_existing_id is not null then
      raise exception 'AEPS portal % already exists', v_name;
    end if;

    return new;
  end if;

  select id into v_instrument_id
  from public.payment_instruments
  where type = 'aeps_portal'
    and lower(btrim(name)) = lower(v_name)
  order by created_at, id
  limit 1;

  if v_instrument_id is not null then
    new.payment_instrument_id := v_instrument_id;
    return new;
  end if;

  perform set_config('app.aeps_portal_bootstrap', 'on', true);
  begin
    insert into public.payment_instruments (
      name, type, is_active, created_by, details, opening_balance, current_balance
    ) values (
      v_name, 'aeps_portal', coalesce(new.is_active, true), auth.uid(), '{}'::jsonb, 0, 0
    )
    returning id into v_instrument_id;
  exception when unique_violation then
    select id into v_instrument_id
    from public.payment_instruments
    where type = 'aeps_portal'
      and lower(btrim(name)) = lower(v_name)
    order by created_at, id
    limit 1;
    if v_instrument_id is null then
      raise;
    end if;
  end;
  perform set_config('app.aeps_portal_bootstrap', 'off', true);

  new.payment_instrument_id := v_instrument_id;
  return new;
end;
$$;

create or replace function public.sync_aeps_payment_instrument_to_portal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(new.name);
  v_portal_id uuid;
  v_linked_instrument_id uuid;
begin
  if new.type <> 'aeps_portal' then
    if tg_op = 'UPDATE' then
      select id into v_linked_instrument_id
      from public.aeps_portals
      where payment_instrument_id = new.id
      limit 1;
      if v_linked_instrument_id is not null then
        raise exception 'Cannot change AEPS payment account type while it is linked to a portal';
      end if;
    end if;
    return new;
  end if;

  if v_name = '' then
    raise exception 'AEPS payment account name is required';
  end if;
  new.name := v_name;

  if current_setting('app.aeps_portal_bootstrap', true) = 'on' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));

  select id into v_portal_id
  from public.aeps_portals
  where payment_instrument_id = new.id
  limit 1;

  if v_portal_id is not null then
    update public.aeps_portals
       set name = v_name,
           is_active = new.is_active
     where id = v_portal_id;
    return new;
  end if;

  select id into v_portal_id
  from public.aeps_portals
  where lower(btrim(name)) = lower(v_name)
    and payment_instrument_id is null
  limit 1;

  if v_portal_id is not null then
    update public.aeps_portals
       set payment_instrument_id = new.id,
           is_active = new.is_active
     where id = v_portal_id;
    return new;
  end if;

  select id into v_portal_id
  from public.aeps_portals
  where lower(btrim(name)) = lower(v_name)
    and payment_instrument_id is not null
  limit 1;
  if v_portal_id is not null then
    raise exception 'AEPS portal % is already linked to another payment account', v_name;
  end if;

  insert into public.aeps_portals (
    name, is_active, payment_instrument_id
  ) values (
    v_name, new.is_active, new.id
  );

  return new;
end;
$$;

create or replace function public.prevent_linked_aeps_portal_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.payment_instrument_id is not null then
    raise exception 'Cannot delete an AEPS portal linked to a payment account; deactivate it instead';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_sync_aeps_portal_to_payment_instrument on public.aeps_portals;
create trigger trg_sync_aeps_portal_to_payment_instrument
before insert or update of name, payment_instrument_id on public.aeps_portals
for each row execute function public.sync_aeps_portal_to_payment_instrument();

drop trigger if exists trg_sync_aeps_payment_instrument_to_portal on public.payment_instruments;
create trigger trg_sync_aeps_payment_instrument_to_portal
after insert or update of name, type, is_active on public.payment_instruments
for each row execute function public.sync_aeps_payment_instrument_to_portal();

drop trigger if exists trg_prevent_linked_aeps_portal_delete on public.aeps_portals;
create trigger trg_prevent_linked_aeps_portal_delete
before delete on public.aeps_portals
for each row execute function public.prevent_linked_aeps_portal_delete();

insert into public.aeps_portals (name, is_active, payment_instrument_id)
select pi.name, pi.is_active, pi.id
from public.payment_instruments pi
where pi.type = 'aeps_portal'
  and not exists (
    select 1 from public.aeps_portals ap where ap.payment_instrument_id = pi.id
  )
  and not exists (
    select 1 from public.aeps_portals ap
    where lower(btrim(ap.name)) = lower(btrim(pi.name))
  );

update public.aeps_portals ap
set payment_instrument_id = pi.id,
    is_active = pi.is_active
from public.payment_instruments pi
where ap.payment_instrument_id is null
  and pi.type = 'aeps_portal'
  and lower(btrim(pi.name)) = lower(btrim(ap.name));

update public.payment_instruments pi
set name = btrim(ap.name),
    is_active = ap.is_active
from public.aeps_portals ap
where ap.payment_instrument_id = pi.id
  and pi.type = 'aeps_portal'
  and (btrim(pi.name) <> btrim(ap.name) or pi.is_active is distinct from ap.is_active);

revoke all on function public.sync_aeps_portal_to_payment_instrument() from public, anon, authenticated;
grant execute on function public.sync_aeps_portal_to_payment_instrument() to service_role;
revoke all on function public.sync_aeps_payment_instrument_to_portal() from public, anon, authenticated;
grant execute on function public.sync_aeps_payment_instrument_to_portal() to service_role;
revoke all on function public.prevent_linked_aeps_portal_delete() from public, anon, authenticated;
grant execute on function public.prevent_linked_aeps_portal_delete() to service_role;
