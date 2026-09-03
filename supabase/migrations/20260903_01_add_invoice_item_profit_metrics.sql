-- Persist gross-profit metrics for every invoice line, including custom POS items.
-- Profit is based on the unit cost snapshot stored on invoice_items.

alter table public.invoice_items
  add column if not exists profit_amount numeric generated always as (
    round(coalesce(amount, 0) - (coalesce(cost_price, 0) * coalesce(qty, 0)), 2)
  ) stored,
  add column if not exists profit_margin_pct numeric generated always as (
    case
      when coalesce(amount, 0) > 0 then
        round(((coalesce(amount, 0) - (coalesce(cost_price, 0) * coalesce(qty, 0))) / amount) * 100, 2)
      else 0
    end
  ) stored;

comment on column public.invoice_items.profit_amount is
  'Gross profit snapshot: line selling amount minus unit cost times quantity.';

comment on column public.invoice_items.profit_margin_pct is
  'Gross profit margin percentage based on line selling amount.';
