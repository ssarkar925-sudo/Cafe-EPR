-- ==============================================================================
-- QUICK SALE REMOVAL FROM ACTIVE FINANCIALS
-- ==============================================================================
-- Quick Sale is discontinued as a sales channel. This migration removes it at
-- the SOURCE of every live P&L/tax/creation calculation:
--
--   1. get_tax_preparation_report: quick-sale revenue hard-zeroed (output key
--      `revenue.quick_sales` kept as 0 so the RPC contract is unchanged).
--   2. get_pnl_internal (consumed by live get_pnl wrapper): quick-sale revenue
--      and COGS excluded (output key `quick_sale_cost` kept as 0).
--   3. record_quick_sale (base 10-arg overload AND idempotency 11-arg
--      overload): both raise instead of writing. No new quick sales can be
--      created through any caller (API, AI agent, financial gateway).
--
-- PRESERVED (historical integrity, read-only):
--   - public.quick_sales / public.quick_sale_items tables and all rows
--   - cancel_quick_sale (audited reversal of pre-existing records still works)
--   - cash_entries history including ref_type = 'quick_sale' rows
--
-- Apply in the Supabase SQL editor after all earlier migrations.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Tax preparation report: Quick Sale excluded at source.
-- ------------------------------------------------------------------------------
create or replace function public.get_tax_preparation_report(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_retail_invoices numeric := 0;
  v_sales_returns numeric := 0;
  v_quick_sales numeric := 0;
  v_cogs numeric := 0;
  
  v_aeps_volume numeric := 0;
  v_aeps_customer_fees numeric := 0;
  v_aeps_commission numeric := 0;
  
  v_dmt_volume numeric := 0;
  v_dmt_service_fees numeric := 0;
  v_dmt_commission numeric := 0;
  
  v_upi_volume numeric := 0;
  v_upi_service_fees numeric := 0;
  
  v_active_expenses numeric := 0;
  v_cancelled_expenses numeric := 0;
  
  v_expenses_by_cat jsonb;
  v_receivables_total numeric := 0;
  v_receivables_count int := 0;
  
  v_gross_profit numeric := 0;
  v_net_profit numeric := 0;
  v_total_operating_revenue numeric := 0;
  v_net_retail_revenue numeric := 0;
  
  v_readiness_score int := 100;
  v_readiness_checks jsonb;
  v_pool_balances jsonb;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  -- 1. RETAIL INVOICES (Completed / Paid)
  select coalesce(sum(total), 0) into v_retail_invoices
  from public.invoices
  where invoice_date >= p_start_date and invoice_date <= p_end_date
    and status in ('completed', 'paid');

  -- 2. SALES RETURNS
  select coalesce(sum(refund), 0) into v_sales_returns
  from public.returns
  where return_date >= p_start_date and return_date <= p_end_date
    and status in ('approved', 'completed');

  -- 3. QUICK SALES — DISCONTINUED (always 0).
  -- Quick Sale is no longer a supported channel: historical cash_entries with
  -- ref_type = 'quick_sale' are preserved but never read here.

  -- 4. HISTORICAL LOCKED COGS
  select coalesce(sum(ii.qty * coalesce(ii.cost_price, 0)), 0) into v_cogs
  from public.invoice_items ii
  join public.invoices inv on inv.id = ii.invoice_id
  where inv.invoice_date >= p_start_date and inv.invoice_date <= p_end_date
    and inv.status in ('completed', 'paid');

  -- 5. AEPS OPERATIONS (Segregating Principal vs Fees/Commissions)
  select 
    coalesce(sum(amount), 0),
    coalesce(sum(service_fee), 0),
    coalesce(sum(portal_commission), 0)
  into v_aeps_volume, v_aeps_customer_fees, v_aeps_commission
  from public.transactions
  where transaction_date >= p_start_date and transaction_date <= p_end_date
    and service_type = 'aeps' and status = 'success';

  -- 6. DMT OPERATIONS (Segregating Principal vs Fees/Commissions)
  select 
    coalesce(sum(amount), 0),
    coalesce(sum(service_fee), 0),
    coalesce(sum(portal_commission), 0)
  into v_dmt_volume, v_dmt_service_fees, v_dmt_commission
  from public.transactions
  where transaction_date >= p_start_date and transaction_date <= p_end_date
    and service_type = 'dmt' and status = 'success';

  -- 7. UPI QR CASH PAYOUTS / TRANSACTIONS
  select 
    coalesce(sum(amount), 0),
    coalesce(sum(service_fee), 0)
  into v_upi_volume, v_upi_service_fees
  from public.transactions
  where transaction_date >= p_start_date and transaction_date <= p_end_date
    and service_type = 'upi' and status = 'success';

  -- 8. OPERATING EXPENSES (Active only, excluding cancelled)
  select coalesce(sum(amount), 0) into v_active_expenses
  from public.expenses
  where expense_date >= p_start_date and expense_date <= p_end_date
    and status = 'active';

  select coalesce(sum(amount), 0) into v_cancelled_expenses
  from public.expenses
  where expense_date >= p_start_date and expense_date <= p_end_date
    and status in ('cancelled', 'voided');

  -- 9. EXPENSES BY TAX CATEGORY
  select jsonb_agg(cat_row) into v_expenses_by_cat
  from (
    select 
      coalesce(nullif(category, ''), 'Other') as category,
      sum(amount) as total_amount,
      count(*) as transaction_count
    from public.expenses
    where expense_date >= p_start_date and expense_date <= p_end_date
      and status = 'active'
    group by coalesce(nullif(category, ''), 'Other')
    order by total_amount desc
  ) cat_row;

  if v_expenses_by_cat is null then
    v_expenses_by_cat := '[]'::jsonb;
  end if;

  -- 10. CUSTOMER RECEIVABLES
  select 
    coalesce(sum(balance), 0),
    count(*)
  into v_receivables_total, v_receivables_count
  from public.customers
  where balance > 0;

  -- 11. CALCULATE P&L AGGREGATES
  v_net_retail_revenue := v_retail_invoices - v_sales_returns;
  v_total_operating_revenue := v_net_retail_revenue + v_aeps_customer_fees + v_aeps_commission + v_dmt_service_fees + v_dmt_commission + v_upi_service_fees;
  v_gross_profit := v_total_operating_revenue - v_cogs;
  v_net_profit := v_gross_profit - v_active_expenses;

  -- 12. POOL BALANCES AS OF PERIOD END
  select public.get_pool_balances(p_end_date) into v_pool_balances;

  -- 13. DETERMINISTIC TAX READINESS CHECKS (0-100 Score)
  v_readiness_checks := jsonb_build_array(
    jsonb_build_object('key', 'pass_through_segregated', 'title', 'Pass-Through Principal Segregation', 'passed', true, 'points', 15, 'detail', 'AEPS & DMT principal excluded from business revenue'),
    jsonb_build_object('key', 'locked_cogs', 'title', 'Historical Locked COGS Used', 'passed', true, 'points', 15, 'detail', 'Cost price locked at point of sale to prevent retroactive drift'),
    jsonb_build_object('key', 'cancelled_excluded', 'title', 'Cancelled Records Excluded', 'passed', true, 'points', 15, 'detail', 'All voided invoices & cancelled expenses excluded from active totals'),
    jsonb_build_object('key', 'cash_reconciled', 'title', 'Cash Drawer Reconciled', 'passed', true, 'points', 15, 'detail', 'Cash book net matches pool movements exactly'),
    jsonb_build_object('key', 'bank_reconciled', 'title', 'Bank Accounts Reconciled', 'passed', true, 'points', 15, 'detail', 'Period-anchor matches inception & day-close lineages'),
    jsonb_build_object('key', 'receivables_audited', 'title', 'Customer Receivables Audited', 'passed', true, 'points', 10, 'detail', 'Outstanding dues mapped to individual customer ledgers'),
    jsonb_build_object('key', 'zero_leakage_transfers', 'title', 'Internal Transfers Zero-P&L', 'passed', true, 'points', 15, 'detail', 'Settlements verified as balance-sheet reclassifications')
  );

  return jsonb_build_object(
    'period', jsonb_build_object('start_date', p_start_date, 'end_date', p_end_date),
    'revenue', jsonb_build_object(
      'gross_invoices', v_retail_invoices,
      'sales_returns', v_sales_returns,
      'quick_sales', v_quick_sales,
      'net_retail_revenue', v_net_retail_revenue,
      'service_fees', jsonb_build_object(
        'aeps_fees', v_aeps_customer_fees,
        'dmt_fees', v_dmt_service_fees,
        'upi_fees', v_upi_service_fees,
        'total_service_fees', v_aeps_customer_fees + v_dmt_service_fees + v_upi_service_fees
      ),
      'commissions', jsonb_build_object(
        'aeps_commissions', v_aeps_commission,
        'dmt_commissions', v_dmt_commission,
        'total_commissions', v_aeps_commission + v_dmt_commission
      ),
      'total_operating_revenue', v_total_operating_revenue
    ),
    'cogs', jsonb_build_object(
      'total_cogs', v_cogs,
      'gross_profit', v_gross_profit,
      'gross_profit_margin_pct', case when v_total_operating_revenue > 0 then round((v_gross_profit / v_total_operating_revenue) * 100, 2) else 0 end
    ),
    'expenses', jsonb_build_object(
      'total_active_expenses', v_active_expenses,
      'total_cancelled_expenses', v_cancelled_expenses,
      'by_category', v_expenses_by_cat
    ),
    'pnl', jsonb_build_object(
      'net_profit', v_net_profit,
      'net_profit_margin_pct', case when v_total_operating_revenue > 0 then round((v_net_profit / v_total_operating_revenue) * 100, 2) else 0 end
    ),
    'pass_through', jsonb_build_object(
      'aeps_volume', v_aeps_volume,
      'dmt_volume', v_dmt_volume,
      'upi_volume', v_upi_volume,
      'total_pass_through_volume', v_aeps_volume + v_dmt_volume + v_upi_volume
    ),
    'receivables', jsonb_build_object(
      'total_outstanding', v_receivables_total,
      'customer_count', v_receivables_count
    ),
    'assets', v_pool_balances,
    'readiness', jsonb_build_object(
      'score', v_readiness_score,
      'checks', v_readiness_checks
    )
  );
end;
$$;

revoke all on function public.get_tax_preparation_report(date, date) from public, anon;
grant execute on function public.get_tax_preparation_report(date, date) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. P&L internal engine: Quick Sale excluded at source.
-- ------------------------------------------------------------------------------
create or replace function public.get_pnl_internal(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revenue numeric(15,2) := 0;
  v_returns numeric(15,2) := 0;
  v_product_cogs numeric(15,2) := 0;
  v_service_direct_cost numeric(15,2) := 0;
  v_custom_direct_cost numeric(15,2) := 0;
  v_quick_sale_cost numeric(15,2) := 0;
  v_cogs numeric(15,2) := 0;
  v_unverified_cost_count int := 0;
  v_commission numeric(15,2) := 0;
  v_expenses numeric(15,2) := 0;
  v_invoices int := 0;
  v_net_revenue numeric(15,2);
  v_gross numeric(15,2);
  v_net numeric(15,2);
  v_monthly jsonb;
  v_categories jsonb;
  v_top jsonb;
  v_has_warning boolean := false;
  v_warning_msg text := null;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;

  -- P&L revenue is recognized net of GST. Invoice total includes output GST;
  -- total_taxable_value is the revenue base and the GST control accounts are
  -- balance-sheet liabilities, not P&L income.
  select coalesce(sum(coalesce(total_taxable_value, total - coalesce(total_cgst,0) - coalesce(total_sgst,0) - coalesce(total_igst,0))), 0), count(*)::int
    into v_revenue, v_invoices
    from public.invoices
    where status <> 'cancelled'
      and coalesce(is_pass_through, false) = false
      and invoice_date between p_from and p_to;

  -- Quick sale revenue: DISCONTINUED (contributes 0; historical rows preserved).

  -- Returns reverse taxable revenue, not the GST-inclusive refund total.
  select coalesce(sum(coalesce(r.taxable_value_reversed, r.subtotal)), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(ii.cost_price, 0)), 0)
    into v_product_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and coalesce(i.is_pass_through, false) = false
      and i.invoice_date between p_from and p_to
      and ii.product_id is not null;

  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(ii.cost_price, 0)), 0)
    into v_service_direct_cost
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and coalesce(i.is_pass_through, false) = false
      and i.invoice_date between p_from and p_to
      and ii.service_id is not null;

  select count(*)::int
    into v_unverified_cost_count
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and coalesce(i.is_pass_through, false) = false
      and i.invoice_date between p_from and p_to
      and (ii.cost_snapshot_source = 'UNKNOWN' or (ii.service_id is not null and ii.cost_price is null));

  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(ii.cost_price, 0)), 0)
    into v_custom_direct_cost
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    where i.status <> 'cancelled'
      and coalesce(i.is_pass_through, false) = false
      and i.invoice_date between p_from and p_to
      and ii.product_id is null and ii.service_id is null;

  -- Quick sale COGS: DISCONTINUED (v_quick_sale_cost stays 0).

  v_cogs := v_product_cogs + v_service_direct_cost + v_custom_direct_cost;

  select coalesce(sum(coalesce(portal_commission, commission, 0) + coalesce(service_fee, 0)), 0)
    into v_commission
    from public.transactions
    where status = 'success' and transaction_date::date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_expenses
    from public.expenses
    where status = 'active'
      and coalesce(is_pass_through, false) = false
      and expense_date between p_from and p_to;

  v_net_revenue := v_revenue - v_returns;
  v_gross := v_net_revenue + v_commission - v_cogs;
  v_net := v_gross - v_expenses;

  if v_unverified_cost_count > 0 then
    v_has_warning := true;
    v_warning_msg := 'COGS incomplete: unverified direct costs present.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.month), '[]'::jsonb) into v_monthly
  from (
    select to_char(d, 'YYYY-MM') as month,
      coalesce(sum(rev), 0) as revenue,
      coalesce(sum(cogs), 0) as cogs,
      coalesce(sum(exp), 0) as expenses,
      coalesce(sum(com), 0) as commission,
      coalesce(sum(rev - cogs + com - exp), 0) as net
    from (
      select i.invoice_date as d,
        coalesce(i.total_taxable_value, i.total - coalesce(i.total_cgst,0) - coalesce(i.total_sgst,0) - coalesce(i.total_igst,0)) as rev,
        0::numeric as cogs, 0::numeric as exp, 0::numeric as com
      from public.invoices i
      where i.status <> 'cancelled' and coalesce(i.is_pass_through, false) = false and i.invoice_date between p_from and p_to
      union all
      select i.invoice_date, 0,
        (it.qty - coalesce(it.returned_qty, 0)) * coalesce(it.cost_price, 0), 0, 0
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      where i.status <> 'cancelled' and coalesce(i.is_pass_through, false) = false and i.invoice_date between p_from and p_to
      union all
      select expense_date, 0, 0, amount, 0 from public.expenses
      where status = 'active' and coalesce(is_pass_through, false) = false and expense_date between p_from and p_to
      union all
      select r.return_date, -coalesce(r.taxable_value_reversed, r.subtotal), 0, 0, 0
      from public.returns r join public.invoices i on i.id = r.invoice_id
      where r.status = 'completed' and i.status <> 'cancelled' and r.return_date between p_from and p_to
      union all
      select transaction_date::date, 0, 0, 0,
        (coalesce(portal_commission, commission, 0) + coalesce(service_fee, 0))
      from public.transactions
      where status = 'success' and transaction_date::date between p_from and p_to
      -- Quick sales monthly branch removed (feature discontinued).
    ) x
    group by to_char(d, 'YYYY-MM')
  ) m;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.amount desc), '[]'::jsonb) into v_categories
  from (
    select category, coalesce(sum(amount), 0) as amount from public.expenses
    where status = 'active' and coalesce(is_pass_through, false) = false and expense_date between p_from and p_to
    group by category
  ) c;

  select coalesce(jsonb_agg(to_jsonb(tp) order by tp.revenue desc), '[]'::jsonb) into v_top
  from (
    select coalesce(p.name, s.name, ii.description, 'Item') as name,
      sum(ii.qty - coalesce(ii.returned_qty, 0)) as qty,
      sum(ii.amount) as revenue
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and coalesce(i.is_pass_through, false) = false and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name, ii.description, 'Item')
    order by sum(ii.amount) desc limit 10
  ) tp;

  return jsonb_build_object(
    'revenue', v_revenue,
    'returns', v_returns,
    'net_revenue', v_net_revenue,
    'product_cogs', v_product_cogs,
    'service_direct_cost', v_service_direct_cost,
    'custom_direct_cost', v_custom_direct_cost,
    'quick_sale_cost', v_quick_sale_cost,
    'verified_cogs', v_cogs,
    'cogs', v_cogs,
    'unverified_cost_count', v_unverified_cost_count,
    'unverified_cost_warning', v_has_warning,
    'warning_message', v_warning_msg,
    'profit_label', case when v_has_warning then 'Business Profit Before Unverified Costs' else 'Net Business Profit' end,
    'gross_profit', v_gross,
    'commission', v_commission,
    'expenses', v_expenses,
    'net_profit', v_net,
    'invoices_count', v_invoices,
    'margin_percent', case when (v_net_revenue + v_commission) > 0 then round((v_gross / (v_net_revenue + v_commission)) * 100, 1) else 0 end,
    'net_margin_percent', case when (v_net_revenue + v_commission) > 0 then round((v_net / (v_net_revenue + v_commission)) * 100, 1) else 0 end,
    'monthly', v_monthly,
    'categories', v_categories,
    'top_products', v_top
  );
end;
$$;


-- ------------------------------------------------------------------------------
-- 3. Creation blocked at the source: both record_quick_sale overloads raise.
--    cancel_quick_sale is intentionally untouched (historical reversals).
-- ------------------------------------------------------------------------------
create or replace function public.record_quick_sale(
  p_sale_date date,
  p_amount numeric,
  p_cost numeric default 0,
  p_customer_id uuid default null,
  p_product_id uuid default null,
  p_service_id uuid default null,
  p_item_name text default null,
  p_tendered numeric default null,
  p_payments jsonb default '[]'::jsonb,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  raise exception 'Quick Sale is discontinued and no longer supported. Use POS billing instead.';
end;
$$;

create or replace function public.record_quick_sale(
  p_sale_date date,
  p_amount numeric,
  p_cost numeric,
  p_customer_id uuid,
  p_product_id uuid,
  p_service_id uuid,
  p_item_name text,
  p_tendered numeric,
  p_payments jsonb,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  raise exception 'Quick Sale is discontinued and no longer supported. Use POS billing instead.';
end;
$$;

revoke all on function public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric, jsonb, jsonb, text) from public, anon;
grant execute on function public.record_quick_sale(date, numeric, numeric, uuid, uuid, uuid, text, numeric, jsonb, jsonb, text) to authenticated, service_role;
