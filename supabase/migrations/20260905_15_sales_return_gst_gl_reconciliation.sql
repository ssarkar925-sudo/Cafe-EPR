create or replace function public.get_sales_return_gst_gl_reconciliation(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := coalesce(p_from,date '1900-01-01');
  v_to date := coalesce(p_to,date '2999-12-31');
  v_return_gst numeric := 0;
  v_output_reversal_journal numeric := 0;
  v_return_count int := 0;
  v_variance numeric := 0;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.is_back_office() then raise exception 'Back-office access required'; end if;
  end if;

  select count(*)::int,
         coalesce(sum(coalesce(r.cgst_reversed,0)+coalesce(r.sgst_reversed,0)+coalesce(r.igst_reversed,0)),0)
    into v_return_count, v_return_gst
  from public.returns r
  join public.invoices i on i.id=r.invoice_id
  where r.return_date between v_from and v_to
    and r.status in ('completed','approved')
    and i.status <> 'cancelled';

  select coalesce(sum(jl.debit-jl.credit),0)
    into v_output_reversal_journal
  from public.journal_entries je
  join public.journal_lines jl on jl.journal_entry_id=je.id
  join public.accounting_accounts aa on aa.id=jl.account_id
  where je.entry_date between v_from and v_to
    and je.status='posted'
    and je.source_type='sales_return_tax'
    and aa.code='2100';

  v_variance := round(v_return_gst-v_output_reversal_journal,2);

  return jsonb_build_object(
    'from',v_from,'to',v_to,'return_count',v_return_count,
    'return_gst_reversal',round(v_return_gst,2),
    'output_gst_reversal_journal',round(v_output_reversal_journal,2),
    'variance',v_variance,
    'status',case when abs(v_variance)<0.01 then 'ok' else 'mismatch' end,
    'note','Sales-return GST reversal is reconciled separately from the Sales Returns P&L account; account 2100 is the GST output control account.'
  );
end;
$$;

create or replace function public.post_sales_return_tax_reversal(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lines jsonb := '[]'::jsonb;
  v_tax numeric := 0;
begin
  select * into r from public.returns where id=p_return_id for update;
  if not found then raise exception 'Return not found'; end if;
  if r.status not in ('completed','approved') then return; end if;
  v_tax := coalesce(r.cgst_reversed,0)+coalesce(r.sgst_reversed,0)+coalesce(r.igst_reversed,0);
  if v_tax <= 0 then return; end if;
  if exists(select 1 from public.journal_entries where source_type='sales_return_tax' and source_id=r.id and status='posted') then return; end if;
  v_lines := v_lines || jsonb_build_object('account_code','2100','debit',v_tax,'credit',0);
  v_lines := v_lines || jsonb_build_object('account_code','5100','debit',0,'credit',v_tax);
  -- Recognize the GST reversal in the return's accounting period, not the server's current date.
  perform public.post_journal_entry(r.return_date,'sales_return_tax',r.id,'GST reversal '||r.return_number,v_lines,null);
end;
$$;

create or replace function public.trg_post_sales_return_tax_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed','approved') then
    perform public.post_sales_return_tax_reversal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_sales_return_tax_reversal on public.returns;
create trigger trg_post_sales_return_tax_reversal
after insert or update of status on public.returns
for each row execute function public.trg_post_sales_return_tax_reversal();
