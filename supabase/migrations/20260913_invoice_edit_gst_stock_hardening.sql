-- Harden the atomic invoice editor so its server-side totals include the GST snapshot
-- and duplicate product lines are checked as an aggregate quantity before create_sale.

DO $$
DECLARE
  v_oid oid := 'public.edit_invoice(uuid,uuid,date,numeric,numeric,numeric,jsonb,jsonb,text,text,text,text,text,numeric,numeric,numeric,numeric,boolean,numeric)'::regprocedure;
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(v_oid) INTO v_def;

  v_old := '  v_new_total := round(v_calc_subtotal - p_discount, 2);';
  v_new := $patch$
  v_new_total := round(
    (
      select coalesce(sum(
        round(
          coalesce((item->>'taxable_value')::numeric, 0) +
          coalesce((item->>'cgst_amount')::numeric, 0) +
          coalesce((item->>'sgst_amount')::numeric, 0) +
          coalesce((item->>'igst_amount')::numeric, 0),
          2
        )
      ), 0)
      from jsonb_array_elements(p_items) item
    ),
    2
  );
  p_total := v_new_total;
  p_total_taxable_value := round((select coalesce(sum(coalesce((item->>'taxable_value')::numeric, 0)), 0) from jsonb_array_elements(p_items) item), 2);
  p_total_cgst := round((select coalesce(sum(coalesce((item->>'cgst_amount')::numeric, 0)), 0) from jsonb_array_elements(p_items) item), 2);
  p_total_sgst := round((select coalesce(sum(coalesce((item->>'sgst_amount')::numeric, 0)), 0) from jsonb_array_elements(p_items) item), 2);
  p_total_igst := round((select coalesce(sum(coalesce((item->>'igst_amount')::numeric, 0)), 0) from jsonb_array_elements(p_items) item), 2);
$patch$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Invoice edit GST patch anchor not found; refusing unsafe patch';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $oldstock$
  for v_item in
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      coalesce((item->>'qty')::numeric, 0) as qty
    from jsonb_array_elements(p_items) item
    where nullif(item->>'product_id', '') is not null
  loop
$oldstock$;
  v_new := $newstock$
  for v_item in
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      sum(coalesce((item->>'qty')::numeric, 0)) as qty
    from jsonb_array_elements(p_items) item
    where nullif(item->>'product_id', '') is not null
    group by nullif(item->>'product_id', '')::uuid
  loop
$newstock$;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Invoice edit stock patch anchor not found; refusing unsafe patch';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  EXECUTE v_def;
END $$;
