begin;
do $$declare r record; begin
  for r in select p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname in (
      'accounting_instrument_account_code','apply_previous_due_collection','assign_journal_entry_number',
      'assert_product_stock_consistency','create_recharge_internal','create_sale_internal','edit_invoice_internal',
      'finalize_purchase_accounting','finance_integrity_snapshot','get_pool_balances_internal','get_portal_balance_internal',
      'get_settlement_summary_internal','get_pnl_internal','get_ai_current_month_pnl','repair_journal_source_link',
      'record_invoice_payment_internal','record_quick_sale_internal','resolve_payment_instrument','run_canonical_self_audit',
      'validate_financial_account_linkage','validate_payment_account_model','validate_accounting_integrity'
    ) loop
    execute format('revoke execute on function public.%I(%s) from public,anon,authenticated',r.proname,r.args);
  end loop;
end$$;
commit;
