-- ==============================================================================
-- UPDATE create_sale RPC TO PERSIST TAX SNAPSHOT AT TIME OF SALE
-- ==============================================================================

create or replace function public.create_sale(
  p_customer_id uuid,
  p_invoice_date date,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_payments jsonb,
  p_items jsonb,
  p_previous_due numeric default 0,
  p_previous_due_method text default 'cash',
  p_previous_due_instrument_id uuid default null,
  p_advance_used numeric default 0,
  p_place_of_supply text default null,
  p_supply_type text default 'intra_state',
  p_customer_gstin text default null,
  p_b2b_or_b2c text default 'B2C_SMALL',
  p_total_taxable_value numeric default null,
  p_total_cgst numeric default 0,
  p_total_sgst numeric default 0,
  p_total_igst numeric default 0,
  p_is_reverse_charge boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_item jsonb;
  v_payment jsonb;
  v_paid numeric := 0;
  v_due numeric := 0;
  v_cust_balance numeric;
  v_method text;
  v_instrument_id uuid;
  v_taxable numeric;
begin
  if auth.uid() is null and auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Not authenticated';
  end if;

  v_invoice_number := public.generate_invoice_number();

  -- If total_taxable_value was not passed explicitly, default to subtotal - discount
  v_taxable := coalesce(p_total_taxable_value, p_total - coalesce(p_total_cgst, 0) - coalesce(p_total_sgst, 0) - coalesce(p_total_igst, 0));

  insert into public.invoices (
    invoice_number, customer_id, invoice_date, subtotal, discount, total, status,
    place_of_supply, supply_type, customer_gstin, b2b_or_b2c,
    total_taxable_value, total_cgst, total_sgst, total_igst, is_reverse_charge
  ) values (
    v_invoice_number, p_customer_id, p_invoice_date, p_subtotal, p_discount, p_total, 'unpaid',
    p_place_of_supply, coalesce(p_supply_type, 'intra_state'), p_customer_gstin, coalesce(p_b2b_or_b2c, 'B2C_SMALL'),
    v_taxable, coalesce(p_total_cgst, 0), coalesce(p_total_sgst, 0), coalesce(p_total_igst, 0), coalesce(p_is_reverse_charge, false)
  ) returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.invoice_items (
      invoice_id, product_id, service_id, description, qty, rate, amount, cost_price,
      hsn_sac, taxable_value, gst_rate, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, tax_treatment
    ) values (
      v_invoice_id,
      nullif(v_item->>'product_id', NULL::text)::uuid,
      nullif(v_item->>'service_id', NULL::text)::uuid,
      v_item->>'description',
      coalesce((v_item->>'qty')::numeric, 1),
      coalesce((v_item->>'rate')::numeric, 0),
      coalesce((v_item->>'amount')::numeric, 0),
      coalesce((v_item->>'cost_price')::numeric, 0),
      v_item->>'hsn_sac',
      coalesce((v_item->>'taxable_value')::numeric, coalesce((v_item->>'amount')::numeric, 0)),
      coalesce((v_item->>'gst_rate')::numeric, 0),
      coalesce((v_item->>'cgst_rate')::numeric, 0),
      coalesce((v_item->>'cgst_amount')::numeric, 0),
      coalesce((v_item->>'sgst_rate')::numeric, 0),
      coalesce((v_item->>'sgst_amount')::numeric, 0),
      coalesce((v_item->>'igst_rate')::numeric, 0),
      coalesce((v_item->>'igst_amount')::numeric, 0),
      coalesce(v_item->>'tax_treatment', 'non_gst')
    );

    if (v_item->>'product_id') is not null then
      update public.products
      set stock_qty = stock_qty - coalesce((v_item->>'qty')::numeric, 1),
          updated_at = now()
      where id = (v_item->>'product_id')::uuid;
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_paid := v_paid + coalesce((v_payment->>'amount')::numeric, 0);
    v_method := coalesce(v_payment->>'method', 'cash');
    v_instrument_id := nullif(v_payment->>'instrument_id', NULL::text)::uuid;

    if v_instrument_id is not null then
      select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
      if v_method is null then
        raise exception 'Unknown payment instrument';
      end if;
    end if;

    insert into public.payments (invoice_id, method, amount, instrument_id)
    values (v_invoice_id, v_method, coalesce((v_payment->>'amount')::numeric, 0), v_instrument_id);

    insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
    values (p_invoice_date, v_method, 'in', coalesce((v_payment->>'amount')::numeric, 0), 'Sale ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
  end loop;

  if v_paid + p_advance_used > p_total then
    raise exception 'Paid amount exceeds total';
  end if;

  v_due := p_total - v_paid - p_advance_used;

  update public.invoices
  set paid = v_paid + p_advance_used,
      due = v_due,
      status = case when v_due = 0 then 'paid' else 'partial' end
  where id = v_invoice_id;

  if p_customer_id is not null then
    select balance into v_cust_balance from public.customers where id = p_customer_id for update;
    if v_cust_balance is null then
      raise exception 'Customer not found';
    end if;

    if p_previous_due > 0 then
      if v_cust_balance < p_previous_due then
        raise exception 'Customer due is only %, cannot collect %', v_cust_balance, p_previous_due;
      end if;
      v_cust_balance := v_cust_balance - p_previous_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, credit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'payment', 'Previous due collected with ' || v_invoice_number, p_previous_due, v_cust_balance, v_invoice_id);

      v_method := p_previous_due_method;
      v_instrument_id := nullif(p_previous_due_instrument_id, NULL::uuid);
      if v_instrument_id is not null then
        select type into v_method from public.payment_instruments where id = v_instrument_id and is_active = true;
        if v_method is null then
          raise exception 'Unknown payment instrument';
        end if;
      end if;
      insert into public.cash_entries (entry_date, method, direction, amount, description, ref_type, ref_id, instrument_id)
      values (p_invoice_date, v_method, 'in', p_previous_due, 'Previous due ' || v_invoice_number, 'invoice', v_invoice_id, v_instrument_id);
    end if;

    if p_advance_used > 0 then
      if v_cust_balance > -p_advance_used then
        raise exception 'Customer advance is only %, cannot apply %', abs(v_cust_balance), p_advance_used;
      end if;
      v_cust_balance := v_cust_balance + p_advance_used;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'advance', 'Advance applied to ' || v_invoice_number, p_advance_used, v_cust_balance, v_invoice_id);
    end if;

    if v_due > 0 then
      v_cust_balance := v_cust_balance + v_due;
      update public.customers set balance = v_cust_balance, updated_at = now() where id = p_customer_id;
      insert into public.customer_ledger (customer_id, entry_date, type, description, debit, balance_after, ref_id)
      values (p_customer_id, p_invoice_date, 'invoice', 'Invoice ' || v_invoice_number, v_due, v_cust_balance, v_invoice_id);
    end if;
  end if;

  return (
    select jsonb_build_object(
      'id', id,
      'invoice_number', invoice_number,
      'customer_id', customer_id,
      'total', total,
      'paid', paid,
      'due', due,
      'status', status,
      'invoice_date', invoice_date,
      'created_at', created_at,
      'previous_due', p_previous_due,
      'advance_used', p_advance_used,
      'total_taxable_value', total_taxable_value,
      'total_cgst', total_cgst,
      'total_sgst', total_sgst,
      'total_igst', total_igst,
      'place_of_supply', place_of_supply,
      'supply_type', supply_type,
      'b2b_or_b2c', b2b_or_b2c
    )
    from public.invoices
    where id = v_invoice_id
  );
end;
$$;

