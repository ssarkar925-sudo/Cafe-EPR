-- Run this in Supabase SQL Editor (idempotent).
-- Profit & Loss calculation for the Finance module and Dashboard.
-- Computes revenue, COGS, gross profit, commission income, expenses and net profit
-- for a date range, plus monthly trend, expense-by-category and top products.

create or replace function public.get_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  -- Revenue: non-cancelled invoices in range
  select coalesce(sum(total), 0), count(*)::int
    into v_revenue, v_invoices
    from public.invoices
    where status <> 'cancelled' and invoice_date between p_from and p_to;

  -- Returns / refunds in range. Fully-returned invoices (status = 'cancelled') are already
  -- excluded from revenue, so only returns on still-active invoices reduce revenue here,
  -- otherwise a full return would be double counted. Uses the returned subtotal (goods value).
  select coalesce(sum(r.subtotal), 0) into v_returns
    from public.returns r
    join public.invoices i on i.id = r.invoice_id
    where r.status = 'completed' and i.status <> 'cancelled'
      and r.return_date between p_from and p_to;

  -- COGS: sold qty (minus returned) x current cost price (products/services)
  select coalesce(sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)), 0)
    into v_cogs
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to;

  -- Commission income: successful AEPS/DMT/UPI transactions in range
  select coalesce(sum(commission + service_fee), 0) into v_commission
    from public.transactions
    where status = 'success' and transaction_date between p_from and p_to;

  -- Active expenses in range
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
      select i.invoice_date, 0, (it.qty - coalesce(it.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0), 0, 0
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
      select transaction_date, 0, 0, 0, commission + service_fee
      from public.transactions
      where status = 'success' and transaction_date between p_from and p_to
    ) raw
    group by to_char(d, 'YYYY-MM')
  ) m;

  -- Expense breakdown by category
  select coalesce(jsonb_agg(to_jsonb(c) order by c.amount desc), '[]'::jsonb) into v_categories
  from (
    select category, sum(amount) as amount, count(*) as count
    from public.expenses
    where status = 'active' and expense_date between p_from and p_to
    group by category
  ) c;

  -- Top products by gross profit
  select coalesce(jsonb_agg(to_jsonb(t) order by t.profit desc), '[]'::jsonb) into v_top
  from (
    select coalesce(p.name, s.name) as name,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * ii.rate) as revenue,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * coalesce(p.cost_price, s.cost_price, 0)) as cogs,
      sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) as profit,
      count(distinct i.id) as invoices
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    left join public.products p on p.id = ii.product_id
    left join public.services s on s.id = ii.service_id
    where i.status <> 'cancelled' and i.invoice_date between p_from and p_to
    group by coalesce(p.name, s.name)
    having sum((ii.qty - coalesce(ii.returned_qty, 0)) * (ii.rate - coalesce(p.cost_price, s.cost_price, 0))) <> 0
    order by profit desc
    limit 6
  ) t;

  return jsonb_build_object(
    'revenue', v_revenue,
    'returns', v_returns,
    'cogs', v_cogs,
    'commission_income', v_commission,
    'expenses', v_expenses,
    'net_revenue', v_net_revenue,
    'gross_profit', v_gross,
    'net_profit', v_net,
    'invoice_count', v_invoices,
    'monthly', v_monthly,
    'categories', v_categories,
    'top_products', v_top
  );
end;
$$;

revoke all on function public.get_pnl(date, date) from public;
grant execute on function public.get_pnl(date, date) to authenticated;
