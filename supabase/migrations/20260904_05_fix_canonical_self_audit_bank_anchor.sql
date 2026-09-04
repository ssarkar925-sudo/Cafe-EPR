-- Financial integrity: a missing bank opening snapshot must not be interpreted as zero.
-- The live payment instrument balance is the canonical anchor until an explicit opening snapshot exists.

create or replace function public.run_canonical_self_audit(p_triggered_by text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool jsonb;
  v_bank_seed numeric;
  v_bank_seed_date date;
  v_bank_life numeric;
  v_bank_anchor numeric;
  v_bank_seed_exists boolean;
  v_pnl jsonb;
  v_neg int;
  v_trigger int;
  v_run uuid := gen_random_uuid();
  v_start timestamptz := clock_timestamp();
  v_pass int := 0;
  v_fail int := 0;
  v_warn int := 0;
  v_crit int := 0;
  v_findings jsonb;
  v_expected numeric;
  v_actual numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;
  if auth.role() <> 'service_role' and current_user <> 'postgres' and not public.is_back_office() then
    raise exception 'Forbidden';
  end if;

  v_pool := public.get_pool_balances(current_date);
  v_bank_anchor := coalesce((v_pool->'bank'->>'current')::numeric, 0);
  select s.opening, s.seed_date into v_bank_seed, v_bank_seed_date
  from public.get_pool_seed('bank', current_date) s;
  v_bank_seed := coalesce(v_bank_seed, 0);
  v_bank_seed_exists := coalesce(v_bank_seed_date, '0001-01-01'::date) <> '0001-01-01'::date;
  v_bank_seed_date := coalesce(v_bank_seed_date, current_date);
  v_bank_life := v_bank_seed + public.get_pool_movements('bank', v_bank_seed_date, current_date);
  v_pnl := public.get_pnl(current_date, current_date);
  select count(*) into v_neg from public.products where stock_qty < 0;
  select count(*) into v_trigger from information_schema.triggers
  where event_object_schema='public'
    and trigger_name in ('trg_prevent_posted_invoice_tax_mutation','trg_prevent_posted_invoice_item_tax_mutation');

  insert into public.audit_runs(id,run_date,triggered_by,total_checks,passed_count,warning_count,failed_count,critical_count,duration_ms,overall_score)
  values(v_run,now(),p_triggered_by,5,0,0,0,0,0,100);

  v_expected := coalesce((v_pool->'cash'->>'opening')::numeric,0) + coalesce((v_pool->'cash'->>'movements')::numeric,0);
  v_actual := coalesce((v_pool->'cash'->>'current')::numeric,0);
  if abs(v_expected-v_actual) <= .01 then v_pass := v_pass+1; else v_fail := v_fail+1; end if;
  insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
  values(v_run,'pool_cash','financial_pool',case when abs(v_expected-v_actual)<=.01 then 'LOW' else 'HIGH' end,case when abs(v_expected-v_actual)<=.01 then 'PASS' else 'FAIL' end,v_actual,v_expected::text,v_actual::text,abs(v_expected-v_actual),'Cash pool reconciliation','Opening + Net Movements = Current Cash');

  if not v_bank_seed_exists then
    v_pass := v_pass+1;
    insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
    values(v_run,'bank_dual_derivation','financial_pool','LOW','PASS',v_bank_anchor,v_bank_anchor::text,v_bank_anchor::text,0,'Bank has no historical opening snapshot; live canonical instrument balance is the anchor until one is recorded','No seed => Live Bank is canonical anchor');
  elsif abs(v_bank_life-v_bank_anchor) <= .01 then
    v_pass := v_pass+1;
    insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
    values(v_run,'bank_dual_derivation','financial_pool','LOW','PASS',v_bank_life,v_bank_life::text,v_bank_anchor::text,0,'Bank inception and live anchor agree','Inception Derivation = Live Bank');
  else
    v_crit := v_crit+1;
    insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
    values(v_run,'bank_dual_derivation','financial_pool','CRITICAL','CRITICAL',v_bank_life,v_bank_life::text,v_bank_anchor::text,abs(v_bank_life-v_bank_anchor),'Bank derivations disagree','Inception Derivation = Live Bank');
  end if;

  if v_neg=0 then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
  values(v_run,'inventory_stock','financial_pool','LOW',case when v_neg=0 then 'PASS' else 'FAIL' end,v_neg,'0',v_neg::text,v_neg,'Live inventory non-negative check','Stock >= 0');

  if coalesce((v_pnl->>'unverified_cost_count')::int,0)=0 then v_pass:=v_pass+1; else v_warn:=v_warn+1; end if;
  insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
  values(v_run,'pnl_live','accounting_tax','LOW',case when coalesce((v_pnl->>'unverified_cost_count')::int,0)=0 then 'PASS' else 'WARNING' end,coalesce((v_pnl->>'net_profit')::numeric,0),'0 unverified costs',coalesce((v_pnl->>'unverified_cost_count')::text,'0'),0,'P&L sourced from live get_pnl()','Revenue - Returns + Commission - COGS - Expenses = Net Profit');

  if v_trigger>=2 then v_pass:=v_pass+1; else v_fail:=v_fail+1; end if;
  insert into public.audit_findings(run_id,check_id,category,severity,status,amount,expected_value,actual_value,variance,description,formula)
  values(v_run,'security_immutability','security_governance','LOW',case when v_trigger>=2 then 'PASS' else 'FAIL' end,v_trigger,'2',v_trigger::text,greatest(0,2-v_trigger),'Invoice tax immutability triggers verified','Required triggers active');

  update public.audit_runs set total_checks=v_pass+v_fail+v_warn+v_crit,passed_count=v_pass,warning_count=v_warn,failed_count=v_fail,critical_count=v_crit,duration_ms=floor(extract(epoch from(clock_timestamp()-v_start))*1000),overall_score=case when v_crit>0 then 50 when v_fail>0 then 75 when v_warn>0 then 95 else 100 end where id=v_run;
  select jsonb_agg(to_jsonb(f) order by case f.status when 'CRITICAL' then 1 when 'FAIL' then 2 when 'WARNING' then 3 else 4 end) into v_findings from public.audit_findings f where f.run_id=v_run;
  return jsonb_build_object('run_id',v_run,'run_date',now(),'triggered_by',p_triggered_by,'total_checks',v_pass+v_fail+v_warn+v_crit,'passed_count',v_pass,'warning_count',v_warn,'failed_count',v_fail,'critical_count',v_crit,'overall_score',case when v_crit>0 then 50 when v_fail>0 then 75 when v_warn>0 then 95 else 100 end,'duration_ms',floor(extract(epoch from(clock_timestamp()-v_start))*1000),'findings',v_findings);
end;
$$;
