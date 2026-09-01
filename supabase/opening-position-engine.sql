-- ==============================================================================
-- OPENING POSITION & BALANCE SHEET STARTING ENGINE
-- Authoritative First-Class Accounting Initialization for Café ERP
-- ==============================================================================

create table if not exists public.opening_positions (
  id uuid primary key default gen_random_uuid(),
  opening_date date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'reversed')),
  total_assets numeric(15,2) not null default 0 check (total_assets >= 0),
  total_liabilities numeric(15,2) not null default 0 check (total_liabilities >= 0),
  opening_capital numeric(15,2) not null default 0,
  difference numeric(15,2) not null default 0,
  snapshot_data jsonb not null default '{}'::jsonb,
  remarks text,
  created_by uuid references public.profiles(id) on delete set null,
  finalized_by uuid references public.profiles(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opening_positions_date on public.opening_positions (opening_date desc);
create index if not exists idx_opening_positions_status on public.opening_positions (status);
create unique index if not exists idx_opening_positions_finalized_unique
  on public.opening_positions (opening_date) where status = 'finalized';

alter table public.opening_positions enable row level security;

drop policy if exists "opening_positions select" on public.opening_positions;
create policy "opening_positions select" on public.opening_positions for select to authenticated using (public.is_back_office());

drop policy if exists "opening_positions insert" on public.opening_positions;
create policy "opening_positions insert" on public.opening_positions for insert to authenticated with check (public.is_back_office());

drop policy if exists "opening_positions update" on public.opening_positions;
create policy "opening_positions update" on public.opening_positions for update to authenticated using (public.is_back_office()) with check (public.is_back_office());

-- Function: Finalize Opening Position Transactionally
create or replace function public.finalize_opening_position(
  p_opening_date date,
  p_cash numeric default 0,
  p_cash_notes text default null,
  p_banks jsonb default '[]'::jsonb,
  p_digital jsonb default '{}'::jsonb,
  p_receivables jsonb default '[]'::jsonb,
  p_inventory jsonb default '[]'::jsonb,
  p_payables jsonb default '[]'::jsonb,
  p_other_liabilities jsonb default '[]'::jsonb,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_pos_id uuid;
  v_total_assets numeric := 0;
  v_total_liabilities numeric := 0;
  v_opening_capital numeric := 0;
  v_bank_total numeric := 0;
  v_digital_total numeric := 0;
  v_receivable_total numeric := 0;
  v_inventory_total numeric := 0;
  v_payable_total numeric := 0;
  v_other_liab_total numeric := 0;
  v_item jsonb;
  v_inst_id uuid;
  v_amount numeric;
  v_qty numeric;
  v_cost numeric;
  v_prod_id uuid;
  v_cust_id uuid;
  v_supp_id uuid;
  v_curr_bal numeric;
  v_curr_stock numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_back_office() then raise exception 'Forbidden: only back-office staff may finalize opening position'; end if;
  if p_opening_date is null then raise exception 'Opening date is required'; end if;

  -- Duplicate Finalization Guard
  if exists (select 1 from public.opening_positions where opening_date = p_opening_date and status = 'finalized') then
    raise exception 'An opening position has already been finalized for date %', p_opening_date;
  end if;

  -- 1. Cash In Hand
  v_total_assets := v_total_assets + coalesce(p_cash, 0);
  if coalesce(p_cash, 0) > 0 then
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('cash', null, p_cash, p_opening_date, coalesce(p_cash_notes, 'Opening Position Cash in Hand'), false, auth.uid());
  end if;

  -- 2. Bank Accounts
  for v_item in select * from jsonb_array_elements(p_banks)
  loop
    v_inst_id := (v_item->>'instrument_id')::uuid;
    v_amount := coalesce((v_item->>'amount')::numeric, 0);
    if v_amount > 0 and v_inst_id is not null then
      v_bank_total := v_bank_total + v_amount;
      insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
      values ('bank', v_inst_id, v_amount, p_opening_date, coalesce(v_item->>'remarks', 'Opening Position Bank Balance'), false, auth.uid());
    end if;
  end loop;
  v_total_assets := v_total_assets + v_bank_total;

  -- 3. Digital Floats
  if coalesce((p_digital->>'upi_qr')::numeric, 0) > 0 then
    v_amount := (p_digital->>'upi_qr')::numeric;
    v_digital_total := v_digital_total + v_amount;
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('upi_qr', null, v_amount, p_opening_date, 'Opening Position UPI QR Float', false, auth.uid());
  end if;

  if coalesce((p_digital->>'wallet')::numeric, 0) > 0 then
    v_amount := (p_digital->>'wallet')::numeric;
    v_digital_total := v_digital_total + v_amount;
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('wallet', null, v_amount, p_opening_date, 'Opening Position Digital Wallet Float', false, auth.uid());
  end if;

  if coalesce((p_digital->>'aeps')::numeric, 0) > 0 then
    v_amount := (p_digital->>'aeps')::numeric;
    v_digital_total := v_digital_total + v_amount;
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('aeps', null, v_amount, p_opening_date, 'Opening Position AEPS Float', false, auth.uid());
  end if;

  if coalesce((p_digital->>'dmt')::numeric, 0) > 0 then
    v_amount := (p_digital->>'dmt')::numeric;
    v_digital_total := v_digital_total + v_amount;
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('dmt', null, v_amount, p_opening_date, 'Opening Position DMT Float', false, auth.uid());
  end if;

  if coalesce((p_digital->>'recharge')::numeric, 0) > 0 then
    v_amount := (p_digital->>'recharge')::numeric;
    v_digital_total := v_digital_total + v_amount;
    insert into public.opening_balances (pool, instrument_id, amount, as_of, remarks, is_auto, created_by)
    values ('recharge', null, v_amount, p_opening_date, 'Opening Position Mobile Recharge Float', false, auth.uid());
  end if;
  v_total_assets := v_total_assets + v_digital_total;

  -- 4. Customer Receivables
  for v_item in select * from jsonb_array_elements(p_receivables)
  loop
    v_cust_id := (v_item->>'customer_id')::uuid;
    v_amount := coalesce((v_item->>'amount')::numeric, 0);
    if v_amount > 0 and v_cust_id is not null then
      v_receivable_total := v_receivable_total + v_amount;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, credit, balance_after)
      values (v_cust_id, p_opening_date, 'opening', coalesce(v_item->>'remarks', 'Opening Receivable Balance'), v_amount, 0, v_amount);
    end if;
  end loop;
  v_total_assets := v_total_assets + v_receivable_total;

  -- Authorize the inventory writes below through the stock-protection trigger.
  -- The product update and its journal insert remain in this RPC transaction.
  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  -- 5. Opening Inventory
  for v_item in select * from jsonb_array_elements(p_inventory)
  loop
    v_prod_id := (v_item->>'product_id')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    v_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
    if v_qty > 0 and v_prod_id is not null then
      v_inventory_total := v_inventory_total + (v_qty * v_cost);
      
      -- Update product stock and cost
      update public.products
      set stock_qty = coalesce(stock_qty, 0) + v_qty,
          cost_price = case when v_cost > 0 then v_cost else cost_price end
      where id = v_prod_id
      returning stock_qty into v_curr_stock;

      -- Append to stock movements journal
      insert into public.stock_movements (product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, remarks, created_by)
      values (v_prod_id, p_opening_date, 'OPENING_STOCK', v_qty, v_cost, coalesce(v_curr_stock, v_qty), coalesce(v_item->>'remarks', 'Opening Inventory Stock'), auth.uid());
    end if;
  end loop;
  v_total_assets := v_total_assets + v_inventory_total;

  -- 6. Supplier Payables
  for v_item in select * from jsonb_array_elements(p_payables)
  loop
    v_supp_id := (v_item->>'supplier_id')::uuid;
    v_amount := coalesce((v_item->>'amount')::numeric, 0);
    if v_amount > 0 and v_supp_id is not null then
      v_payable_total := v_payable_total + v_amount;
      
      update public.suppliers
      set opening_balance = coalesce(opening_balance, 0) + v_amount,
          current_balance = coalesce(current_balance, 0) + v_amount
      where id = v_supp_id
      returning current_balance into v_curr_bal;

      insert into public.supplier_ledger (supplier_id, entry_date, type, description, debit, credit, balance_after, ref_type)
      values (v_supp_id, p_opening_date, 'opening', coalesce(v_item->>'remarks', 'Opening Payable Balance'), 0, v_amount, coalesce(v_curr_bal, v_amount), 'opening');
    end if;
  end loop;
  v_total_liabilities := v_total_liabilities + v_payable_total;

  -- 7. Other Liabilities
  for v_item in select * from jsonb_array_elements(p_other_liabilities)
  loop
    v_amount := coalesce((v_item->>'amount')::numeric, 0);
    if v_amount > 0 then
      v_other_liab_total := v_other_liab_total + v_amount;
    end if;
  end loop;
  v_total_liabilities := v_total_liabilities + v_other_liab_total;

  -- 8. Calculate Opening Capital (Equity)
  v_opening_capital := v_total_assets - v_total_liabilities;

  -- 9. Insert Finalized Opening Position Header
  insert into public.opening_positions (
    opening_date, status, total_assets, total_liabilities, opening_capital, difference,
    snapshot_data, remarks, created_by, finalized_by, finalized_at
  )
  values (
    p_opening_date, 'finalized', v_total_assets, v_total_liabilities, v_opening_capital, 0,
    jsonb_build_object(
      'cash', p_cash,
      'banks', p_banks,
      'bank_total', v_bank_total,
      'digital', p_digital,
      'digital_total', v_digital_total,
      'receivables', p_receivables,
      'receivable_total', v_receivable_total,
      'inventory', p_inventory,
      'inventory_total', v_inventory_total,
      'payables', p_payables,
      'payable_total', v_payable_total,
      'other_liabilities', p_other_liabilities,
      'other_liab_total', v_other_liab_total,
      'opening_capital', v_opening_capital
    ),
    p_remarks, auth.uid(), auth.uid(), now()
  )
  returning id into v_pos_id;

  -- 10. Audit Log
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'opening_position_finalized', 'opening_positions', v_pos_id::text,
    'Finalized Opening Position for ' || p_opening_date || ' | Assets: ' || v_total_assets || ' | Liabilities: ' || v_total_liabilities || ' | Capital: ' || v_opening_capital,
    jsonb_build_object(
      'opening_date', p_opening_date,
      'total_assets', v_total_assets,
      'total_liabilities', v_total_liabilities,
      'opening_capital', v_opening_capital
    )
  );

  return jsonb_build_object(
    'id', v_pos_id,
    'opening_date', p_opening_date,
    'status', 'finalized',
    'total_assets', v_total_assets,
    'total_liabilities', v_total_liabilities,
    'opening_capital', v_opening_capital,
    'difference', 0
  );
end;
$$;

grant execute on function public.finalize_opening_position(date, numeric, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
