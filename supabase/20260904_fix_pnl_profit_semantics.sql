-- Fix P&L presentation semantics without changing business data.
-- Gross profit must exclude commission income; commission is added after gross profit.
-- Also normalize the field aliases expected by the P&L UI.

create or replace function public.get_pnl(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_net_revenue numeric(15,2);
  v_cogs numeric(15,2);
  v_commission numeric(15,2);
  v_expenses numeric(15,2);
  v_gross numeric(15,2);
  v_net numeric(15,2);
  v_invoices int;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Forbidden'; end if;
  end if;

  v := public.get_pnl_internal(p_from, p_to);
  v_net_revenue := coalesce((v->>'net_revenue')::numeric, 0);
  v_cogs := coalesce((v->>'cogs')::numeric, (v->>'verified_cogs')::numeric, 0);
  v_commission := coalesce((v->>'commission_income')::numeric, (v->>'commission')::numeric, 0);
  v_expenses := coalesce((v->>'expenses')::numeric, 0);
  v_gross := v_net_revenue - v_cogs;
  v_net := v_gross + v_commission - v_expenses;
  v_invoices := coalesce((v->>'invoice_count')::int, (v->>'invoices_count')::int, 0);

  return v || jsonb_build_object(
    'gross_profit', v_gross,
    'commission_income', v_commission,
    'commission', v_commission,
    'net_profit', v_net,
    'invoice_count', v_invoices,
    'invoices_count', v_invoices,
    'margin_percent', case when v_net_revenue > 0 then round((v_gross / v_net_revenue) * 100, 1) else 0 end,
    'net_margin_percent', case when v_net_revenue > 0 then round((v_net / v_net_revenue) * 100, 1) else 0 end
  );
end;
$$;

revoke all on function public.get_pnl(date, date) from public, anon;
grant execute on function public.get_pnl(date, date) to authenticated;
