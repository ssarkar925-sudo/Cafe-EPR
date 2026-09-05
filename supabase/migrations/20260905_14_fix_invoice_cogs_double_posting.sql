create or replace function public.post_invoice_accounting_bridge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lines jsonb := '[]'::jsonb;
  v_pay record;
  v_tax numeric;
  v_sales numeric;
  v_code text;
begin
  if new.status not in ('unpaid','partial','paid') then return new; end if;
  if exists(select 1 from public.journal_entries where source_type='invoice' and source_id=new.id) then return new; end if;

  v_tax := coalesce(new.total_cgst,0)+coalesce(new.total_sgst,0)+coalesce(new.total_igst,0);
  v_sales := coalesce(new.total_taxable_value,new.total-v_tax);

  for v_pay in
    select p.instrument_id, sum(p.amount) amount
    from public.payments p
    where p.invoice_id=new.id
    group by p.instrument_id
  loop
    v_code := accounting_instrument_account_code(v_pay.instrument_id);
    if v_code is null then
      raise exception 'Invoice % has an unmapped payment instrument', new.invoice_number;
    end if;
    v_lines := v_lines || jsonb_build_object('account_code',v_code,'debit',v_pay.amount,'credit',0);
  end loop;

  if coalesce(new.due,0)>0 then
    v_lines := v_lines || jsonb_build_object('account_code','1300','debit',new.due,'credit',0);
  end if;
  if v_sales>0 then
    v_lines := v_lines || jsonb_build_object('account_code','4000','debit',0,'credit',v_sales);
  end if;
  if v_tax>0 then
    v_lines := v_lines || jsonb_build_object('account_code','2100','debit',0,'credit',v_tax);
  end if;

  -- Product COGS is posted exactly once by the immutable SALE stock-movement journal.
  -- Do not duplicate the COGS/Inventory leg here.
  perform public.post_journal_entry(
    new.invoice_date,'invoice',new.id,'Sale '||new.invoice_number,v_lines,null
  );
  return new;
end;
$$;
