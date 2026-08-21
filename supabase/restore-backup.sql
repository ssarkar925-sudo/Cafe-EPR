-- Run this in the Supabase SQL editor of project tvxehxnvuwojjbhysajp (idempotent).
-- Adds restore_backup(p_payload jsonb), used by Settings -> Backup & Data -> Restore.
-- The whole restore runs in ONE transaction: if any table fails to import, nothing
-- is changed (the wipe rolls back too).

-- Admin helper (idempotent; keeps this file self-contained).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

-- Restore a full backup exported from Settings -> Backup & Data.
-- Replaces all business data with the backup contents. Keeps staff accounts,
-- avatars/logos, login tracking, and the audit trail (the restore itself is logged).
create or replace function public.restore_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tables jsonb;
  v_table text;
  v_rows jsonb;
  v_allowed text[];
  v_use text[];
  v_col text;
  v_cols_sql text;
  v_cols_typed text;
  v_count int := 0;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if p_payload is null or jsonb_typeof(p_payload->'tables') <> 'object' then
    raise exception 'Invalid backup file: missing "tables" object';
  end if;
  v_tables := p_payload->'tables';

  -- 1) Clear existing business data (keeps profiles, auth, avatars, logos, audit trail).
  truncate table
    public.settings, public.payment_methods,
    public.categories, public.brands, public.units, public.products, public.services,
    public.customers,
    public.invoices, public.invoice_items, public.payments,
    public.quick_sales, public.quick_sale_items,
    public.returns, public.return_items,
    public.transactions, public.cash_entries, public.expenses, public.settlements,
    public.payment_instruments, public.customer_ledger,
    public.opening_balances, public.closings, public.closing_balances,
    public.aeps_banks, public.aeps_portals, public.upi_merchant_qrs
  restart identity;

  -- 2) Insert each allowlisted table present in the payload, in FK-safe order.
  --    Columns come from the payload but are filtered to columns that actually
  --    exist in the table (and are identifier-quoted), so bad payloads can't
  --    inject anything. All values go through jsonb_to_recordset as text and the
  --    database casts them to the real column types.
  for v_table in select unnest(array[
    'settings', 'payment_methods',
    'categories', 'brands', 'units', 'products', 'services',
    'customers',
    'invoices', 'invoice_items', 'payments',
    'quick_sales', 'quick_sale_items',
    'returns', 'return_items',
    'transactions', 'cash_entries', 'expenses', 'settlements',
    'payment_instruments', 'customer_ledger',
    'opening_balances', 'closings', 'closing_balances',
    'aeps_banks', 'aeps_portals', 'upi_merchant_qrs'
  ])
  loop
    v_rows := v_tables->v_table;
    if v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0 then
      continue;
    end if;
    if jsonb_typeof(v_rows->0) <> 'object' then
      raise exception 'Invalid rows for table %', v_table;
    end if;

    select coalesce(array_agg(column_name order by ordinal_position), '{}'::text[])
      into v_allowed
      from information_schema.columns
      where table_schema = 'public' and table_name = v_table;

    v_use := '{}';
    for v_col in select jsonb_object_keys(v_rows->0)
    loop
      if v_col = any(v_allowed) then
        v_use := array_append(v_use, v_col);
      end if;
    end loop;

    if cardinality(v_use) = 0 then continue; end if;

    select string_agg(quote_ident(c), ',') into v_cols_sql from unnest(v_use) c;
    select string_agg(quote_ident(c) || ' text', ',') into v_cols_typed from unnest(v_use) c;

    execute format(
      'insert into public.%I (%s) select %s from jsonb_to_recordset($1::jsonb) as x(%s)',
      v_table, v_cols_sql, v_cols_sql, v_cols_typed
    ) using v_rows;

    v_count := v_count + 1;
  end loop;

  -- 3) Always leave a settings row and the standard payment methods in place.
  insert into public.settings (id, shop_name) values (1, 'SCC OMM Cafe')
  on conflict (id) do nothing;
  insert into public.payment_methods (method, label, sort_order)
  values
    ('cash', 'Cash', 1),
    ('card', 'Card', 2),
    ('bank', 'Bank', 3),
    ('upi', 'UPI', 4),
    ('wallet', 'Wallet', 5),
    ('debit_card', 'Debit Card', 6),
    ('credit_card', 'Credit Card', 7)
  on conflict (method) do update set label = excluded.label, sort_order = excluded.sort_order;

  -- 4) Advance numbering sequences past the restored rows so new records never collide.
  perform setval('public.invoice_number_seq',
    coalesce((select max((regexp_replace(invoice_number, '[^0-9]', '', 'g'))::bigint)
      from public.invoices where invoice_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.quick_sale_number_seq',
    coalesce((select max((regexp_replace(quick_sale_number, '[^0-9]', '', 'g'))::bigint)
      from public.quick_sales where quick_sale_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.return_number_seq',
    coalesce((select max((regexp_replace(return_number, '[^0-9]', '', 'g'))::bigint)
      from public.returns where return_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.closing_seq',
    coalesce((select max((regexp_replace(closing_number, '[^0-9]', '', 'g'))::bigint)
      from public.closings where closing_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.settlement_seq',
    coalesce((select max((regexp_replace(settlement_number, '[^0-9]', '', 'g'))::bigint)
      from public.settlements where settlement_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.aeps_seq',
    coalesce((select max((regexp_replace(transaction_number, '[^0-9]', '', 'g'))::bigint)
      from public.transactions where service_type = 'aeps' and transaction_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.dmt_seq',
    coalesce((select max((regexp_replace(transaction_number, '[^0-9]', '', 'g'))::bigint)
      from public.transactions where service_type = 'dmt' and transaction_number ~ '[0-9]'), 0) + 1, false);
  perform setval('public.upi_seq',
    coalesce((select max((regexp_replace(transaction_number, '[^0-9]', '', 'g'))::bigint)
      from public.transactions where service_type = 'upi' and transaction_number ~ '[0-9]'), 0) + 1, false);

  -- 5) Audit the restore.
  insert into public.audit_logs (user_id, user_name, action, entity, entity_id, description, details)
  values (
    auth.uid(), null, 'backup_restored', 'app', null,
    'Restored backup via Settings -> Backup & Data',
    jsonb_build_object('tables_restored', v_count)
  );

  return jsonb_build_object('ok', true, 'tables_restored', v_count);
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
