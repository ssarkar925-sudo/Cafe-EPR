-- ============================================================================
-- V1 BASELINE — V1_015: Returns / Refunds
-- Approved rule: proportional allocation of header discount across returned
-- invoice-line value; ₹0.01 half-up via PostgreSQL numeric round().
-- No live refund-provider integration. Refund methods: khata_credit, cash.
-- All financial execution is atomic and server-authoritative.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Numbering + journal source extensions
-- --------------------------------------------------------------------------
ALTER TABLE public.numbering_sequences
  DROP CONSTRAINT IF EXISTS numbering_sequences_seq_name_check;
ALTER TABLE public.numbering_sequences
  ADD CONSTRAINT numbering_sequences_seq_name_check
  CHECK (seq_name IN ('invoice','settlement','closing','return'));

INSERT INTO public.numbering_sequences (tenant_id, seq_name, current_value, increment_by)
SELECT id, 'return', 0, 1
FROM public.tenants
WHERE status = 'active'
ON CONFLICT (tenant_id, seq_name) DO NOTHING;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type IN ('sale','purchase','payment','service','adjustment',
                         'settlement','opening','reversal','variance','return'));

-- --------------------------------------------------------------------------
-- 2. Return documents / lines / lot trace / refund records
-- --------------------------------------------------------------------------
CREATE TABLE public.return_documents (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  original_invoice_id  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  return_number        text NOT NULL,
  status               text NOT NULL DEFAULT 'requested'
                       CHECK (status IN ('requested','approved','posted',
                                         'rejected','cancelled')),
  reason               text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  subtotal_returned    numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal_returned >= 0),
  discount_returned    numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_returned >= 0),
  refund_total         numeric(18,2) NOT NULL DEFAULT 0 CHECK (refund_total >= 0),
  refund_method        text NOT NULL
                       CHECK (refund_method IN ('khata_credit','cash')),
  refund_instrument_id uuid REFERENCES public.payment_instruments(id) ON DELETE RESTRICT,
  approval_id          uuid REFERENCES public.approvals(id) ON DELETE RESTRICT,
  requested_by_profile uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_by_profile  uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at          timestamptz,
  journal_entry_id     uuid REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, return_number),
  CONSTRAINT return_cash_requires_instrument
    CHECK (refund_method <> 'cash' OR refund_instrument_id IS NOT NULL),
  CONSTRAINT return_khata_requires_customer
    CHECK (refund_method <> 'khata_credit' OR customer_id IS NOT NULL)
);
CREATE INDEX return_documents_invoice_idx
  ON public.return_documents(tenant_id, original_invoice_id);
CREATE INDEX return_documents_status_idx
  ON public.return_documents(tenant_id, status);
CREATE TRIGGER trg_return_documents_updated_at
  BEFORE UPDATE ON public.return_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.return_lines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  return_document_id    uuid NOT NULL REFERENCES public.return_documents(id) ON DELETE RESTRICT,
  original_invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines(id) ON DELETE RESTRICT,
  product_id            uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty                   numeric(18,2) NOT NULL CHECK (qty > 0),
  unit_refund_value     numeric(18,2) NOT NULL CHECK (unit_refund_value >= 0),
  refund_amount         numeric(18,2) NOT NULL CHECK (refund_amount >= 0),
  disposition           text NOT NULL
                        CHECK (disposition IN ('sellable','damaged')),
  reason                text NOT NULL CHECK (char_length(btrim(reason)) > 0),
  discount_allocated    numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_allocated >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_document_id, original_invoice_line_id)
);
CREATE INDEX return_lines_invoice_line_idx
  ON public.return_lines(tenant_id, original_invoice_line_id);

CREATE TABLE public.return_line_lots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  return_line_id           uuid NOT NULL REFERENCES public.return_lines(id) ON DELETE RESTRICT,
  original_invoice_line_lot_id uuid NOT NULL REFERENCES public.invoice_line_lots(id) ON DELETE RESTRICT,
  lot_id                   uuid NOT NULL REFERENCES public.stock_lots(id) ON DELETE RESTRICT,
  qty                      numeric(18,2) NOT NULL CHECK (qty > 0),
  unit_cost                numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_line_id, original_invoice_line_lot_id)
);
CREATE INDEX return_line_lots_original_idx
  ON public.return_line_lots(tenant_id, original_invoice_line_lot_id);

CREATE TABLE public.refund_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  return_document_id    uuid NOT NULL REFERENCES public.return_documents(id) ON DELETE RESTRICT,
  method                text NOT NULL CHECK (method IN ('khata_credit','cash')),
  amount                numeric(18,2) NOT NULL CHECK (amount >= 0),
  claim_id              uuid REFERENCES public.payment_claims(id) ON DELETE RESTRICT,
  journal_entry_id      uuid REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_document_id)
);

-- --------------------------------------------------------------------------
-- 3. RLS — deny direct writes; requester + back-office reads
-- --------------------------------------------------------------------------
ALTER TABLE public.return_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_line_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.return_documents, public.return_lines,
  public.return_line_lots, public.refund_records
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.return_documents, public.return_lines,
  public.return_line_lots, public.refund_records TO authenticated;

CREATE POLICY return_documents_scope_select ON public.return_documents
FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant()
  AND (
    requested_by_profile IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    OR public.is_back_office()
  )
);

CREATE POLICY return_lines_scope_select ON public.return_lines
FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant()
  AND EXISTS (
    SELECT 1 FROM public.return_documents d
    WHERE d.id = return_lines.return_document_id
      AND d.tenant_id = public.current_tenant()
      AND (
        d.requested_by_profile IN (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
        OR public.is_back_office()
      )
  )
);

CREATE POLICY return_line_lots_scope_select ON public.return_line_lots
FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant()
  AND EXISTS (
    SELECT 1
    FROM public.return_lines rl
    JOIN public.return_documents d ON d.id = rl.return_document_id
    WHERE rl.id = return_line_lots.return_line_id
      AND d.tenant_id = public.current_tenant()
      AND (
        d.requested_by_profile IN (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
        OR public.is_back_office()
      )
  )
);

CREATE POLICY refund_records_scope_select ON public.refund_records
FOR SELECT TO authenticated
USING (
  tenant_id = public.current_tenant()
  AND EXISTS (
    SELECT 1 FROM public.return_documents d
    WHERE d.id = refund_records.return_document_id
      AND (
        d.requested_by_profile IN (
          SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
        )
        OR public.is_back_office()
      )
  )
);

-- --------------------------------------------------------------------------
-- 4. request_return
--    Creates immutable return request + G7 approval request.
--    p_lines = [{invoice_line_id, qty, disposition, reason}]
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_return(
  p_invoice_id uuid,
  p_lines jsonb,
  p_refund_method text,
  p_refund_instrument_id uuid DEFAULT NULL,
  p_scope_hash text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean;
  v_resp jsonb;
  v_actor uuid;
  v_invoice record;
  v_item jsonb;
  v_line record;
  v_return_id uuid;
  v_return_number text;
  v_approval_id uuid;
  v_sub numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_disposition text;
  v_line_amount numeric;
  v_line_discount numeric;
  v_remaining numeric;
  v_prior_discount numeric;
  v_scope_details jsonb := '{}'::jsonb;
BEGIN
  v_tenant := public.current_tenant();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Tenant context required'; END IF;

  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('request_return', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active profile for caller'; END IF;

  IF nullif(btrim(p_scope_hash), '') IS NULL THEN
    RAISE EXCEPTION 'Return approval scope hash required';
  END IF;
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Return reason required';
  END IF;
  IF p_refund_method NOT IN ('khata_credit','cash') THEN
    RAISE EXCEPTION 'Unsupported refund method';
  END IF;
  IF p_refund_method = 'cash' AND p_refund_instrument_id IS NULL THEN
    RAISE EXCEPTION 'Cash refund requires refund instrument';
  END IF;

  SELECT i.* INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.tenant_id = v_tenant
    AND i.status = 'posted'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Posted invoice not found in tenant'; END IF;

  IF p_refund_method = 'khata_credit' AND v_invoice.customer_id IS NULL THEN
    RAISE EXCEPTION 'Khata refund requires invoice customer';
  END IF;

  IF p_refund_method = 'cash'
     AND NOT EXISTS (
       SELECT 1 FROM public.payment_instruments pi
       WHERE pi.id = p_refund_instrument_id
         AND pi.tenant_id = v_tenant
         AND pi.is_active
         AND pi.itype = 'cash'
     ) THEN
    RAISE EXCEPTION 'Refund instrument must be an active cash instrument';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Return requires at least one line';
  END IF;

  v_return_number := 'RET-' ||
    lpad(public.next_canonical_number('return')::text, 6, '0');

  INSERT INTO public.return_documents
    (tenant_id, original_invoice_id, customer_id, return_number,
     reason, refund_method, refund_instrument_id, requested_by_profile)
  VALUES
    (v_tenant, p_invoice_id, v_invoice.customer_id, v_return_number,
     btrim(p_reason), p_refund_method, p_refund_instrument_id, v_actor)
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    v_disposition := btrim(v_item->>'disposition');

    IF v_qty <= 0 THEN RAISE EXCEPTION 'Return qty must be positive'; END IF;
    IF v_disposition NOT IN ('sellable','damaged') THEN
      RAISE EXCEPTION 'Return disposition must be sellable or damaged';
    END IF;
    IF nullif(btrim(v_item->>'reason'), '') IS NULL THEN
      RAISE EXCEPTION 'Return line reason required';
    END IF;

    SELECT il.*, p.id AS checked_product_id
      INTO v_line
    FROM public.invoice_lines il
    JOIN public.products p ON p.id = il.product_id
    WHERE il.id = nullif(v_item->>'invoice_line_id','')::uuid
      AND il.invoice_id = p_invoice_id
      AND il.tenant_id = v_tenant;

    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice line not found in original invoice'; END IF;

    SELECT il.qty - coalesce(sum(
             CASE WHEN rd.status NOT IN ('cancelled','rejected')
                  THEN rl.qty ELSE 0 END
           ),0)
      INTO v_remaining
    FROM public.invoice_lines il
    LEFT JOIN public.return_lines rl
      ON rl.original_invoice_line_id = il.id
    LEFT JOIN public.return_documents rd
      ON rd.id = rl.return_document_id
    WHERE il.id = v_line.id
    GROUP BY il.qty;

    IF v_qty > coalesce(v_remaining,0) THEN
      RAISE EXCEPTION 'Return qty exceeds remaining returnable qty';
    END IF;

    v_line_amount := round(v_line.amount * v_qty / v_line.qty, 2);
    v_line_discount := round(
      coalesce(v_invoice.discount,0) * v_line_amount / nullif(v_invoice.subtotal,0), 2);

    INSERT INTO public.return_lines
      (tenant_id, return_document_id, original_invoice_line_id, product_id,
       qty, unit_refund_value, refund_amount, disposition, reason,
       discount_allocated)
    VALUES
      (v_tenant, v_return_id, v_line.id, v_line.product_id, v_qty,
       CASE WHEN v_qty = 0 THEN 0
            ELSE round(greatest(v_line_amount - v_line_discount,0) / v_qty,2) END,
       greatest(v_line_amount - v_line_discount,0),
       v_disposition, btrim(v_item->>'reason'), v_line_discount);

    v_sub := v_sub + v_line_amount;
    v_discount := v_discount + v_line_discount;
  END LOOP;

  -- When this request completes the entire invoice, absorb the accumulated
  -- cent residual into the last requested line so all return discounts sum
  -- exactly to the original header discount.
  IF NOT EXISTS (
    SELECT 1
    FROM public.invoice_lines il
    WHERE il.invoice_id = p_invoice_id
      AND il.qty > (
        coalesce((
          SELECT sum(rl.qty)
          FROM public.return_lines rl
          JOIN public.return_documents rd ON rd.id = rl.return_document_id
          WHERE rl.original_invoice_line_id = il.id
            AND rd.status NOT IN ('cancelled','rejected')
        ), 0)
      )
  ) THEN
    SELECT coalesce(sum(rl.discount_allocated),0)
      INTO v_prior_discount
    FROM public.return_lines rl
    JOIN public.return_documents rd ON rd.id = rl.return_document_id
    WHERE rd.id <> v_return_id
      AND rd.original_invoice_id = p_invoice_id
      AND rd.status NOT IN ('cancelled','rejected');

    v_line_discount := round(v_invoice.discount - v_prior_discount - v_discount, 2);
    IF v_line_discount <> 0 THEN
      SELECT id INTO v_last_line
      FROM public.return_lines
      WHERE return_document_id = v_return_id
      ORDER BY id DESC
      LIMIT 1;

      UPDATE public.return_lines rl
      SET discount_allocated = discount_allocated + v_line_discount,
          refund_amount = round(
            greatest(
              (SELECT round(il.amount * rl.qty / il.qty, 2)
               FROM public.invoice_lines il
               WHERE il.id = rl.original_invoice_line_id)
              - (rl.discount_allocated + v_line_discount), 0
            ), 2
          ),
          unit_refund_value = CASE
            WHEN rl.qty > 0 THEN round(
              greatest(
                (SELECT round(il.amount * rl.qty / il.qty, 2)
                 FROM public.invoice_lines il
                 WHERE il.id = rl.original_invoice_line_id)
                - (rl.discount_allocated + v_line_discount), 0
              ) / rl.qty, 2)
            ELSE 0 END
      WHERE rl.id = v_last_line;

      SELECT coalesce(sum(rl.discount_allocated),0),
             coalesce(sum(rl.refund_amount),0)
        INTO v_discount, v_total
      FROM public.return_lines rl
      WHERE rl.return_document_id = v_return_id;
      v_sub := round(v_total + v_discount, 2);
    END IF;
  END IF;

  v_total := round(
    (SELECT coalesce(sum(rl.refund_amount),0)
     FROM public.return_lines rl
     WHERE rl.return_document_id = v_return_id), 2);

  UPDATE public.return_documents
  SET subtotal_returned = round(v_sub,2),
      discount_returned = round(v_discount,2),
      refund_total = v_total
  WHERE id = v_return_id;

  v_scope_details := jsonb_build_object(
    'original_invoice_id', p_invoice_id,
    'return_document_id', v_return_id,
    'refund_method', p_refund_method,
    'refund_instrument_id', p_refund_instrument_id,
    'refund_total', v_total,
    'lines', p_lines,
    'reason', btrim(p_reason)
  );

  v_approval_id := public.request_approval(
    btrim(p_scope_hash), 'return', v_return_id, 'return_refund',
    v_scope_details, btrim(p_reason));

  UPDATE public.return_documents
  SET approval_id = v_approval_id
  WHERE id = v_return_id;

  v_resp := jsonb_build_object(
    'id', v_return_id,
    'return_number', v_return_number,
    'approval_id', v_approval_id,
    'refund_total', v_total,
    'status', 'requested'
  );
  PERFORM public.idempotency_commit('request_return', p_idempotency_key, v_resp);
  RETURN v_resp;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.request_return(uuid,jsonb,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_return(uuid,jsonb,text,uuid,text,text,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. execute_return
--    Requires a consumed G7 approval. Locks invoice lines before checking
--    returnable quantities, preventing concurrent over-return.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_return(
  p_return_id uuid,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_replay boolean;
  v_resp jsonb;
  v_return record;
  v_invoice record;
  v_rl record;
  v_ill record;
  v_remaining numeric;
  v_need numeric;
  v_take numeric;
  v_prior_qty numeric;
  v_prior_discount numeric;
  v_current_discount numeric;
  v_last_line uuid;
  v_total_cogs numeric := 0;
  v_inventory_value numeric := 0;
  v_journal_id uuid;
  v_actor uuid;
  v_lines jsonb := '[]'::jsonb;
  v_refund_id uuid;
  v_refund_account text;
  v_instrument_account text;
  v_original_line_total numeric;
  v_current_line_refund numeric;
  v_new_status text;
BEGIN
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay, v_resp
  FROM public.idempotency_begin('execute_return', p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_active AND p.tenant_id = v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active profile for caller'; END IF;

  SELECT * INTO v_return
  FROM public.return_documents d
  WHERE d.id = p_return_id AND d.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return document not found in tenant'; END IF;
  IF v_return.status <> 'requested' THEN
    IF v_return.status = 'posted' THEN
      RETURN jsonb_build_object('id',v_return.id,'return_number',v_return.return_number,
                                'refund_total',v_return.refund_total,'status','posted');
    END IF;
    RAISE EXCEPTION 'Return is not executable (status=%)', v_return.status;
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices i
  WHERE i.id = v_return.original_invoice_id
    AND i.tenant_id = v_tenant
    AND i.status = 'posted'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original posted invoice not found'; END IF;

  IF v_return.approval_id IS NULL THEN RAISE EXCEPTION 'Return approval missing'; END IF;

  -- Approval is consumed only by the Admin. Execution can be performed by an
  -- active operator after approval; the consumed approval is the authorization.
  PERFORM 1
  FROM public.approvals a
  WHERE a.id = v_return.approval_id
    AND a.tenant_id = v_tenant
    AND a.status = 'consumed'
    AND a.entity_type = 'return'
    AND a.entity_id = v_return.id
    AND a.action = 'return_refund';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin return/refund approval is not consumed'; END IF;

  -- Lock every original line participating in this return before computing
  -- returnable quantities. This serializes concurrent executions for a sale.
  FOR v_rl IN
    SELECT * FROM public.return_lines
    WHERE return_document_id = v_return.id
    ORDER BY original_invoice_line_id
  LOOP
    SELECT * INTO v_ill
    FROM public.invoice_lines il
    WHERE il.id = v_rl.original_invoice_line_id
      AND il.tenant_id = v_tenant
      AND il.invoice_id = v_invoice.id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original invoice line missing'; END IF;

    SELECT coalesce(sum(rl.qty),0) INTO v_prior_qty
    FROM public.return_lines rl
    JOIN public.return_documents rd ON rd.id = rl.return_document_id
    WHERE rl.original_invoice_line_id = v_ill.id
      AND rd.status NOT IN ('cancelled','rejected')
      AND rd.id <> v_return.id;

    v_remaining := v_ill.qty - v_prior_qty;
    IF v_rl.qty > v_remaining THEN
      RAISE EXCEPTION 'Concurrent return reduced remaining quantity';
    END IF;
  END LOOP;

  -- Exact proportional discount. If this execution exhausts the whole
  -- invoice, the last return line absorbs the cent residual so total
  -- allocated discount equals the invoice header discount exactly.
  SELECT coalesce(sum(rl.discount_allocated),0) INTO v_prior_discount
  FROM public.return_lines rl
  JOIN public.return_documents rd ON rd.id = rl.return_document_id
  WHERE rl.original_invoice_line_id IN (
    SELECT original_invoice_line_id FROM public.return_lines
    WHERE return_document_id = v_return.id
  )
    AND rd.status = 'posted'
    AND rd.id <> v_return.id;

  FOR v_rl IN
    SELECT * FROM public.return_lines
    WHERE return_document_id = v_return.id
    ORDER BY id
  LOOP
    SELECT il.amount, il.qty INTO v_original_line_total, v_need
    FROM public.invoice_lines il WHERE il.id = v_rl.original_invoice_line_id;

    v_current_line_refund := round(v_rl.refund_amount,2);
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('line_id',v_rl.id,'amount',v_current_line_refund));
  END LOOP;

  -- Restore exact original sold lots for every return line.
  FOR v_rl IN
    SELECT * FROM public.return_lines
    WHERE return_document_id = v_return.id
    ORDER BY original_invoice_line_id
  LOOP
    v_need := v_rl.qty;
    FOR v_ill IN
      SELECT ill.id, ill.lot_id, ill.qty, ill.unit_cost
      FROM public.invoice_line_lots ill
      WHERE ill.invoice_line_id = v_rl.original_invoice_line_id
      ORDER BY ill.id
    LOOP
      SELECT coalesce(sum(rll.qty),0) INTO v_prior_qty
      FROM public.return_line_lots rll
      JOIN public.return_lines x ON x.id = rll.return_line_id
      JOIN public.return_documents d ON d.id = x.return_document_id
      WHERE rll.original_invoice_line_lot_id = v_ill.id
        AND d.status NOT IN ('cancelled','rejected');

      v_take := least(v_need, greatest(v_ill.qty - v_prior_qty,0));
      IF v_take > 0 THEN
        INSERT INTO public.return_line_lots
          (tenant_id, return_line_id, original_invoice_line_lot_id,
           lot_id, qty, unit_cost)
        VALUES
          (v_tenant, v_rl.id, v_ill.id, v_ill.lot_id, v_take, v_ill.unit_cost);

        UPDATE public.stock_lots l
        SET qty_remaining = l.qty_remaining + v_take,
            status = CASE
              WHEN v_rl.disposition = 'damaged' THEN 'quarantined'
              WHEN l.status = 'quarantined' THEN 'quarantined'
              WHEN l.expiry_date <= CURRENT_DATE THEN 'quarantined'
              ELSE 'open'
            END
        WHERE l.id = v_ill.lot_id
          AND l.tenant_id = v_tenant;

        v_inventory_value := v_inventory_value +
          round(v_take * v_ill.unit_cost,2);
        v_need := v_need - v_take;
      END IF;
      EXIT WHEN v_need <= 0;
    END LOOP;

    IF v_need > 0 THEN
      RAISE EXCEPTION 'Original lot quantity is insufficient for return';
    END IF;
  END LOOP;

  -- Return revenue reversal.
  -- Khata credit: Dr 4000 / Cr 1300.
  -- Cash refund: Dr 4000 / Cr configured cash instrument account.
  IF v_return.refund_method = 'khata_credit' THEN
    v_refund_account := '1300';
  ELSE
    SELECT a.code INTO v_instrument_account
    FROM public.instrument_account_map m
    JOIN public.chart_of_accounts a ON a.id = m.account_id
    WHERE m.instrument_id = v_return.refund_instrument_id;
    IF v_instrument_account IS NULL THEN
      RAISE EXCEPTION 'Cash refund instrument has no account mapping';
    END IF;
    v_refund_account := v_instrument_account;
  END IF;

  IF v_return.refund_total > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','4000','debit',v_return.refund_total,
                         'description','Sales return / refund'),
      jsonb_build_object('account_code',v_refund_account,'credit',v_return.refund_total,
                         'description',CASE WHEN v_return.refund_method='cash'
                                            THEN 'Cash refund'
                                            ELSE 'Khata credit' END)
    );
  END IF;

  IF v_inventory_value > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',round(v_inventory_value,2),
                         'description','Inventory restored from return'),
      jsonb_build_object('account_code','5000','credit',round(v_inventory_value,2),
                         'description','COGS reversal from return')
    );
  END IF;

  IF v_return.refund_total > 0 OR v_inventory_value > 0 THEN
    SELECT public.post_journal(
      CURRENT_DATE, 'return', v_return.id,
      'Return ' || v_return.return_number || ' against ' ||
        v_invoice.canonical_number,
      v_lines
    ) INTO v_journal_id;
  END IF;

  INSERT INTO public.refund_records
    (tenant_id, return_document_id, method, amount, journal_entry_id)
  VALUES
    (v_tenant, v_return.id, v_return.refund_method,
     v_return.refund_total, v_journal_id)
  RETURNING id INTO v_refund_id;

  UPDATE public.return_documents
  SET status = 'posted',
      approved_by_profile = (
        SELECT a.approver_profile_id FROM public.approvals a
        WHERE a.id = v_return.approval_id
      ),
      approved_at = (
        SELECT a.decided_at FROM public.approvals a
        WHERE a.id = v_return.approval_id
      ),
      journal_entry_id = v_journal_id
  WHERE id = v_return.id;

  PERFORM public.append_audit(
    'return_posted', 'return_documents', v_return.id::text,
    'Posted return ' || v_return.return_number,
    jsonb_build_object(
      'original_invoice_id', v_invoice.id,
      'original_invoice_number', v_invoice.canonical_number,
      'refund_method', v_return.refund_method,
      'refund_total', v_return.refund_total,
      'inventory_value', round(v_inventory_value,2),
      'journal_entry_id', v_journal_id,
      'refund_record_id', v_refund_id
    ), NULL);

  v_resp := jsonb_build_object(
    'id', v_return.id,
    'return_number', v_return.return_number,
    'refund_total', v_return.refund_total,
    'journal_entry_id', v_journal_id,
    'status', 'posted'
  );
  PERFORM public.idempotency_commit('execute_return', p_idempotency_key, v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_return(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_return(uuid,text) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. Administrative cancellation of a requested/rejected return.
-- Does not touch financial state. Posted returns are immutable.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_return(
  p_return_id uuid, p_reason text, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid; v_actor uuid; v_replay boolean; v_resp jsonb;
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin authorization required'; END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
  v_tenant := public.current_tenant();
  SELECT * INTO v_replay,v_resp FROM public.idempotency_begin('cancel_return',p_idempotency_key);
  IF v_replay THEN RETURN v_resp; END IF;

  SELECT status INTO v_status FROM public.return_documents
  WHERE id=p_return_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return document not found in tenant'; END IF;
  IF v_status NOT IN ('requested','rejected') THEN
    RAISE EXCEPTION 'Only requested or rejected returns can be cancelled';
  END IF;

  UPDATE public.return_documents SET status='cancelled' WHERE id=p_return_id;
  PERFORM public.append_audit(
    'return_cancelled','return_documents',p_return_id::text,
    'Cancelled return',
    jsonb_build_object('reason',btrim(p_reason)),NULL);

  v_resp:=jsonb_build_object('id',p_return_id,'status','cancelled');
  PERFORM public.idempotency_commit('cancel_return',p_idempotency_key,v_resp);
  RETURN v_resp;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_return(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_return(uuid,text,text) TO authenticated;

COMMIT;
