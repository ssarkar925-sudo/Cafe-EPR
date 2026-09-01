-- Stock integrity convergence migration.
--
-- This migration is intentionally additive: it validates live data first and
-- never rewrites historical stock movements.  `stock_after - qty_change` is
-- the canonical, exact stock-before value, so a separate stock_before column
-- would duplicate immutable information rather than improve the audit model.

do $$
begin
  if to_regclass('public.products') is null then
    raise exception 'Stock hardening requires public.products; apply the catalog schema first.';
  end if;
  if to_regclass('public.stock_movements') is null then
    raise exception 'Stock hardening requires public.stock_movements; apply the inventory migration first.';
  end if;
  if to_regprocedure('public.is_back_office()') is null then
    raise exception 'Stock hardening requires public.is_back_office(); apply role hardening first.';
  end if;
  if exists (select 1 from public.products where stock_qty < 0) then
    raise exception 'Cannot add products_stock_qty_nonnegative: existing negative stock rows must be reconciled explicitly first.';
  end if;
end
$$;

-- New writes are protected immediately; validation is only attempted after the
-- explicit preflight above confirms no legacy rows would be rejected.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_stock_qty_nonnegative'
  ) then
    alter table public.products
      add constraint products_stock_qty_nonnegative check (stock_qty >= 0) not valid;
  end if;
end
$$;

alter table public.products validate constraint products_stock_qty_nonnegative;

-- Direct inserts may establish an empty catalog item only.  Any non-zero
-- opening stock must go through an authorized RPC that writes the ledger in
-- the same transaction.  Updates retain the existing protected context gate.
create or replace function public.trg_protect_product_stock_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.stock_qty is distinct from 0
       and current_setting('erp.internal_stock_mutation_authorized', true) is distinct from 'on' then
      raise exception 'Products must be created with zero stock. Use an authorized inventory RPC to establish opening stock.';
    end if;
  elsif old.stock_qty is distinct from new.stock_qty
     and current_setting('erp.internal_stock_mutation_authorized', true) is distinct from 'on' then
    raise exception 'Direct modification of products.stock_qty is forbidden. All stock adjustments must occur via authorized inventory RPCs with automated movement logging.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_product_stock_mutation on public.products;
create trigger trg_protect_product_stock_mutation
  before insert or update on public.products
  for each row execute function public.trg_protect_product_stock_mutation();

-- Product creation and a non-zero opening balance are one atomic operation.
create or replace function public.create_product_with_opening_stock(
  p_name text,
  p_code text default null,
  p_description text default null,
  p_unit text default 'pc',
  p_category_id uuid default null,
  p_sale_price numeric default 0,
  p_cost_price numeric default 0,
  p_initial_stock numeric default 0,
  p_reorder_level numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_category_name text;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Product name is required';
  end if;
  if nullif(btrim(coalesce(p_unit, '')), '') is null then
    raise exception 'Unit is required';
  end if;
  if p_sale_price is null or p_sale_price < 0 then
    raise exception 'Sale price cannot be negative';
  end if;
  if p_cost_price is null or p_cost_price < 0 then
    raise exception 'Cost price cannot be negative';
  end if;
  if p_reorder_level is null or p_reorder_level < 0 then
    raise exception 'Reorder level cannot be negative';
  end if;
  if p_initial_stock is null or p_initial_stock < 0 then
    raise exception 'Initial stock cannot be negative';
  end if;

  -- Always create at zero so the trigger enforces the same protected mutation
  -- path for positive opening stock as it does for every later stock change.
  insert into public.products (
    name, code, description, unit, category_id, sale_price, cost_price,
    stock_qty, reorder_level, is_active
  ) values (
    btrim(p_name), nullif(btrim(coalesce(p_code, '')), ''), p_description,
    btrim(p_unit), p_category_id, p_sale_price, p_cost_price, 0,
    p_reorder_level, true
  ) returning * into v_product;

  if p_initial_stock > 0 then
    perform set_config('erp.internal_stock_mutation_authorized', 'on', true);
    update public.products
       set stock_qty = p_initial_stock,
           updated_at = now()
     where id = v_product.id
     returning * into v_product;

    insert into public.stock_movements (
      product_id, movement_date, movement_type, qty_change, unit_cost,
      stock_after, ref_type, ref_id, remarks, created_by
    ) values (
      v_product.id, current_date, 'OPENING_STOCK', p_initial_stock,
      p_cost_price, p_initial_stock, 'product_creation', v_product.id,
      'Initial stock on product creation', auth.uid()
    );
  end if;

  select name into v_category_name from public.categories where id = v_product.category_id;
  return to_jsonb(v_product) || jsonb_build_object(
    'categories', case when v_category_name is null then null else jsonb_build_object('name', v_category_name) end
  );
end;
$$;

revoke all on function public.create_product_with_opening_stock(text, text, text, text, uuid, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_product_with_opening_stock(text, text, text, text, uuid, numeric, numeric, numeric, numeric) to authenticated, service_role;

-- The opening-position UI supplies all inventory lines at once.  Lock, update,
-- and journal them in one RPC transaction so neither side can persist alone.
create or replace function public.apply_opening_inventory(
  p_opening_date date,
  p_inventory jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product record;
  v_product_id uuid;
  v_qty numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_count integer := 0;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;
  if p_opening_date is null then
    raise exception 'Opening date is required';
  end if;
  if p_inventory is null or jsonb_typeof(p_inventory) <> 'array' then
    raise exception 'Opening inventory must be an array';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_inventory) item
     group by item->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Opening inventory cannot contain the same product more than once';
  end if;

  perform set_config('erp.internal_stock_mutation_authorized', 'on', true);

  for v_item in select * from jsonb_array_elements(p_inventory)
  loop
    v_product_id := nullif(btrim(coalesce(v_item->>'product_id', '')), '')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_cost := coalesce((v_item->>'unit_cost')::numeric, 0);
    if v_product_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'Each opening inventory line requires a product and a positive quantity';
    end if;
    if v_cost < 0 then
      raise exception 'Opening inventory unit cost cannot be negative';
    end if;

    select id, stock_qty, cost_price
      into v_product
      from public.products
     where id = v_product_id
     for update;
    if not found then
      raise exception 'Product % not found', v_product_id;
    end if;

    v_new_stock := coalesce(v_product.stock_qty, 0) + v_qty;
    update public.products
       set stock_qty = v_new_stock,
           cost_price = case when v_cost > 0 then v_cost else cost_price end,
           updated_at = now()
     where id = v_product.id;

    insert into public.stock_movements (
      product_id, movement_date, movement_type, qty_change, unit_cost,
      stock_after, ref_type, remarks, created_by
    ) values (
      v_product.id, p_opening_date, 'OPENING_STOCK', v_qty, v_cost,
      v_new_stock, 'opening_position',
      coalesce(nullif(btrim(v_item->>'remarks'), ''), 'Opening Inventory Stock'), auth.uid()
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('movement_count', v_count, 'opening_date', p_opening_date);
end;
$$;

revoke all on function public.apply_opening_inventory(date, jsonb) from public, anon;
grant execute on function public.apply_opening_inventory(date, jsonb) to authenticated, service_role;

-- Existing deployments may have the opening-position RPC from the earlier
-- engine.  Apply the one required authorization change only when its known
-- source anchor is present; otherwise stop safely for manual reconciliation.
do $$
declare
  v_definition text;
  v_function regprocedure := to_regprocedure('public.finalize_opening_position(date,numeric,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text)');
begin
  if v_function is null then
    return;
  end if;
  select pg_get_functiondef(v_function::oid) into v_definition;
  if position('erp.internal_stock_mutation_authorized' in v_definition) = 0 then
    if position(E'\n  -- 5. Opening Inventory' in v_definition) = 0 then
      raise exception 'finalize_opening_position has an unexpected definition; add the stock authorization context before deploying this migration.';
    end if;
    v_definition := replace(
      v_definition,
      E'\n  -- 5. Opening Inventory',
      E'\n  -- Authorize stock writes through trg_protect_product_stock_mutation.\n  perform set_config(''erp.internal_stock_mutation_authorized'', ''on'', true);\n\n  -- 5. Opening Inventory'
    );
    execute v_definition;
  end if;
end
$$;

comment on table public.stock_movements is
  'Immutable inventory ledger. Exact stock before each movement is reconstructed as stock_after - qty_change.';
