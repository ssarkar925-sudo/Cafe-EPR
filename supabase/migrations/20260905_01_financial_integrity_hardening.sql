-- Financial integrity hardening: canonical settlement balances, settlement cash ownership,
-- atomic customer payment workflow, and customer-ledger reconciliation.

create or replace function public.get_settlement_summary_internal()
returns table(pool text, available_balance numeric, pending_in numeric, pending_out numeric, today_settled numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pool text;
  v_balances jsonb;
  v_current numeric;
  v_tin numeric;
  v_tout numeric;
  v_tset numeric;
begin
  v_balances := public.get_pool_balances(current_date);

  foreach v_pool in array array['cash','bank','wallet','dmt','aeps','upi_qr','credit_card']
  loop
    v_current := coalesce((v_balances -> v_pool ->> 'current')::numeric, 0);

    select coalesce(sum(amount),0) into v_tin
    from public.settlements
    where status='pending' and to_pool=v_pool;

    select coalesce(sum(amount),0) into v_tout
    from public.settlements
    where status='pending' and from_pool=v_pool;

    select coalesce(sum(amount),0) into v_tset
    from public.settlements
    where status='success'
      and (to_pool=v_pool or from_pool=v_pool)
      and settlement_date=current_date;

    pool := v_pool;
    available_balance := v_current;
    pending_in := v_tin;
    pending_out := v_tout;
    today_settled := v_tset;
    return next;
  end loop;
end;
$$;

-- Settlement cash entries are created by the canonical settlement RPC/triggers.
-- A client must never be able to add a second uninstrumented bank/wallet/etc. leg.
create or replace function public.enforce_settlement_cash_entry_ownership()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type text;
begin
  if new.ref_type <> 'settlement' or new.ref_id is null then
    return new;
  end if;

  select settlement_type into v_type
  from public.settlements
  where id = new.ref_id;

  if v_type is null then
    raise exception 'Settlement money trail references an unknown settlement';
  end if;

  if new.instrument_id is null
     and new.method <> 'cash'
     and v_type not in ('cash_adjustment','bank_withdrawal','add_cash_to_bank') then
    raise exception 'Settlement % requires an instrument-linked money trail for %', new.ref_id, new.method;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_settlement_cash_entry_ownership on public.cash_entries;
create trigger trg_enforce_settlement_cash_entry_ownership
before insert or update on public.cash_entries
for each row execute function public.enforce_settlement_cash_entry_ownership();

create or replace function public.record_customer_payment_atomic(
  p_customer_id uuid,
  p_entry_date date,
  p_amount numeric,
  p_method text default 'cash',
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_method text := lower(coalesce(nullif(trim(p_method),''),'cash'));
  v_prev numeric;
  v_new numeric;
  v_name text;
  v_ledger uuid;
  v_remaining numeric := v_amount;
  v_allocated numeric := 0;
  v_invoice_count integer := 0;
  v_inv record;
  v_due numeric;
  v_applied numeric;
  v_new_paid numeric;
  v_new_due numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_customer_id is null or v_amount <= 0 then
    raise exception 'Customer and positive amount are required';
  end if;
  if v_method not in ('cash','upi','card','bank','wallet','debit_card','credit_card') then
    raise exception 'Invalid payment method';
  end if;

  -- Lock invoices first, in deterministic FIFO order, then the customer row.
  -- This keeps this workflow compatible with invoice-level payment locking.
  for v_inv in
    select id, invoice_number, total, paid, due, status
    from public.invoices
    where customer_id=p_customer_id
      and status <> 'cancelled'
      and greatest(0,coalesce(total,0)-coalesce(paid,0)) > 0.005
    order by invoice_date asc, created_at asc, id asc
    for update
  loop
    v_due := greatest(0, round(coalesce(v_inv.total,0)-coalesce(v_inv.paid,0),2));
    exit when v_remaining <= 0;
    v_applied := least(v_remaining, v_due);
    if v_applied <= 0 then continue; end if;

    v_new_paid := round(coalesce(v_inv.paid,0)+v_applied,2);
    v_new_due := greatest(0, round(coalesce(v_inv.total,0)-v_new_paid,2));

    insert into public.payments(invoice_id, amount, method, received_at, note)
    values (
      v_inv.id,
      v_applied,
      v_method,
      coalesce(p_entry_date,current_date)::timestamp with time zone,
      coalesce(p_description,'Customer payment') || ' — FIFO ' || v_inv.invoice_number
    );

    update public.invoices
    set paid=v_new_paid,
        due=v_new_due,
        status=case when v_new_due <= 0.005 then 'paid' else 'partial' end,
        updated_at=now()
    where id=v_inv.id;

    v_remaining := v_remaining - v_applied;
    v_allocated := v_allocated + v_applied;
    v_invoice_count := v_invoice_count + 1;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('erp:customer:'||p_customer_id::text,0));
  select coalesce(balance,0), name into v_prev, v_name
  from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;

  v_new := round(v_prev-v_amount,2);
  update public.customers set balance=v_new, updated_at=now() where id=p_customer_id;

  insert into public.customer_ledger(
    customer_id, entry_date, type, description, debit, credit, balance_after
  ) values (
    p_customer_id,
    coalesce(p_entry_date,current_date),
    case when v_remaining > 0.005 then 'advance' else 'payment' end,
    coalesce(p_description,'Payment received') ||
      case when v_remaining > 0.005 then ' (unallocated advance)' else '' end,
    0,
    v_amount,
    v_new
  ) returning id into v_ledger;

  insert into public.cash_entries(
    entry_date, method, direction, amount, description, ref_type, ref_id
  ) values (
    coalesce(p_entry_date,current_date),
    v_method,
    'in',
    v_amount,
    'Customer payment - ' || v_name,
    'customer_payment',
    v_ledger
  );

  return jsonb_build_object(
    'ok',true,
    'customer_id',p_customer_id,
    'balance',v_new,
    'ledger_id',v_ledger,
    'allocated_amount',v_allocated,
    'advance_amount',greatest(0,v_remaining),
    'invoice_count',v_invoice_count
  );
end;
$$;

revoke execute on function public.record_customer_payment_atomic(uuid,date,numeric,text,text) from public, anon;
grant execute on function public.record_customer_payment_atomic(uuid,date,numeric,text,text) to authenticated, service_role;

-- Read-only subsidiary-ledger reconciliation endpoint. A missing ledger is reported
-- as unseeded rather than falsely treating the customer's stored balance as zero.
create or replace function public.get_customer_ledger_reconciliation(p_customer_id uuid default null)
returns table(
  customer_id uuid,
  customer_name text,
  stored_balance numeric,
  ledger_balance numeric,
  variance numeric,
  ledger_rows bigint,
  status text
)
language sql
security definer
set search_path to 'public'
as $$
  with ledger as (
    select cl.customer_id,
           count(*)::bigint as row_count,
           (array_agg(cl.balance_after order by cl.entry_date desc, cl.created_at desc))[1]::numeric as last_balance
    from public.customer_ledger cl
    where p_customer_id is null or cl.customer_id=p_customer_id
    group by cl.customer_id
  )
  select c.id,
         c.name,
         coalesce(c.balance,0)::numeric,
         coalesce(l.last_balance,0)::numeric,
         case when l.customer_id is null then null
              else round(coalesce(c.balance,0)-coalesce(l.last_balance,0),2) end,
         coalesce(l.row_count,0),
         case when l.customer_id is null then 'unseeded'
              when abs(round(coalesce(c.balance,0)-coalesce(l.last_balance,0),2)) <= 0.01 then 'ok'
              else 'mismatch' end
  from public.customers c
  left join ledger l on l.customer_id=c.id
  where c.is_active=true
    and (p_customer_id is null or c.id=p_customer_id)
  order by c.name;
$$;

revoke execute on function public.get_customer_ledger_reconciliation(uuid) from public, anon;
grant execute on function public.get_customer_ledger_reconciliation(uuid) to authenticated, service_role;

create or replace function public.get_financial_integrity_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_mismatch bigint;
  v_customer_unseeded bigint;
  v_unbalanced_journals bigint;
  v_settlement_cash_duplicates bigint;
  v_pool jsonb;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  select count(*) filter (where status='mismatch'), count(*) filter (where status='unseeded')
  into v_customer_mismatch, v_customer_unseeded
  from public.get_customer_ledger_reconciliation(null);

  select count(*) into v_unbalanced_journals
  from (
    select je.id
    from public.journal_entries je
    join public.journal_lines jl on jl.journal_entry_id=je.id
    where je.status='posted'
    group by je.id
    having abs(sum(coalesce(jl.debit,0))-sum(coalesce(jl.credit,0))) > 0.01
  ) x;

  select count(*) into v_settlement_cash_duplicates
  from (
    select ref_id, method, direction, count(*) as n
    from public.cash_entries
    where ref_type='settlement'
    group by ref_id, method, direction
    having count(*) > 1
  ) x;

  select public.get_pool_balances(current_date) into v_pool;

  return jsonb_build_object(
    'customers', jsonb_build_object('mismatches',v_customer_mismatch,'unseeded',v_customer_unseeded),
    'journals', jsonb_build_object('unbalanced_posted',v_unbalanced_journals),
    'settlements', jsonb_build_object('duplicate_cash_legs',v_settlement_cash_duplicates),
    'pool_balances',v_pool,
    'healthy', (v_customer_mismatch=0 and v_unbalanced_journals=0 and v_settlement_cash_duplicates=0)
  );
end;
$$;

revoke execute on function public.get_financial_integrity_snapshot() from public, anon;
grant execute on function public.get_financial_integrity_snapshot() to authenticated, service_role;
