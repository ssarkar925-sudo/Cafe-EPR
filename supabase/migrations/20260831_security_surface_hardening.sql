-- Harden only functions that are internal/admin infrastructure or diagnostic helpers.
-- Business mutation RPCs intentionally remain callable by authenticated users because
-- the application relies on them for transactional authorization and atomic workflows.

-- These helpers must never be directly callable through /rest/v1/rpc by clients.
revoke execute on function public.post_journal_entry(date,text,uuid,text,jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.run_canonical_self_audit(text) from public, anon, authenticated;
revoke execute on function public.check_posted_invoice_item_tax_immutability() from public, anon, authenticated;
revoke execute on function public.check_posted_invoice_tax_immutability() from public, anon, authenticated;
revoke execute on function public.assert_product_stock_consistency(uuid) from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_back_office() from public, anon, authenticated;

-- Keep SECURITY DEFINER search paths deterministic.
alter function public.post_journal_entry(date,text,uuid,text,jsonb,uuid) set search_path=public;
alter function public.run_canonical_self_audit(text) set search_path=public;
alter function public.check_posted_invoice_item_tax_immutability() set search_path=public;
alter function public.check_posted_invoice_tax_immutability() set search_path=public;
alter function public.assert_product_stock_consistency(uuid) set search_path=public;
alter function public.is_admin() set search_path=public;
alter function public.is_back_office() set search_path=public;
