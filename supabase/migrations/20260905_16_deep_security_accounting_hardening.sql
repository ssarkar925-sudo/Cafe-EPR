begin;

create or replace function public.enforce_cash_entry_immutability()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('erp.internal_cash_mutation_authorized', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'Cash entries are immutable; use a reversal/correction workflow';
end;
$$;
drop trigger if exists trg_cash_entry_immutability on public.cash_entries;
create trigger trg_cash_entry_immutability before update or delete on public.cash_entries
for each row execute function public.enforce_cash_entry_immutability();

drop policy if exists cash_entries_update on public.cash_entries;
drop policy if exists cash_entries_delete on public.cash_entries;
drop policy if exists cash_entries_insert on public.cash_entries;
create policy cash_entries_select_backoffice on public.cash_entries for select to authenticated using (public.is_back_office() or public.is_admin());
create policy cash_entries_insert_backoffice on public.cash_entries for insert to authenticated with check (public.is_back_office() or public.is_admin());

do $$declare r record; begin
  for r in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('products','services','categories','brands','units') loop
    execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
  end loop;
end$$;
do $$declare t text; begin
  foreach t in array array['products','services','categories','brands','units'] loop
    execute format('create policy %I_select_authenticated on public.%I for select to authenticated using (true)',t,t);
    execute format('create policy %I_write_backoffice on public.%I for all to authenticated using (public.is_back_office() or public.is_admin()) with check (public.is_back_office() or public.is_admin())',t,t);
  end loop;
end$$;

do $$declare r record; begin
  for r in select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname in (
      'post_purchase_accounting_for_id','post_sales_return_tax_reversal','post_journal_entry','post_invoice_accounting_bridge',
      'post_purchase_accounting_bridge','post_service_transaction_accounting_bridge','post_quick_sale_accounting_bridge',
      'post_expense_accounting_bridge','post_stock_journal','trg_post_cash_entry_journal','trg_finalize_purchase_accounting_from_cash',
      'trg_post_sales_return_tax_reversal','trg_post_settlement_journal','trg_post_stock_journal','trg_refresh_payment_instrument_balance_cache',
      'trg_refresh_payment_instrument_balance_on_master_change','sync_aeps_payment_instrument_to_portal','sync_aeps_portal_to_payment_instrument',
      'sync_dmt_payment_instrument_to_portal','sync_dmt_portal_to_payment_instrument','sync_service_transaction_money_legs',
      'sync_settlement_instrument_movements','sync_upi_merchant_qr_to_payment_instrument','sync_upi_payment_instrument_to_qr',
      'enforce_ai_action_approval_lifecycle','enforce_ai_workflow_version_lifecycle','enforce_settlement_cash_entry_ownership',
      'enforce_transaction_money_instrument','dedupe_transaction_money_entry','normalize_transaction_fee_source',
      'resolve_transaction_payment_instruments','validate_money_trail_integrity','validate_transaction_money_source','validate_single_journal_owner',
      'validate_product_invoice_integrity','validate_quick_sale_inventory_integrity','validate_service_payment_instrument','validate_service_portal_link',
      'validate_settlement_integrity','validate_settlement_operational_links','validate_financial_account_linkage','validate_payment_account_model',
      'validate_accounting_integrity','validate_no_active_debit_card_accounts','refresh_payment_instrument_balance_cache','lock_financial_pool',
      'lock_financial_instrument','assert_product_stock_consistency','prevent_linked_aeps_portal_delete','prevent_portal_service_type_change',
      'check_posted_invoice_tax_immutability','check_posted_invoice_item_tax_immutability','assign_journal_entry_number','handle_new_user'
    ) loop
    execute format('revoke execute on function public.%I(%s) from public,anon,authenticated',r.proname,r.args);
  end loop;
end$$;

do $$declare v_oid oid; v_def text; begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_gst_pnl_journal_reconciliation' and pg_get_function_identity_arguments(p.oid)='p_from date, p_to date';
  if v_oid is not null then
    v_def:=pg_get_functiondef(v_oid);
    v_def:=replace(v_def,'coalesce(sum(i.total),0)','coalesce(sum(coalesce(i.total_taxable_value, i.total - coalesce(i.total_cgst,0) - coalesce(i.total_sgst,0) - coalesce(i.total_igst,0))),0)');
    execute v_def;
  end if;
end$$;

commit;
