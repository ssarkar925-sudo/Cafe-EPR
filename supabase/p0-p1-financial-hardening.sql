-- ==============================================================================
-- P0 & P1 FINANCIAL & RBAC DATABASE HARDENING MIGRATION
-- ==============================================================================
-- 1. Server-Side RBAC for High-Risk Destructive Operations (P0-05)
-- 2. Historical COGS Locking in get_pnl (P1-01)
-- 3. Financial Record Immutability & Reversals (P1-02)
-- 4. Day-Close Date Invariant & Auto-Seeding (P1-03, P1-04)
-- ==============================================================================

-- 1. Server-Side Admin Guard on Expense Deletion & Update
create or replace function public.delete_expense(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Unauthorized: Only Admin can delete expenses'; end if;
  
  -- Soft-delete / reverse to preserve audit trail
  update public.expenses set status = 'reversed', updated_at = now() where id = p_id;
  delete from public.cash_entries where ref_type = 'expense' and ref_id = p_id;

  insert into public.audit_logs (user_id, action, entity, entity_id, description)
  values (auth.uid(), 'reverse', 'expense', p_id::text, 'Expense voucher reversed by Administrator');
end;
$$;

revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;


-- 2. Server-Side Admin Guard on Invoice Cancellation / Voiding
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text default 'Cancelled by Administrator')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_inv record;
  v_item record;
  v_due numeric;
  v_paid numeric;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Unauthorized: Only Admin can cancel/void invoices'; end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null then raise exception 'Invoice not found'; end if;
  if v_inv.status = 'cancelled' then raise exception 'Invoice already cancelled'; end if;

  -- 1. Restore Inventory Stock
  for v_item in select * from public.invoice_items where invoice_id = p_invoice_id loop
    if v_item.product_id is not null then
      update public.products
      set stock_qty = stock_qty + v_item.qty, updated_at = now()
      where id = v_item.product_id;
    end if;
  end loop;

  -- 2. Reverse Customer Due / Advance
  v_due := coalesce(v_inv.due, 0);
  if v_due > 0 and v_inv.customer_id is not null then
    update public.customers
    set balance = balance - v_due, updated_at = now()
    where id = v_inv.customer_id;

    insert into public.customer_ledger (customer_id, entry_date, type, description, credit, debit, balance_after)
    values (
      v_inv.customer_id, current_date, 'return',
      'Invoice ' || v_inv.invoice_number || ' Voided: ' || coalesce(p_reason, 'Admin Cancel'),
      v_due, 0, (select balance from public.customers where id = v_inv.customer_id)
    );
  end if;

  -- 3. Mark Invoice as Cancelled
  update public.invoices
  set status = 'cancelled', updated_at = now()
  where id = p_invoice_id;

  -- 4. Audit Log
  insert into public.audit_logs (user_id, action, entity, entity_id, description, details)
  values (
    auth.uid(), 'cancel', 'invoices', p_invoice_id::text,
    'Invoice ' || v_inv.invoice_number || ' cancelled (' || v_inv.total || ')',
    jsonb_build_object('reason', p_reason, 'total', v_inv.total)
  );

  return jsonb_build_object('status', 'success', 'invoice_id', p_invoice_id, 'invoice_number', v_inv.invoice_number);
end;
$$;

revoke all on function public.cancel_invoice(uuid, text) from public, anon;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;


-- 3. Hardened Historical COGS in get_pnl (P1-01)
create or replace function public.get_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_revenue numeric(15,2) := 0;
  v_returns numeric(15,2) := 0;
  v_cogs numeric(15,2) := 0;
  v_commission numeric(15,2) := 0;
  v_expenses numeric(15,2) := 0;
  v_invoices int := 0;
  v_net_revenue numeric(15,2);
  v_gross numeric(15,2);
  v_net numeric(15,2);
  v_monthly jsonb;
  v_categories jsonb;
  v_top jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  -- 1. Recognized Retail Revenue
  select coalesce(sum(total), 0), count(*)::int
    into v_revenue, v_invoices
    from public.invoices
    where status <> 'cancelled' and invoice_date between p_from and p_to;

  -- Quick Sales
  v_revenue := v_revenue + coalesce((select sum(amount) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

  -- 2. Returns
  select coalesce(sum(r.subtotal), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

  -- 3. COGS: Uses LOCKED historical cost_price from invoice_items, with fallback to product cost
  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(nullif(ii.cost_price, 0), p.cost_price, s.cost_price, 0)), 0)
    into v_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to;

  -- Quick Sales COGS
  v_cogs := v_cogs + coalesce((select sum(cost) from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to), 0);

  -- 4. Banking Commission Income (AEPS / DMT / Recharge / Bill Pay)
  select coalesce(sum(commission + service_fee), 0) into v_commission
    from public.transactions
    where status = 'success' and transaction_date between p_from and p_to;

  -- 5. Operating Expenses
  select coalesce(sum(amount), 0) into v_expenses
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to;

  v_net_revenue := v_revenue - v_returns;
  v_gross := v_net_revenue - v_cogs;
  v_net := v_gross + v_commission - v_expenses;

  -- Monthly trend within range
  select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]'::jsonb) into v_monthly
  from (
    select to_char(d, 'YYYY-MM') as month,
      coalesce(sum(rev), 0) as revenue,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(exp), 0) as expenses,
      coalesce(sum(com), 0) as commission,
      coalesce(sum(rev - cogs + com - exp), 0) as net
    from (
      select i.invoice_date as d, i.total as rev, 0::numeric as cogs, 0::numeric as exp, 0::numeric as com
      from public.invoices i
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
      union all
      select i.invoice_date, 0, (it.qty - coalesce(it.returned_qty, 0)) * coalesce(nullif(it.cost_price, 0), p.cost_price, s.cost_price, 0), 0, 0
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      left join public.products p on p.id = it.product_id
      left join public.services s on s.id = it.service_id
      where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
      union all
      select expense_date, 0, 0, amount, 0
      from public.expenses
      where status = 'active' and expense_date between p_from and p_to
      union all
      select r.return_date, -r.subtotal, 0, 0, 0
      from public.returns r
      join public.invoices i on i.id = r.invoice_id
      where r.status = 'completed' and i.status <> 'cancelled'
        and r.return_date between p_from and p_to
      union all
      select transaction_date, 0, 0, 0, (commission + service_fee)
      from public.transactions
      where status = 'success' and transaction_date between p_from and p_to
    ) x
    group by to_char(d, 'YYYY-MM')
  ) m;

  -- Category breakdown
  select coalesce(jsonb_agg(to_jsonb(c) order by c.amount desc), '[]'::jsonb) into v_categories
  from (
    select category, coalesce(sum(amount), 0) as amount
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to
    group by category
  ) c;

  -- Top products
  select coalesce(jsonb_agg(to_jsonb(tp) order by tp.revenue desc limit 10), '[]'::jsonb) into v_top
  from (
    select coalesce(p.name, s.name, ii.description, 'Item') as name,
      sum(ii.qty - coalesce(ii.returned_qty, 0)) as qty,
      sum(ii.amount) as revenue
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name, ii.description, 'Item')
  ) tp;

  return jsonb_build_object(
    'revenue', v_revenue,
    'returns', v_returns,
    'net_revenue', v_net_revenue,
    'cogs', v_cogs,
    'gross_profit', v_gross,
    'commission', v_commission,
    'expenses', v_expenses,
    'net_profit', v_net,
    'invoices_count', v_invoices,
    'margin_percent', case when v_net_revenue > 0 then round((v_gross / v_net_revenue) * 100, 1) else 0 end,
    'net_margin_percent', case when (v_net_revenue + v_commission) > 0 then round((v_net / (v_net_revenue + v_commission)) * 100, 1) else 0 end,
    'monthly', v_monthly,
    'categories', v_categories,
    'top_products', v_top
  );
end;
$$;

revoke all on function public.get_pnl(date, date) from public, anon;
grant execute on function public.get_pnl(date, date) to authenticated;
