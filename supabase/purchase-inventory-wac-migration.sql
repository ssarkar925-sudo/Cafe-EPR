-- ==============================================================================
-- PURCHASE, INVENTORY LEDGER, SUPPLIER PAYABLES & PERPETUAL MOVING WAC ENGINE
-- Canonical Migration Script
-- Cutover Date: 2026-08-25
-- ==============================================================================

create extension if not exists pgcrypto;

-- 1. SEQUENCES
create sequence if not exists public.purchase_number_seq start 1;
create sequence if not exists public.supplier_number_seq start 1;

-- 2. SUPPLIERS MASTER TABLE
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state_code text default null,               -- Explicitly NULL (Zero hardcoding)
  gstin text default null,                    -- Nullable (GST registration not mandatory)
  payment_terms text default 'immediate',     -- 'immediate', 'net_7', 'net_15', 'net_30', 'credit'
  opening_balance numeric(15,2) not null default 0.00,
  current_balance numeric(15,2) not null default 0.00,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. SUPPLIER PAYABLES AUDIT LEDGER (RESTRICT DELETE)
create table if not exists public.supplier_ledger (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  entry_date date not null default current_date,
  type text not null check (type in ('purchase', 'payment', 'return', 'adjustment', 'opening')),
  description text not null,
  debit numeric(15,2) not null default 0.00,   -- Payment / Return (reduces payable)
  credit numeric(15,2) not null default 0.00,  -- Inward Purchase (increases payable)
  balance_after numeric(15,2) not null,
  ref_type text,                               -- 'purchase', 'cash_entry', 'purchase_return', 'manual'
  ref_id uuid,
  created_at timestamptz not null default now()
);

-- 4. PURCHASES HEADER TABLE
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text unique not null,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  supplier_invoice_no text,
  purchase_date date not null default current_date,
  subtotal numeric(15,2) not null default 0.00,
  tax_total numeric(15,2) not null default 0.00,
  total numeric(15,2) not null default 0.00,
  paid numeric(15,2) not null default 0.00,
  due numeric(15,2) not null default 0.00,
  status text not null default 'completed' check (status in ('draft', 'completed', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. PURCHASE ITEMS LINE TABLE
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  qty numeric(15,3) not null check (qty > 0),
  purchase_rate numeric(15,2) not null check (purchase_rate >= 0),
  taxable_value numeric(15,2) not null default 0.00,
  gst_rate numeric not null default 0.00,
  tax_amount numeric(15,2) not null default 0.00,
  total_amount numeric(15,2) not null default 0.00,
  returned_qty numeric(15,3) not null default 0.00
);

-- 6. STOCK MOVEMENTS LEDGER TABLE (Append-Only Physical Inventory Journal)
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_date date not null default current_date,
  movement_type text not null check (movement_type in (
    'OPENING_STOCK', 'PURCHASE', 'SALE', 'SALES_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT'
  )),
  qty_change numeric(15,3) not null,
  unit_cost numeric(15,2) not null default 0.00,
  stock_after numeric(15,3) not null,
  ref_type text,
  ref_id uuid,
  remarks text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 7. INDEXES
create index if not exists idx_stock_movements_product on public.stock_movements (product_id, movement_date desc);
create index if not exists idx_purchase_items_product on public.purchase_items (product_id);
create index if not exists idx_purchases_date on public.purchases (purchase_date desc);
create index if not exists idx_supplier_ledger_supplier on public.supplier_ledger (supplier_id, entry_date desc);

-- 8. ROW LEVEL SECURITY
alter table public.suppliers enable row level security;
alter table public.supplier_ledger enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "Staff view suppliers" on public.suppliers;
create policy "Staff view suppliers" on public.suppliers for select to authenticated using (true);

drop policy if exists "Back-office manage suppliers" on public.suppliers;
create policy "Back-office manage suppliers" on public.suppliers for all to authenticated using (public.is_back_office()) with check (public.is_back_office());

drop policy if exists "Block supplier hard deletion" on public.suppliers;
create policy "Block supplier hard deletion" on public.suppliers for delete to authenticated using (false);

drop policy if exists "Back-office view supplier ledger" on public.supplier_ledger;
create policy "Back-office view supplier ledger" on public.supplier_ledger for select to authenticated using (public.is_back_office());

drop policy if exists "Block direct client mutation on supplier ledger" on public.supplier_ledger;
create policy "Block direct client mutation on supplier ledger" on public.supplier_ledger for insert to authenticated with check (false);

drop policy if exists "Back-office view purchases" on public.purchases;
create policy "Back-office view purchases" on public.purchases for select to authenticated using (public.is_back_office());

drop policy if exists "Block direct client insert on purchases" on public.purchases;
create policy "Block direct client insert on purchases" on public.purchases for insert to authenticated with check (false);

drop policy if exists "Back-office view purchase items" on public.purchase_items;
create policy "Back-office view purchase items" on public.purchase_items for select to authenticated using (public.is_back_office());

drop policy if exists "Block direct client insert on purchase items" on public.purchase_items;
create policy "Block direct client insert on purchase items" on public.purchase_items for insert to authenticated with check (false);

drop policy if exists "Staff view stock movements" on public.stock_movements;
create policy "Staff view stock movements" on public.stock_movements for select to authenticated using (public.is_back_office());

drop policy if exists "Block direct client insert on stock movements" on public.stock_movements;
create policy "Block direct client insert on stock movements" on public.stock_movements for insert to authenticated with check (false);


-- ==============================================================================
-- 9. IMMUTABILITY & DATABASE-LEVEL PROTECTION TRIGGERS
-- ==============================================================================

-- Trigger: Completed Purchase Immutability & Delete Block
create or replace function public.trg_enforce_purchase_immutability()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.status = 'completed' then
      raise exception 'Completed purchases cannot be deleted. Use Purchase Return or Reversal.';
    end if;
    return OLD;
  end if;

  if TG_OP = 'UPDATE' then
    if OLD.status = 'completed' then
      if NEW.status is distinct from OLD.status then
        raise exception 'Completed purchase status is permanent and cannot be changed to "%". Use Purchase Return or Reversal.', NEW.status;
      end if;

      if (NEW.purchase_number is distinct from OLD.purchase_number or
          NEW.supplier_id is distinct from OLD.supplier_id or
          NEW.supplier_invoice_no is distinct from OLD.supplier_invoice_no or
          NEW.purchase_date is distinct from OLD.purchase_date or
          NEW.subtotal is distinct from OLD.subtotal or
          NEW.tax_total is distinct from OLD.tax_total or
          NEW.total is distinct from OLD.total or
          NEW.paid is distinct from OLD.paid or
          NEW.due is distinct from OLD.due or
          NEW.notes is distinct from OLD.notes or
          NEW.created_by is distinct from OLD.created_by) then
        raise exception 'All economic and header fields on completed purchases are strictly immutable. Mutating invoice numbers, suppliers, dates, or financial totals is forbidden.';
      end if;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_prevent_posted_purchase_mutation on public.purchases;
create trigger trg_prevent_posted_purchase_mutation
  before update or delete on public.purchases
  for each row execute function public.trg_enforce_purchase_immutability();


-- Trigger: Completed Purchase Items Immutability & Return Authorization
create or replace function public.trg_enforce_purchase_item_immutability()
returns trigger
language plpgsql
as $$
declare
  v_parent_status text;
begin
  if TG_OP = 'DELETE' then
    select status into v_parent_status from public.purchases where id = OLD.purchase_id;
    if v_parent_status = 'completed' then
      raise exception 'Line items on completed purchases cannot be deleted. Use Purchase Return or Reversal.';
    end if;
    return OLD;
  end if;

  if TG_OP = 'UPDATE' then
    select status into v_parent_status from public.purchases where id = OLD.purchase_id;

    if v_parent_status = 'completed' then
      if current_setting('erp.internal_purchase_return_in_progress', true) is distinct from 'on' then
        raise exception 'Direct modification of purchase_items is strictly forbidden. Use process_purchase_return RPC.';
      end if;

      if (NEW.purchase_id is distinct from OLD.purchase_id or 
          NEW.product_id is distinct from OLD.product_id or 
          NEW.qty is distinct from OLD.qty or 
          NEW.purchase_rate is distinct from OLD.purchase_rate or 
          NEW.taxable_value is distinct from OLD.taxable_value or 
          NEW.gst_rate is distinct from OLD.gst_rate or 
          NEW.tax_amount is distinct from OLD.tax_amount or 
          NEW.total_amount is distinct from OLD.total_amount) then
        raise exception 'Commercial terms on completed purchase items are immutable. Changing item rates, taxes, or original quantities is forbidden.';
      end if;

      if NEW.returned_qty < OLD.returned_qty then
        raise exception 'returned_qty cannot be decreased.';
      end if;
      if NEW.returned_qty > OLD.qty then
        raise exception 'returned_qty cannot exceed total purchased qty.';
      end if;
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_prevent_posted_purchase_item_mutation on public.purchase_items;
create trigger trg_prevent_posted_purchase_item_mutation
  before update or delete on public.purchase_items
  for each row execute function public.trg_enforce_purchase_item_immutability();


-- Trigger: Database-Level Protection on products.stock_qty
create or replace function public.trg_protect_product_stock_mutation()
returns trigger
language plpgsql
as $$
begin
  if OLD.stock_qty is distinct from NEW.stock_qty then
    if current_setting('erp.internal_stock_mutation_authorized', true) is distinct from 'on' then
      raise exception 'Direct modification of products.stock_qty is forbidden. All stock adjustments must occur via authorized inventory RPCs with automated movement logging.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_protect_product_stock_mutation on public.products;
create trigger trg_protect_product_stock_mutation
  before update on public.products
  for each row execute function public.trg_protect_product_stock_mutation();


-- Trigger: Append-Only Stock Movements
create or replace function public.trg_enforce_stock_movement_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is an append-only ledger. Direct UPDATE or DELETE is strictly forbidden.';
end;
$$;

drop trigger if exists trg_prevent_stock_movement_mutation on public.stock_movements;
create trigger trg_prevent_stock_movement_mutation
  before update or delete on public.stock_movements
  for each row execute function public.trg_enforce_stock_movement_immutability();


-- ==============================================================================
-- 10. SECURITY DEFINER STORED PROCEDURES (RPCs)
-- ==============================================================================

-- Helper: Generate Supplier Code
create or replace function public.generate_supplier_code()
returns text
language plpgsql
as $$
begin
  return 'SUP-' || lpad(nextval('public.supplier_number_seq')::text, 4, '0');
end;
$$;

-- Helper: Generate Purchase Number
create or replace function public.generate_purchase_number()
returns text
language plpgsql
as $$
begin
  return 'PUR-' || lpad(nextval('public.purchase_number_seq')::text, 4, '0');
end;
$$;

-- RPC 1: CREATE SUPPLIER
create or replace function public.create_supplier(
  p_name text,
  p_contact_person text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_city text default null,
  p_state_code text default null,
  p_gstin text default null,
  p_payment_terms text default 'immediate',
  p_opening_balance numeric default 0.00,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_supplier_id uuid;
  v_code text;
  v_op numeric := coalesce(p_opening_balance, 0.00);
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Supplier name is required'; end if;

  v_code := public.generate_supplier_code();

  insert into public.suppliers (
    code, name, contact_person, phone, email, address, city,
    state_code, gstin, payment_terms, opening_balance, current_balance, notes
  ) values (
    v_code, trim(p_name), p_contact_person, p_phone, p_email, p_address, p_city,
    nullif(trim(p_state_code), ''), nullif(trim(p_gstin), ''), coalesce(p_payment_terms, 'immediate'),
    v_op, v_op, p_notes
  ) returning id into v_supplier_id;

  if v_op <> 0 then
    insert into public.supplier_ledger (
      supplier_id, entry_date, type, description, credit, debit, balance_after, ref_type, ref_id
    ) values (
      v_supplier_id, current_date, 'opening', 'Opening Payable Baseline Balance',
      v_op, 0.00, v_op, 'opening', v_supplier_id
    );
  end if;

  return jsonb_build_object(
    'id', v_supplier_id,
    'code', v_code,
    'name', p_name,
    'current_balance', v_op
  );
end;
$$;


-- RPC 2: CREATE PURCHASE (Atomic Restock, Moving WAC, Tender Outflow, Payable Ledger)
create or replace function public.create_purchase(
  p_supplier_id uuid,
  p_purchase_date date,
  p_supplier_invoice_no text,
  p_items jsonb,
  p_payments jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_purchase_number text;
  v_supplier record;
  v_supplier_name text := 'Supplier';
  v_item jsonb;
  v_payment jsonb;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_prod record;
  v_item_qty numeric;
  v_item_rate numeric;
  v_item_tax numeric;
  v_item_gst_rate numeric;
  v_item_total numeric;
  v_item_taxable numeric;
  v_cur_stock numeric;
  v_cur_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_method text;
  v_instrument_id uuid;
  v_supplier_new_balance numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers where id = p_supplier_id for update;
    if not found then raise exception 'Supplier not found'; end if;
    v_supplier_name := coalesce(v_supplier.name, 'Supplier');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must contain at least one line item';
  end if;

  -- Set Transaction-Local Contexts
  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  v_purchase_number := public.generate_purchase_number();

  -- Calculate Totals
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty := coalesce((v_item->>'qty')::numeric, 0);
    v_item_rate := coalesce((v_item->>'purchase_rate')::numeric, 0);
    v_item_gst_rate := coalesce((v_item->>'gst_rate')::numeric, 0);
    
    if v_item_qty <= 0 then raise exception 'Item quantity must be greater than 0'; end if;
    if v_item_rate < 0 then raise exception 'Item purchase rate cannot be negative'; end if;

    v_item_taxable := round(v_item_qty * v_item_rate, 2);
    v_item_tax := round(v_item_taxable * (v_item_gst_rate / 100), 2);
    v_item_total := v_item_taxable + v_item_tax;

    v_subtotal := v_subtotal + v_item_taxable;
    v_tax_total := v_tax_total + v_item_tax;
    v_total := v_total + v_item_total;
  end loop;

  -- Calculate Paid from Payment Legs
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    end loop;
  end if;

  if v_paid > v_total then
    raise exception 'Paid amount (%) exceeds total purchase amount (%)', v_paid, v_total;
  end if;

  v_due := v_total - v_paid;

  -- 1. Insert Purchase Header
  insert into public.purchases (
    purchase_number, supplier_id, supplier_invoice_no, purchase_date,
    subtotal, tax_total, total, paid, due, status, notes, created_by
  ) values (
    v_purchase_number, p_supplier_id, p_supplier_invoice_no, coalesce(p_purchase_date, current_date),
    v_subtotal, v_tax_total, v_total, v_paid, v_due, 'completed', p_notes, auth.uid()
  ) returning id into v_purchase_id;

  -- 2. Process Line Items & Update Stock / Moving WAC
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'qty')::numeric;
    v_item_rate := (v_item->>'purchase_rate')::numeric;
    v_item_gst_rate := coalesce((v_item->>'gst_rate')::numeric, 0);
    v_item_taxable := round(v_item_qty * v_item_rate, 2);
    v_item_tax := round(v_item_taxable * (v_item_gst_rate / 100), 2);
    v_item_total := v_item_taxable + v_item_tax;

    select id, stock_qty, cost_price, name
    into v_prod
    from public.products
    where id = (v_item->>'product_id')::uuid
    for update;

    if not found then raise exception 'Product % not found', v_item->>'product_id'; end if;

    v_cur_stock := coalesce(v_prod.stock_qty, 0);
    v_cur_cost := coalesce(v_prod.cost_price, 0);
    v_new_stock := v_cur_stock + v_item_qty;

    -- Perpetual Moving WAC Formula:
    -- New Unit Cost = ((Existing Stock * Existing Cost) + (Purchased Qty * Purchase Rate)) / (Existing Stock + Purchased Qty)
    if v_cur_stock <= 0 then
      v_new_cost := v_item_rate;
    else
      v_new_cost := round(((v_cur_stock * v_cur_cost) + (v_item_qty * v_item_rate)) / v_new_stock, 2);
    end if;

    -- Update Product Stock & WAC
    update public.products
    set stock_qty = v_new_stock,
        cost_price = v_new_cost,
        updated_at = now()
    where id = v_prod.id;

    -- Insert Purchase Item Line
    insert into public.purchase_items (
      purchase_id, product_id, qty, purchase_rate, taxable_value, gst_rate, tax_amount, total_amount
    ) values (
      v_purchase_id, v_prod.id, v_item_qty, v_item_rate, v_item_taxable, v_item_gst_rate, v_item_tax, v_item_total
    );

    -- Log Stock Movement
    insert into public.stock_movements (
      product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, ref_id, remarks, created_by
    ) values (
      v_prod.id, coalesce(p_purchase_date, current_date), 'PURCHASE',
      v_item_qty, v_item_rate, v_new_stock, 'purchase', v_purchase_id,
      'Inward restock from ' || v_purchase_number, auth.uid()
    );
  end loop;

  -- 3. Record Payment Cash/Bank Outflows
  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    for v_payment in select * from jsonb_array_elements(p_payments)
    loop
      v_method := coalesce(v_payment->>'method', 'cash');
      v_instrument_id := nullif(v_payment->>'instrument_id', NULL::text)::uuid;

      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then raise exception 'Unknown payment instrument'; end if;
      end if;

      if coalesce((v_payment->>'amount')::numeric, 0) > 0 then
        insert into public.cash_entries (
          entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
        ) values (
          coalesce(p_purchase_date, current_date), v_method, 'out',
          (v_payment->>'amount')::numeric,
          'Purchase ' || v_purchase_number || ' payment (' || v_supplier_name || ')',
          'purchase', v_purchase_id, v_instrument_id
        );
      end if;
    end loop;
  end if;

  -- 4. Record Supplier Payable Ledger Entry
  if p_supplier_id is not null then
    v_supplier_new_balance := coalesce(v_supplier.current_balance, 0.00) + v_due;
    
    update public.suppliers
    set current_balance = v_supplier_new_balance,
        updated_at = now()
    where id = p_supplier_id;

    insert into public.supplier_ledger (
      supplier_id, entry_date, type, description, credit, debit, balance_after, ref_type, ref_id
    ) values (
      p_supplier_id, coalesce(p_purchase_date, current_date), 'purchase',
      'Inward Purchase Bill ' || v_purchase_number || (case when v_due > 0 then ' (Due: ₹' || v_due::text || ')' else ' (Paid)' end),
      v_total, v_paid, v_supplier_new_balance, 'purchase', v_purchase_id
    );
  end if;

  return jsonb_build_object(
    'id', v_purchase_id,
    'purchase_number', v_purchase_number,
    'total', v_total,
    'paid', v_paid,
    'due', v_due,
    'status', 'completed'
  );
end;
$$;


-- RPC 3: PROCESS PURCHASE RETURN (Specific Line Bound, WAC Relief, Payable/Cash Reversal)
create or replace function public.process_purchase_return(
  p_purchase_id uuid,
  p_items jsonb,
  p_refund_amount numeric default 0.00,
  p_refund_method text default null,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_purchase record;
  v_supplier record;
  v_item jsonb;
  v_pi record;
  v_prod record;
  v_ret_qty numeric;
  v_line_rate numeric;
  v_line_reversal numeric;
  v_total_reversal numeric := 0;
  v_cur_stock numeric;
  v_cur_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_cur_val numeric;
  v_rem_val numeric;
  v_supplier_new_bal numeric;
  v_refund_paid numeric := coalesce(p_refund_amount, 0.00);
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase record not found'; end if;
  if v_purchase.status <> 'completed' then raise exception 'Only completed purchases can be returned'; end if;

  if v_purchase.supplier_id is not null then
    select * into v_supplier from public.suppliers where id = v_purchase.supplier_id for update;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items specified for return';
  end if;

  -- Set Authorization Contexts
  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);
  perform set_config('erp.internal_purchase_return_in_progress', 'on', true);

  -- Process Line Items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ret_qty := coalesce((v_item->>'return_qty')::numeric, 0);
    if v_ret_qty <= 0 then raise exception 'Return quantity must be greater than 0'; end if;

    select * into v_pi from public.purchase_items
    where id = (v_item->>'purchase_item_id')::uuid and purchase_id = p_purchase_id
    for update;

    if not found then raise exception 'Purchase line item % not found', v_item->>'purchase_item_id'; end if;

    if v_ret_qty > (v_pi.qty - coalesce(v_pi.returned_qty, 0)) then
      raise exception 'Return quantity (%) exceeds remaining purchasable quantity (%) on line %',
        v_ret_qty, (v_pi.qty - coalesce(v_pi.returned_qty, 0)), v_pi.id;
    end if;

    v_line_rate := v_pi.purchase_rate;
    v_line_reversal := round(v_ret_qty * v_line_rate, 2);
    v_total_reversal := v_total_reversal + v_line_reversal;

    -- 1. Update purchase_items.returned_qty (permitted by trigger under authorized context)
    update public.purchase_items
    set returned_qty = returned_qty + v_ret_qty
    where id = v_pi.id;

    -- 2. Lock and Update Product Stock & WAC
    select id, stock_qty, cost_price, name
    into v_prod
    from public.products
    where id = v_pi.product_id
    for update;

    v_cur_stock := coalesce(v_prod.stock_qty, 0);
    v_cur_cost := coalesce(v_prod.cost_price, 0);

    if v_cur_stock < v_ret_qty then
      raise exception 'Cannot return % units of %: current physical stock on hand is only %',
        v_ret_qty, v_prod.name, v_cur_stock;
    end if;

    v_new_stock := v_cur_stock - v_ret_qty;
    v_cur_val := v_cur_stock * v_cur_cost;
    v_rem_val := v_cur_val - v_line_reversal;

    if v_new_stock <= 0 then
      v_new_cost := v_cur_cost;
    else
      v_new_cost := round(greatest(0, v_rem_val) / v_new_stock, 2);
    end if;

    update public.products
    set stock_qty = v_new_stock,
        cost_price = v_new_cost,
        updated_at = now()
    where id = v_prod.id;

    -- 3. Log Stock Movement
    insert into public.stock_movements (
      product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, ref_id, remarks, created_by
    ) values (
      v_prod.id, current_date, 'PURCHASE_RETURN',
      -v_ret_qty, v_line_rate, v_new_stock, 'purchase_return', p_purchase_id,
      'Purchase return to supplier from ' || v_purchase.purchase_number, auth.uid()
    );
  end loop;

  -- 4. Financial Reversal
  if v_refund_paid > 0 then
    insert into public.cash_entries (
      entry_date, method, direction, amount, description, ref_type, ref_id
    ) values (
      current_date, coalesce(p_refund_method, 'cash'), 'in',
      v_refund_paid,
      'Purchase Return Refund ' || v_purchase.purchase_number,
      'purchase_return', p_purchase_id
    );
  end if;

  if v_purchase.supplier_id is not null then
    v_supplier_new_bal := coalesce(v_supplier.current_balance, 0.00) - (v_total_reversal - v_refund_paid);
    
    update public.suppliers
    set current_balance = v_supplier_new_bal,
        updated_at = now()
    where id = v_purchase.supplier_id;

    insert into public.supplier_ledger (
      supplier_id, entry_date, type, description, credit, debit, balance_after, ref_type, ref_id
    ) values (
      v_purchase.supplier_id, current_date, 'return',
      'Purchase Return Debit Note: ' || v_purchase.purchase_number || (case when p_reason <> '' then ' (' || p_reason || ')' else '' end),
      0.00, v_total_reversal, v_supplier_new_bal, 'purchase_return', p_purchase_id
    );
  end if;

  return jsonb_build_object(
    'purchase_id', p_purchase_id,
    'purchase_number', v_purchase.purchase_number,
    'total_reversal', v_total_reversal,
    'refund_collected', v_refund_paid,
    'status', 'completed'
  );
end;
$$;


-- RPC 4: MANUAL STOCK ADJUSTMENT (Audited Shrinkage, Damage, Stocktake Correction)
create or replace function public.adjust_stock_manual(
  p_product_id uuid,
  p_new_stock numeric,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_prod record;
  v_cur_stock numeric;
  v_diff numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_new_stock < 0 then raise exception 'Stock quantity cannot be negative'; end if;
  if p_reason is null or trim(p_reason) = '' then raise exception 'Reason is required for manual stock adjustment'; end if;

  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  select id, stock_qty, cost_price, name
  into v_prod
  from public.products
  where id = p_product_id
  for update;

  if not found then raise exception 'Product not found'; end if;

  v_cur_stock := coalesce(v_prod.stock_qty, 0);
  v_diff := p_new_stock - v_cur_stock;

  update public.products
  set stock_qty = p_new_stock,
      updated_at = now()
  where id = p_product_id;

  insert into public.stock_movements (
    product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, remarks, created_by
  ) values (
    p_product_id, current_date, 'ADJUSTMENT',
    v_diff, v_prod.cost_price, p_new_stock, 'manual_adjustment', p_product_id,
    'Stock adjustment: ' || p_reason, auth.uid()
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'previous_stock', v_cur_stock,
    'new_stock', p_new_stock,
    'difference', v_diff
  );
end;
$$;


-- ==============================================================================
-- 11. HARDENED create_sale() (Row Locks, Stock Movements & Perpetual WAC Snapshot)
-- ==============================================================================
create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_previous_due_instrument_id uuid default null,
  p_advance_used numeric default 0,
  p_place_of_supply text default null,
  p_supply_type text default 'intra_state',
  p_customer_gstin text default null,
  p_b2b_or_b2c text default 'B2C_SMALL',
  p_total_taxable_value numeric default null,
  p_total_cgst numeric default 0,
  p_total_sgst numeric default 0,
  p_total_igst numeric default 0,
  p_is_reverse_charge boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_item jsonb;
  v_payment jsonb;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_cust_balance numeric;
  v_method text;
  v_instrument_id uuid;
  v_taxable numeric;
  v_prod record;
  v_item_qty numeric;
  v_item_cost numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;

  -- Set Transaction-Local Stock Mutation Context
  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  v_invoice_number := public.generate_invoice_number();
  v_taxable := coalesce(p_total_taxable_value, p_total - coalesce(p_total_cgst, 0) - coalesce(p_total_sgst, 0) - coalesce(p_total_igst, 0));

  insert into public.invoices (
    invoice_number, customer_id, invoice_date, subtotal, discount, total, status,
    place_of_supply, supply_type, customer_gstin, b2b_or_b2c,
    total_taxable_value, total_cgst, total_sgst, total_igst, is_reverse_charge
  ) values (
    v_invoice_number, p_customer_id, p_invoice_date, p_subtotal, p_discount, p_total, 'unpaid',
    p_place_of_supply, coalesce(p_supply_type, 'intra_state'), p_customer_gstin, coalesce(p_b2b_or_b2c, 'B2C_SMALL'),
    v_taxable, coalesce(p_total_cgst, 0), coalesce(p_total_sgst, 0), coalesce(p_total_igst, 0), coalesce(p_is_reverse_charge, false)
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty := coalesce((v_item->>'qty')::numeric, 1);
    v_item_cost := coalesce((v_item->>'cost_price')::numeric, 0);

    if (v_item->>'product_id') is not null then
      -- 1. SELECT PRODUCT FOR UPDATE (Concurrency Row Lock)
      select id, stock_qty, cost_price, name
      into v_prod
      from public.products
      where id = (v_item->>'product_id')::uuid
      for update;

      if not found then raise exception 'Product % not found', v_item->>'product_id'; end if;

      if v_prod.stock_qty < v_item_qty then
        raise exception 'Insufficient stock for product "%": requested %, available %',
          v_prod.name, v_item_qty, v_prod.stock_qty;
      end if;

      v_item_cost := coalesce(v_prod.cost_price, v_item_cost);

      -- 2. Decrement Stock
      update public.products
      set stock_qty = stock_qty - v_item_qty,
          updated_at = now()
      where id = v_prod.id;

      -- 3. Log Stock Movement
      insert into public.stock_movements (
        product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, ref_id, remarks, created_by
      ) values (
        v_prod.id, p_invoice_date, 'SALE',
        -v_item_qty, v_item_cost, v_prod.stock_qty - v_item_qty, 'invoice', v_invoice_id,
        'Sale ' || v_invoice_number, auth.uid()
      );
    end if;

    -- 4. Insert Invoice Item with Historical Locked Unit Cost
    insert into public.invoice_items (
      invoice_id, product_id, service_id, description, qty, rate, amount, cost_price,
      hsn_sac, taxable_value, gst_rate, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, tax_treatment
    ) values (
      v_invoice_id,
      nullif(v_item->>'product_id', NULL::text)::uuid,
      nullif(v_item->>'service_id', NULL::text)::uuid,
      v_item->>'description',
      v_item_qty,
      coalesce((v_item->>'rate')::numeric, 0),
      coalesce((v_item->>'amount')::numeric, 0),
      v_item_cost,
      v_item->>'hsn_sac',
      coalesce((v_item->>'taxable_value')::numeric, coalesce((v_item->>'amount')::numeric, 0)),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      coalesce((v_item->>'cgst_rate')::numeric, 0),
      coalesce((v_item->>'cgst_amount')::numeric, 0),
      coalesce((v_item->>'sgst_rate')::numeric, 0),
      coalesce((v_item->>'sgst_amount')::numeric, 0),
      coalesce((v_item->>'igst_rate')::numeric, 0),
      coalesce((v_item->>'igst_amount')::numeric, 0),
      coalesce(v_item->>'tax_treatment', 'non_gst')
    );
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', NULL::text)::uuid;

    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then raise exception 'Unknown payment instrument'; end if;
    end if;

    insert into public.payments (invoice_id, method, amount, instrument_id)
    values (v_invoice_id, v_method, coalesce((v_payment->>'amount')::numeric, 0), v_instrument_id);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_invoice_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
  end loop;

  if v_paid + p_advance_used > p_total then raise exception 'Paid amount exceeds total'; end if;
  v_due := p_total - v_paid - p_advance_used;

  update public.invoices
  set paid = v_paid + p_advance_used,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null then
    select balance into v_cust_balance from public.customers where id = p_customer_id for update;
    if v_cust_balance is null then raise exception 'Customer not found'; end if;

    if p_previous_due > 0 then
      if v_cust_balance < p_previous_due then
        raise exception 'Customer due is only %, cannot collect %', v_cust_balance, p_previous_due;
      end if;
      v_cust_balance := v_cust_balance - p_previous_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'payment', 'Previous due collected with ' || v_invoice_number, p_previous_due, v_cust_balance, v_invoice_id);

      v_method := p_previous_due_method;
      v_instrument_id := nullif(p_previous_due_instrument_id, NULL::uuid);
      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then raise exception 'Unknown payment instrument'; end if;
      end if;
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_invoice_date, v_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
    end if;

    if p_advance_used > 0 then
      if v_cust_balance > -p_advance_used then
        raise exception 'Customer advance is only %, cannot apply %', abs(v_cust_balance), p_advance_used;
      end if;
      v_cust_balance := v_cust_balance + p_advance_used;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'advance', 'Advance applied to ' || v_invoice_number, p_advance_used, v_cust_balance, v_invoice_id);
    end if;

    if v_due > 0 then
      v_cust_balance := v_cust_balance + v_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'sale', 'Invoice ' || v_invoice_number || ' (Due)', v_due, v_cust_balance, v_invoice_id);
    end if;
  end if;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'total', p_total,
    'paid', v_paid + p_advance_used,
    'due', v_due,
    'status', case when v_due = 0 then 'paid' else 'partial' end
  );
end;
$$;


-- ==============================================================================
-- 12. HARDENED process_return() (Sales Return Restock & Movement Logging)
-- ==============================================================================
create or replace function public.process_return(
  p_invoice_id uuid,
  p_items jsonb,
  p_refund numeric,
  p_refund_method text default 'cash',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice record;
  v_item record;
  v_ri jsonb;
  v_qty numeric;
  v_returned numeric := 0;
  v_old_due numeric;
  v_new_due numeric;
  v_delta numeric;
  v_return_id uuid;
  v_return_number text;
  v_bal numeric;
  v_refund_method_label text;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then raise exception 'Invoice already returned'; end if;

  v_old_due := v_invoice.total - v_invoice.paid;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to return';
  end if;

  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Invalid return quantity'; end if;

    select * into v_item from public.invoice_items
    where id = (v_ri->>'invoice_item_id')::uuid and invoice_id = p_invoice_id
    for update;
    if not found then raise exception 'Invoice item not found'; end if;

    if v_qty > (v_item.qty - coalesce(v_item.returned_qty, 0)) then
      raise exception 'Cannot return more than quantity sold';
    end if;

    v_returned := v_returned + round(v_qty * v_item.rate, 2);
  end loop;

  if v_returned <= 0 then raise exception 'Return value must be positive'; end if;
  if p_refund < 0 then raise exception 'Invalid refund amount'; end if;
  if p_refund > least(v_invoice.paid, v_returned) then
    raise exception 'Refund cannot exceed the amount collected on returned items';
  end if;

  v_return_number := 'RTN-' || lpad(nextval('public.return_number_seq')::text, 4, '0');

  insert into public.returns (return_number, invoice_id, reason, subtotal, refund, refund_method, status, created_by)
  values (v_return_number, p_invoice_id, nullif(p_reason, ''), v_returned, p_refund, p_refund_method, 'completed', auth.uid())
  returning id into v_return_id;

  for v_ri in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_ri->>'qty')::numeric;
    select * into v_item from public.invoice_items where id = (v_ri->>'invoice_item_id')::uuid for update;

    insert into public.return_items (return_id, invoice_item_id, product_id, service_id, qty, rate, amount)
    values (v_return_id, v_item.id, v_item.product_id, v_item.service_id, v_qty, v_item.rate, round(v_qty * v_item.rate, 2));

    update public.invoice_items
    set returned_qty = returned_qty + v_qty
    where id = v_item.id;

    if v_item.product_id is not null then
      update public.products
      set stock_qty = stock_qty + v_qty, updated_at = now()
      where id = v_item.product_id;

      insert into public.stock_movements (
        product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, ref_id, remarks, created_by
      )
      select
        v_item.product_id, current_date, 'SALES_RETURN',
        v_qty, coalesce(v_item.cost_price, 0), p.stock_qty, 'return', v_return_id,
        'Sales return ' || v_return_number || ' for invoice ' || v_invoice.invoice_number, auth.uid()
      from public.products p where p.id = v_item.product_id;
    end if;
  end loop;

  if p_refund > 0 then
    declare
      v_leg record;
      v_remaining numeric := p_refund;
      v_leg_refund numeric;
    begin
      for v_leg in
        select method, instrument_id, amount from public.payments
        where invoice_id = p_invoice_id and amount > 0
        order by amount desc
      loop
        exit when v_remaining <= 0.005;
        v_leg_refund := round(least(v_leg.amount, v_remaining), 2);
        if v_leg_refund > 0 then
          insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
          values (current_date, v_leg.method, 'out', v_leg_refund, 'Refund ' || v_invoice.invoice_number || ' (' || v_return_number || ')', 'return', v_return_id, v_leg.instrument_id);
          v_remaining := round(v_remaining - v_leg_refund, 2);
        end if;
      end loop;
    end;
  end if;

  update public.invoices
  set returned = coalesce(returned, 0) + v_returned,
      refunded = coalesce(refunded, 0) + p_refund,
      updated_at = now()
  where id = p_invoice_id;

  v_delta := v_returned - p_refund;
  if v_delta > 0 and v_invoice.customer_id is not null and v_old_due > 0 then
    v_new_due := greatest(0, v_old_due - v_delta);
    select balance into v_bal from public.customers where id = v_invoice.customer_id for update;
    v_bal := v_bal - (v_old_due - v_new_due);
    update public.customers set balance = v_bal, updated_at = now() where id = v_invoice.customer_id;
    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
    values (v_invoice.customer_id, current_date, 'return', 'Return adjustment ' || v_return_number, v_old_due - v_new_due, v_bal, v_return_id);
  end if;

  return jsonb_build_object(
    'return_id', v_return_id,
    'return_number', v_return_number,
    'returned', v_returned,
    'refund', p_refund
  );
end;
$$;


-- ==============================================================================
-- 13. IDEMPOTENT INVENTORY CUTOVER BASELINE (Date: 2026-08-25)
-- ==============================================================================
insert into public.stock_movements (
  product_id, movement_date, movement_type, qty_change, unit_cost, stock_after, ref_type, remarks
)
select 
  p.id,
  '2026-08-25'::date,
  'OPENING_STOCK',
  coalesce(p.stock_qty, 0),
  coalesce(p.cost_price, 0),
  coalesce(p.stock_qty, 0),
  'opening',
  'Authoritative opening stock baseline established at cutover (2026-08-25)'
from public.products p
where not exists (
  select 1 from public.stock_movements sm
  where sm.product_id = p.id and sm.movement_type = 'OPENING_STOCK'
);
