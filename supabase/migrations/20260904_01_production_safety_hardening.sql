-- Production safety hardening: eliminate fabricated defaults and make transaction status consistent.
ALTER TABLE public.transactions ALTER COLUMN status SET DEFAULT 'pending';

-- Do not enable customer-facing WhatsApp automation implicitly on a fresh install.
ALTER TABLE public.settings ALTER COLUMN whatsapp_automations SET DEFAULT jsonb_build_object(
  'auto_send_dmt', false,
  'auto_send_pos', false,
  'auto_send_aeps', false,
  'auto_send_quick', false,
  'auto_send_payment', false,
  'auto_send_recharge', false,
  'auto_send_due_reminder', false,
  'auto_send_daily_summary', false,
  'auto_send_document_ready', false,
  'auto_send_financial_alerts', false
);

-- Keep the server-side secret store explicitly non-public.
REVOKE ALL ON TABLE public.whatsapp_gateway_secrets FROM anon;
REVOKE ALL ON TABLE public.whatsapp_gateway_secrets FROM authenticated;

-- Prevent invalid transaction status values at the database boundary.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK (status = ANY (ARRAY['success','pending','failed','reversed','deleted']));
