-- Keep the canonical self-audit independent from get_pool_movements(), which can omit
-- instrument-linked bank cash legs. Derive bank movements directly from immutable cash entries.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.run_canonical_self_audit(text)'::regprocedure);
  src := replace(src,
    'v_bank_life:=v_bank_seed+public.get_pool_movements(''bank'',v_bank_seed_date,current_date);',
    'select v_bank_seed+coalesce(sum(case when ce.direction=''in'' then ce.amount else -ce.amount end),0) into v_bank_life from public.cash_entries ce join public.payment_instruments pi on pi.id=ce.instrument_id where pi.type=''bank'' and ce.entry_date>=v_bank_seed_date and ce.entry_date<=current_date; v_bank_life:=coalesce(v_bank_life,v_bank_seed);');
  execute src;
end $$;

revoke execute on function public.process_purchase_return(uuid,jsonb,numeric,text,text,date) from public, anon;
revoke execute on function public.run_canonical_self_audit(text) from public, anon;
grant execute on function public.run_canonical_self_audit(text) to authenticated;
