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

  v_revenue := v_revenue + coalesce(
    (select sum(amount) from public.quick_sales
     where status = 'active' and sale_date between p_from and p_to), 0);

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

  select coalesce(sum(cost), 0) into v_quick_sale_cost
    from public.quick_sales
    where status = 'active' and sale_date between p_from and p_to;

  v_cogs := v_product_cogs + v_service_direct_cost + v_custom_direct_cost + v_quick_sale_cost;

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
      union all
      select sale_date, amount, cost, 0, 0 from public.quick_sales
      where status = 'active' and sale_date between p_from and p_to
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
