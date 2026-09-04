-- Production safety hardening: reject inactive/nonexistent payment instruments in
-- the authenticated create_business_txn RPC. SECURITY DEFINER is retained because
-- this function intentionally performs canonical financial writes under RLS.
DO $migration$
declare
  v_sql text;
  v_marker text := '  v_fee numeric;';
  v_insert_decl text := '  v_fee numeric; v_instrument_active boolean;';
  v_check_marker text := '  v_fee := COALESCE(p_service_fee, 0);';
  v_check text := $check$
  IF p_pay_from_instrument_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_instruments
      WHERE id = p_pay_from_instrument_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Payment instrument not found or inactive';
    END IF;
  END IF;
$check$;
begin
  select pg_get_functiondef(p.oid) into v_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='create_business_txn'
    and pg_get_function_identity_arguments(p.oid) like 'p_service_type text, p_transaction_date date, p_transaction_timestamp timestamp with time zone, p_customer_id uuid%';
  if v_sql is null then raise exception 'create_business_txn function not found'; end if;
  if position('v_instrument_active boolean' in v_sql)=0 then
    v_sql := replace(v_sql, v_marker, v_insert_decl);
  end if;
  if position(v_check in v_sql)=0 then
    v_sql := replace(v_sql, v_check_marker, v_check || chr(10) || v_check_marker);
  end if;
  execute v_sql;
end $migration$;
