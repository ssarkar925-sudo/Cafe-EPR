-- =============================================================================
-- PR #67: Harden edit_invoice authorization
-- =============================================================================
--
-- SOURCE-PRESERVATION STRATEGY
-- ============================
-- This migration changes the minimum possible code to fix the authorization
-- vulnerability. All business logic is preserved VERBATIM from the production
-- database dump (cafeerp-production-backup-2026-09-21.dump).
--
-- CHANGES PER FUNCTION:
-- 1. edit_invoice (10-arg, idempotent wrapper):
--    ADDED:  Back-office authorization guard at the top of BEGIN block.
--    PRESERVED VERBATIM: All idempotency and delegation logic.
--
-- 2. edit_invoice (20-arg, GST idempotent wrapper):
--    ADDED:  Back-office authorization guard at the top of BEGIN block.
--    PRESERVED VERBATIM: Idempotency key validation, acquire/commit, delegation.
--
-- 3. edit_invoice (19-arg, mutating implementation):
--    CHANGED LINE 1 of BEGIN block:
--      FROM: if auth.uid() is null then raise exception 'Not authenticated'; end if;
--      TO:   defense-in-depth auth guard that also allows service_role
--    ADDED:  perform set_config('erp.internal_stock_mutation_authorized','on',true);
--            (fixes pre-existing production bug: stock trigger blocks restock without this)
--    CHANGED: v_new_id := (v_new->>'id')::uuid;
--      TO:   v_new_id := coalesce((v_new->>'invoice_id')::uuid,(v_new->>'id')::uuid);
--            (fixes pre-existing production bug: create_sale returns 'invoice_id' key)
--    PRESERVED VERBATIM: All validation, stock loops, cash reversal, ledger,
--            invoice cancellation, create_sale call, audit log, return value.
--
-- 4. edit_invoice_internal (9-arg, legacy):
--    NO body changes. ACL only: service_role grant already correct in production.
--
-- 5. ACL CHANGE (the core security fix):
--    19-arg: REVOKE EXECUTE FROM authenticated.
--            Production had GRANT to authenticated -- this is the vulnerability.
--            All API callers now must go through the idempotent wrappers.
--
-- VERIFICATION:
--    Run scripts/test-edit-invoice-security.py against the target database.
--    Baseline production body hashes (md5(prosrc)):
--      edit_invoice:10  = 1237e72083beb73fef5aa59fae809f89  (modified -- auth added)
--      edit_invoice:19  = 44d3f19d64a975d72db7acfe3bc3b0e1  (modified -- auth+bugfixes)
--      edit_invoice:20  = 46666ea7a541daa8011e9a51682fa554  (modified -- auth added)
--      edit_invoice_internal:9 = eef89afb729801670bc2c86da866b394  (unchanged)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. edit_invoice (10-arg) — Add auth guard; body otherwise verbatim from dump
-- =============================================================================
-- Original signature from dump TOC 801 / OID 25843
CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id       uuid,
  p_customer_id      uuid,
  p_invoice_date     date,
  p_subtotal         numeric,
  p_discount         numeric,
  p_total            numeric,
  p_payments         jsonb,
  p_items            jsonb,
  p_reason           text,
  p_idempotency_key  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_gate jsonb; v_result jsonb;
BEGIN
  -- [SECURITY FIX ONLY — not in original production body]
  -- Enforce back-office authorization for all API role callers.
  -- service_role and direct postgres session bypass this check intentionally.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- trusted caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
  END IF;
  -- [END SECURITY FIX]

  -- Verbatim from production dump TOC 801:
  v_gate:=public.idempotency_acquire('edit_invoice',p_idempotency_key,jsonb_build_object('p_invoice_id',p_invoice_id,'p_customer_id',p_customer_id,'p_invoice_date',p_invoice_date,'p_subtotal',p_subtotal,'p_discount',p_discount,'p_total',p_total,'p_payments',p_payments,'p_items',p_items,'p_reason',p_reason));
  IF v_gate->>'status'='replay' THEN RETURN v_gate->'response_payload'; END IF;
  v_result:=public.edit_invoice(p_invoice_id,p_customer_id,p_invoice_date,p_subtotal,p_discount,p_total,p_payments,p_items,p_reason);
  PERFORM public.idempotency_commit('edit_invoice',p_idempotency_key,'completed',p_invoice_id,v_result);
  RETURN v_result;
END;
$$;


-- =============================================================================
-- 2. edit_invoice (20-arg) — Add auth guard; body otherwise verbatim from dump
-- =============================================================================
-- Original signature from dump TOC 835 / OID 26628
CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id            uuid,
  p_customer_id           uuid,
  p_invoice_date          date,
  p_subtotal              numeric,
  p_discount              numeric,
  p_total                 numeric,
  p_payments              jsonb,
  p_items                 jsonb,
  p_reason                text,
  p_place_of_supply       text,
  p_supply_type           text,
  p_customer_gstin        text,
  p_b2b_or_b2c            text,
  p_total_taxable_value   numeric,
  p_total_cgst            numeric,
  p_total_sgst            numeric,
  p_total_igst            numeric,
  p_is_reverse_charge     boolean,
  p_advance_used          numeric,
  p_idempotency_key       text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gate jsonb;
  v_result jsonb;
BEGIN
  -- [SECURITY FIX ONLY — not in original production body]
  -- Enforce back-office authorization for all API role callers.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- trusted caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
  END IF;
  -- [END SECURITY FIX]

  -- Verbatim from production dump TOC 835:
  IF nullif(trim(coalesce(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  v_gate := public.idempotency_acquire(
    'edit_invoice',
    p_idempotency_key,
    jsonb_build_object(
      'p_invoice_id', p_invoice_id,
      'p_customer_id', p_customer_id,
      'p_invoice_date', p_invoice_date,
      'p_subtotal', p_subtotal,
      'p_discount', p_discount,
      'p_total', p_total,
      'p_payments', p_payments,
      'p_items', p_items,
      'p_reason', p_reason,
      'p_place_of_supply', p_place_of_supply,
      'p_supply_type', p_supply_type,
      'p_customer_gstin', p_customer_gstin,
      'p_b2b_or_b2c', p_b2b_or_b2c,
      'p_total_taxable_value', p_total_taxable_value,
      'p_total_cgst', p_total_cgst,
      'p_total_sgst', p_total_sgst,
      'p_total_igst', p_total_igst,
      'p_is_reverse_charge', p_is_reverse_charge,
      'p_advance_used', p_advance_used
    )
  );

  IF v_gate->>'status' = 'replay' THEN
    RETURN v_gate->'response_payload';
  END IF;

  v_result := public.edit_invoice(
    p_invoice_id,
    p_customer_id,
    p_invoice_date,
    p_subtotal,
    p_discount,
    p_total,
    p_payments,
    p_items,
    p_reason,
    p_place_of_supply,
    p_supply_type,
    p_customer_gstin,
    p_b2b_or_b2c,
    p_total_taxable_value,
    p_total_cgst,
    p_total_sgst,
    p_total_igst,
    p_is_reverse_charge,
    p_advance_used
  );

  PERFORM public.idempotency_commit(
    'edit_invoice',
    p_idempotency_key,
    'completed',
    p_invoice_id,
    v_result
  );

  RETURN v_result;
END;
$$;


-- =============================================================================
-- 3. edit_invoice (19-arg, mutating implementation)
--    Three targeted changes; all other lines verbatim from dump TOC 834 / OID 26409.
--    Change 1: Replace auth.uid() IS NULL guard with service_role-aware guard.
--    Change 2: Add set_config for stock mutation trigger (pre-existing prod bug fix).
--    Change 3: Fix v_new_id extraction (create_sale returns 'invoice_id', not 'id').
-- =============================================================================
CREATE OR REPLACE FUNCTION public.edit_invoice(
  p_invoice_id            uuid,
  p_customer_id           uuid,
  p_invoice_date          date,
  p_subtotal              numeric,
  p_discount              numeric,
  p_total                 numeric,
  p_payments              jsonb,
  p_items                 jsonb,
  p_reason                text    DEFAULT ''::text,
  p_place_of_supply       text    DEFAULT NULL::text,
  p_supply_type           text    DEFAULT 'intra_state'::text,
  p_customer_gstin        text    DEFAULT NULL::text,
  p_b2b_or_b2c            text    DEFAULT 'B2C_SMALL'::text,
  p_total_taxable_value   numeric DEFAULT NULL::numeric,
  p_total_cgst            numeric DEFAULT 0,
  p_total_sgst            numeric DEFAULT 0,
  p_total_igst            numeric DEFAULT 0,
  p_is_reverse_charge     boolean DEFAULT false,
  p_advance_used          numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_old public.invoices%rowtype;
  v_item record;
  v_payment jsonb;
  v_cash record;
  v_ledger_net numeric := 0;
  v_old_payment_total numeric := 0;
  v_new_id uuid;
  v_new jsonb;
  v_new_number text;
  v_calc_subtotal numeric := 0;
  v_new_total numeric := 0;
  v_stock numeric;
  v_qty numeric;
  v_old_qty numeric;
  v_old_returned_qty numeric;
begin
  -- [CHANGE 1: replaced original single-line auth.uid() IS NULL check]
  -- Original was: if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- This blocked service_role (which has auth.uid() = NULL by design).
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF NOT public.is_back_office() THEN
      IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
      ELSE
        RAISE EXCEPTION 'Back-office authorization required';
      END IF;
    END IF;
  ELSIF coalesce(auth.role(), '') = 'service_role' THEN
    NULL; -- trusted caller
  ELSE
    IF NOT (session_user = 'postgres' OR public.is_back_office()) THEN
      RAISE EXCEPTION 'Back-office authorization required';
    END IF;
  END IF;
  -- [END CHANGE 1]

  -- [CHANGE 2: add stock trigger authorization]
  -- trg_protect_product_stock_mutation blocks UPDATE on products.stock_qty unless
  -- erp.internal_stock_mutation_authorized = 'on'. The original 19-arg body omitted
  -- this, causing the restock loop below to fail for product invoices (pre-existing bug).
  PERFORM set_config('erp.internal_stock_mutation_authorized', 'on', true);
  -- [END CHANGE 2]

  -- Verbatim from production dump TOC 834 from this point forward:
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice must contain at least one item';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Payments must be an array';
  end if;
  if p_discount is null or p_discount < 0 then
    raise exception 'Invalid discount';
  end if;
  if p_advance_used is null or p_advance_used < 0 then
    raise exception 'Invalid advance amount';
  end if;

  select * into v_old
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_old.status in ('cancelled', 'returned') then
    raise exception 'Invoice already cancelled or returned';
  end if;
  if coalesce(v_old.refunded, 0) > 0 then
    raise exception 'Refunded invoices cannot be edited; use the return/refund workflow';
  end if;

  if exists (
    select 1
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and coalesce(ii.returned_qty, 0) > 0
  ) or coalesce(v_old.returned, 0) > 0 then
    raise exception 'Invoices containing returned items cannot be edited; use the return workflow';
  end if;

  select coalesce(sum(round(coalesce((item->>'amount')::numeric, 0), 2)), 0)
    into v_calc_subtotal
  from jsonb_array_elements(p_items) item;

  if p_discount > v_calc_subtotal then
    raise exception 'Discount cannot exceed subtotal';
  end if;


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


  select coalesce(sum(round(coalesce((payment->>'amount')::numeric, 0), 2)), 0)
    into v_old_payment_total
  from jsonb_array_elements(p_payments) payment;

  if abs((coalesce(v_old.paid, 0) - v_old_payment_total) - p_advance_used) > 0.005 then
    raise exception 'Payment/advance preservation mismatch; invoice edit aborted';
  end if;

  if v_old_payment_total + p_advance_used > v_new_total + 0.005 then
    raise exception 'Corrected invoice total cannot be lower than the amount already collected';
  end if;

  for v_item in
    select ii.product_id, ii.qty
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and ii.product_id is not null
  loop
    update public.products
       set stock_qty = coalesce(stock_qty, 0) + coalesce(v_item.qty, 0),
           updated_at = now()
     where id = v_item.product_id;
  end loop;

  for v_item in
    select
      nullif(item->>'product_id', '')::uuid as product_id,
      sum(coalesce((item->>'qty')::numeric, 0)) as qty
    from jsonb_array_elements(p_items) item
    where nullif(item->>'product_id', '') is not null
    group by nullif(item->>'product_id', '')::uuid
  loop
    if v_item.qty <= 0 then
      raise exception 'Product quantity must be greater than zero';
    end if;
    select stock_qty into v_stock from public.products where id = v_item.product_id for update;
    if v_stock is null then
      raise exception 'Product not found';
    end if;
    if v_stock < v_item.qty then
      raise exception 'Insufficient stock for corrected invoice (have %, need %)', v_stock, v_item.qty;
    end if;
  end loop;

  for v_cash in
    select *
    from public.cash_entries
    where ref_type = 'invoice'
      and ref_id = p_invoice_id
  loop
    insert into public.cash_entries (
      entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id
    ) values (
      v_cash.entry_date,
      v_cash.method,
      case when v_cash.direction = 'in' then 'out' else 'in' end,
      v_cash.amount,
      'Edit reversal of ' || v_old.invoice_number,
      'invoice',
      p_invoice_id,
      v_cash.instrument_id
    );
  end loop;

  if v_old.customer_id is not null then
    select coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
      into v_ledger_net
    from public.customer_ledger
    where ref_id = p_invoice_id;

    if v_ledger_net <> 0 then
      update public.customers
         set balance = balance - v_ledger_net,
             updated_at = now()
       where id = v_old.customer_id;

      insert into public.customer_ledger (
        customer_id, entry_date, type, description, debit, credit, balance_after, ref_id
      ) values (
        v_old.customer_id,
        v_old.invoice_date,
        'adjustment',
        'Edit reversal of ' || v_old.invoice_number,
        case when v_ledger_net < 0 then -v_ledger_net else null end,
        case when v_ledger_net > 0 then v_ledger_net else null end,
        (select balance from public.customers where id = v_old.customer_id),
        p_invoice_id
      );
    end if;
  end if;

  update public.invoices
     set status = 'cancelled'
   where id = p_invoice_id;

  select public.create_sale(
    p_customer_id => p_customer_id,
    p_invoice_date => p_invoice_date,
    p_subtotal => v_calc_subtotal,
    p_discount => p_discount,
    p_total => v_new_total,
    p_payments => p_payments,
    p_items => p_items,
    p_previous_due => 0,
    p_previous_due_method => 'cash',
    p_previous_due_instrument_id => null,
    p_advance_used => p_advance_used,
    p_place_of_supply => p_place_of_supply,
    p_supply_type => coalesce(p_supply_type, 'intra_state'),
    p_customer_gstin => p_customer_gstin,
    p_b2b_or_b2c => coalesce(p_b2b_or_b2c, 'B2C_SMALL'),
    p_total_taxable_value => p_total_taxable_value,
    p_total_cgst => coalesce(p_total_cgst, 0),
    p_total_sgst => coalesce(p_total_sgst, 0),
    p_total_igst => coalesce(p_total_igst, 0),
    p_is_reverse_charge => coalesce(p_is_reverse_charge, false)
  ) into v_new;

  -- [CHANGE 3: coalesce 'invoice_id' key before falling back to 'id']
  -- Original was: v_new_id := (v_new->>'id')::uuid;
  -- create_sale returns 'invoice_id' (not 'id'), causing v_new_id = NULL in prod.
  v_new_id := coalesce((v_new->>'invoice_id')::uuid, (v_new->>'id')::uuid);
  -- [END CHANGE 3]

  v_new_number := v_new->>'invoice_number';

  update public.invoices
     set edited_from = p_invoice_id
   where id = v_new_id;

  insert into public.audit_logs (
    user_id, user_name, action, entity, entity_id, description, details
  ) values (
    auth.uid(), null, 'invoice_edited', 'invoices', v_new_id::text,
    'Edited ' || v_old.invoice_number || ' -> ' || v_new_number || coalesce(' | ' || nullif(p_reason, ''), ''),
    jsonb_build_object(
      'old_invoice_id', p_invoice_id,
      'old_invoice_number', v_old.invoice_number,
      'new_invoice_id', v_new_id,
      'new_invoice_number', v_new_number,
      'old_total', v_old.total,
      'new_total', v_new_total,
      'old_customer_id', v_old.customer_id,
      'new_customer_id', p_customer_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'old_invoice_id', p_invoice_id,
    'old_invoice_number', v_old.invoice_number,
    'id', v_new_id,
    'invoice_number', v_new_number,
    'customer_id', v_new->>'customer_id',
    'total', v_new->>'total',
    'paid', v_new->>'paid',
    'due', v_new->>'due',
    'status', v_new->>'status',
    'invoice_date', v_new->>'invoice_date'
  );
end;
$$;


-- =============================================================================
-- 4. ACL HARDENING (the core security fix)
-- =============================================================================
-- 10-arg wrapper: was already correct in production (anon=f, auth=t, sr=t). Keep.
-- 20-arg wrapper: was already correct in production (anon=f, auth=t, sr=t). Keep.
-- 19-arg core:    VULNERABILITY — was GRANT to authenticated. Revoke it.
--                 Only service_role may call the mutating implementation directly.
-- 9-arg internal: already correct in production (only service_role). Keep.

-- Revoke authenticated from the mutating 19-arg implementation:
REVOKE EXECUTE ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text,
  text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric
) FROM authenticated;

-- Explicitly keep (re-affirm) the correct ACLs for wrappers:
GRANT EXECUTE ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.edit_invoice(
  uuid, uuid, date, numeric, numeric, numeric, jsonb, jsonb, text,
  text, text, text, text, numeric, numeric, numeric, numeric, boolean, numeric, text
) TO authenticated, service_role;

COMMIT;
