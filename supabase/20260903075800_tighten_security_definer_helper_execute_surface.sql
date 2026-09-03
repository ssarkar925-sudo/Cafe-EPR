-- Reduce the exposed SECURITY DEFINER surface by removing direct RPC execution
-- from authenticated clients for functions that are internal helpers, trigger
-- handlers, accounting bridges, synchronization/normalization routines, or
-- internal validators. SECURITY DEFINER remains in place for trusted server-side
-- calls and nested function execution.
revoke execute on function public.create_recharge_internal(uuid,date,timestamp with time zone,uuid,text,text,text,text,numeric,text,uuid,text) from authenticated;
revoke execute on function public.create_sale_internal(uuid,date,numeric,numeric,numeric,jsonb,jsonb,numeric,text,uuid,numeric,text,text,text,text,numeric,numeric,numeric,numeric,boolean) from authenticated;
revoke execute on function public.edit_invoice_internal(uuid,uuid,date,numeric,numeric,numeric,jsonb,jsonb,text) from authenticated;
revoke execute on function public.get_pnl_internal(date,date) from authenticated;
revoke execute on function public.get_pool_balances_internal(date) from authenticated;
revoke execute on function public.get_portal_balance_internal(uuid,date) from authenticated;
revoke execute on function public.get_settlement_summary_internal() from authenticated;
revoke execute on function public.record_invoice_payment_internal(uuid,text,numeric,uuid) from authenticated;
revoke execute on function public.record_quick_sale_internal(date,numeric,numeric,uuid,uuid,uuid,text,numeric,jsonb,jsonb) from authenticated;
revoke execute on function public.apply_previous_due_collection(uuid,numeric,text,uuid,uuid,text,date,numeric) from authenticated;
revoke execute on function public.lock_financial_instrument(uuid) from authenticated;
revoke execute on function public.lock_financial_pool(text) from authenticated;
revoke execute on function public.trg_post_cash_entry_journal() from authenticated;
revoke execute on function public.trg_post_settlement_journal() from authenticated;
revoke execute on function public.trg_post_stock_journal() from authenticated;
revoke execute on function public.trg_refresh_payment_instrument_balance_cache() from authenticated;
revoke execute on function public.trg_refresh_payment_instrument_balance_on_master_change() from authenticated;
revoke execute on function public.post_expense_accounting_bridge() from authenticated;
revoke execute on function public.post_invoice_accounting_bridge() from authenticated;
revoke execute on function public.post_purchase_accounting_bridge() from authenticated;
revoke execute on function public.post_quick_sale_accounting_bridge() from authenticated;
revoke execute on function public.post_service_transaction_accounting_bridge() from authenticated;
revoke execute on function public.sync_service_transaction_money_legs() from authenticated;
revoke execute on function public.sync_settlement_instrument_movements() from authenticated;
revoke execute on function public.normalize_transaction_fee_source() from authenticated;
revoke execute on function public.dedupe_transaction_money_entry() from authenticated;
revoke execute on function public.enforce_transaction_money_instrument() from authenticated;
revoke execute on function public.resolve_transaction_payment_instruments() from authenticated;
revoke execute on function public.refresh_payment_instrument_balance_cache(uuid) from authenticated;
revoke execute on function public.assert_product_stock_consistency(uuid) from authenticated;
revoke execute on function public.validate_accounting_integrity() from authenticated;
revoke execute on function public.validate_financial_account_linkage() from authenticated;
revoke execute on function public.validate_money_trail_integrity() from authenticated;
revoke execute on function public.validate_no_active_debit_card_accounts() from authenticated;
revoke execute on function public.validate_payment_account_model() from authenticated;
revoke execute on function public.validate_product_invoice_integrity() from authenticated;
revoke execute on function public.validate_quick_sale_inventory_integrity() from authenticated;
revoke execute on function public.validate_service_payment_instrument() from authenticated;
revoke execute on function public.validate_settlement_integrity() from authenticated;
revoke execute on function public.validate_single_journal_owner() from authenticated;
revoke execute on function public.validate_transaction_money_source() from authenticated;
revoke execute on function public.resolve_payment_instrument(text,uuid) from authenticated;
revoke execute on function public.reconcile_purchase_supplier_stock(uuid) from authenticated;
revoke execute on function public.post_journal_entry(date,text,uuid,text,jsonb,uuid) from authenticated;
revoke execute on function public.assign_journal_entry_number() from authenticated;