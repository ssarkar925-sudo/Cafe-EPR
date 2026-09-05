export type WhatsAppProvider = "meta" | "local_gateway" | "ultramsg" | "off";

export type WhatsAppAutomationRules = {
  auto_send_pos: boolean;
  auto_send_quick: boolean;
  auto_send_payment: boolean;
  auto_send_due_reminder: boolean;
  auto_send_document_ready: boolean;
  auto_send_aeps: boolean;
  auto_send_dmt: boolean;
  auto_send_recharge: boolean;
  auto_send_daily_summary: boolean;
  auto_send_financial_alerts: boolean;
};

export type WhatsAppTemplates = {
  pos_invoice: string;
  quick_sale: string;
  payment_receipt: string;
  due_reminder: string;
  doc_ready: string;
  aeps_confirmation: string;
  dmt_confirmation: string;
  recharge_confirmation: string;
  daily_summary: string;
  financial_alert: string;
  day_close: string;
  banking_txn?: string;
};

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  automations: WhatsAppAutomationRules;
  auto_send_pos?: boolean;
  auto_send_business?: boolean;
  gateway_url?: string;
  gateway_api_key?: string;
  meta_phone_number_id?: string;
  meta_waba_id?: string;
  meta_app_id?: string;
  meta_display_phone_number?: string;
  meta_access_token?: string;
  ultramsg_instance_id?: string;
  ultramsg_token?: string;
  templates?: WhatsAppTemplates;
  fallback_provider?: WhatsAppProvider;
  enable_fallback?: boolean;
};

export type OutboxStatus = "PENDING" | "PROCESSING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED";
export type WhatsAppOutboxMessage = { id: string; customer_id?: string | null; phone: string; recipient_name?: string | null; message_type: "pos_invoice" | "quick_sale" | "payment_receipt" | "due_reminder" | "doc_ready" | "aeps_confirmation" | "dmt_confirmation" | "recharge_confirmation" | "daily_summary" | "financial_alert" | "day_close" | "banking_txn" | "custom" | "test"; template_id?: string | null; message_body: string; reference_type?: "invoice" | "quick_sale" | "payment" | "due" | "document" | "transaction" | "day_close" | "self_audit" | "manual"; reference_id?: string | null; idempotency_key: string; status: OutboxStatus; attempt_count: number; next_attempt_at: string; provider: WhatsAppProvider; provider_message_id?: string | null; error_message?: string | null; created_at: string; sent_at?: string | null; delivered_at?: string | null; read_at?: string | null };

export const GATEWAY_PRESETS = [
  { id: "local" as const, label: "Local PC Gateway", url: "http://localhost:3001", desc: "Running on this PC via PM2/Node (Fast, 100% Free)", icon: "💻", badge: "Local PC" },
  { id: "render" as const, label: "Render Cloud Gateway", url: "https://sccomm-whatsapp-gateway.onrender.com", desc: "24/7 Cloud Service (Works even when PC is off)", icon: "☁️", badge: "Cloud 24/7" },
] as const;

export const DEFAULT_AUTOMATIONS: WhatsAppAutomationRules = {
  auto_send_pos: false,
  auto_send_quick: false,
  auto_send_payment: false,
  auto_send_due_reminder: false,
  auto_send_document_ready: false,
  auto_send_aeps: false,
  auto_send_dmt: false,
  auto_send_recharge: false,
  auto_send_daily_summary: false,
  auto_send_financial_alerts: false,
};

export const DEFAULT_WA_TEMPLATES: WhatsAppTemplates = {
  pos_invoice: `🧾 *TAX INVOICE: {invoice_number}*\n📅 Date: {invoice_date}\n{customer_name_line}───────────────\n💰 Total Bill: {total_amount}\n💳 Amount Paid: {paid_amount}\n{status_line}\n───────────────\n📄 View / Download A4 Invoice (PDF):\n{receipt_url}\n\nThank you for choosing {shop_name}!`,
  quick_sale: `🧾 *QUICK SALE RECEIPT: {sale_number}*\n📅 Date: {sale_date}\n{customer_name_line}───────────────\n📦 Item: {item_name}\n💰 Amount Paid: {paid_amount}\n───────────────\n📄 View / Download Receipt:\n{receipt_url}\n\nThank you for your business!`,
  payment_receipt: `💳 *PAYMENT CONFIRMATION - {shop_name}*\n\nDear {customer_name},\nWe have received your payment of *{paid_amount}* towards Invoice *#{invoice_number}*.\n\n📅 Date: {date}\n💰 Remaining Balance Due: {due_amount}\n───────────────\n📄 View Updated Invoice:\n{receipt_url}\n\nThank you for your timely payment!`,
  due_reminder: `⚠️ *PAYMENT REMINDER - {shop_name}*\n\nDear {customer_name},\nThis is a friendly reminder that you have an outstanding balance of *{due_amount}* on Invoice *#{invoice_number}* (Dated: {invoice_date}).\n\n📄 View Invoice Details & Scan to Pay:\n{receipt_url}\n\nPlease settle at your earliest convenience. Thank you!`,
  doc_ready: `📂 *DOCUMENT READY FOR PICKUP - {shop_name}*\n\nDear {customer_name},\nYour requested document / service *{document_name}* is completed and ready for pickup.\n\n📅 Completion Date: {date}\n🏷️ Reference: {ref_number}\n───────────────\nPlease visit the store during business hours. Thank you!`,
  aeps_confirmation: `🏧 *AEPS CASH WITHDRAWAL RECEIPT*\n🔢 Txn RRN: {ref_number}\n📅 Date: {date}\n{customer_name_line}───────────────\n💰 Withdrawal Amount: {amount}\n🏷️ Service Fee: {service_fee}\n✅ Status: SUCCESS\n───────────────\n📄 View Official Digital Receipt:\n{receipt_url}\n\nThank you for banking with {shop_name}!`,
  dmt_confirmation: `💸 *MONEY TRANSFER CONFIRMATION*\n🔢 Txn RRN: {ref_number}\n📅 Date: {date}\n{customer_name_line}───────────────\n💰 Remittance Amount: {amount}\n🏷️ Transfer Fee: {service_fee}\n✅ Status: TRANSFERRED\n───────────────\n📄 View Official Remittance Receipt:\n{receipt_url}\n\nThank you for using {shop_name}!`,
  recharge_confirmation: `📱 *RECHARGE SUCCESSFUL*\n🔢 Txn No: {txn_number}\n📅 Date: {date}\n───────────────\n📱 Mobile / Service: {phone}\n💰 Plan Amount: {amount}\n✅ Status: SUCCESS\n───────────────\nThank you for choosing {shop_name}!`,
  banking_txn: `📱 *{service_name} RECEIPT*\n🔢 Txn No: {txn_number}\n📅 Date: {txn_date}\n{customer_name_line}───────────────\n💰 Amount: {amount}\n🏷️ Ref / RRN: {ref_number}\n✅ Status: {status}\n───────────────\n📄 View / Download Receipt (PDF):\n{receipt_url}\n\nThank you for choosing {shop_name}!`,
  daily_summary: `📊 *DAILY EXECUTIVE SUMMARY - {shop_name}*\n📅 Date: {date}\n───────────────\n💰 Operating Revenue: {total_revenue}\n📉 Recorded Expenses: {total_expenses}\n📈 Business Profit Before Tax: {net_profit}\n\n🏦 Physical Cash Drawer: {cash_balance}\n🏛️ Bank Accounts: {bank_balance}\n📱 Digital Float: {float_balance}\n\n🛡️ Financial Integrity: {audit_score}/100 {audit_status}\n🔒 Day Close: {day_close_status}\n───────────────\nAuthoritative Canonical ERP System`,
  financial_alert: `🚨 *FINANCIAL INTEGRITY ALARM - {shop_name}*\n⚠️ Priority: {severity}\n\n{alert_reason}\n\n📅 Timestamp: {date}\n🛡️ Audit Run Score: {audit_score}/100\n───────────────\nPlease open /ai/self-audit immediately to review and resolve this invariant finding.`,
  day_close: `📊 *DAILY STORE HANDOVER CERTIFICATE*\n\n🏪 Store: {shop_name}\n📅 Date: {close_date}\n🔢 Shift Closing: #{closing_number}\n───────────────\n💰 Net Shift Profit: {net_profit}\n💼 Total Liquid Position: {liquid_position}\n───────────────\n📄 View Handover Audit Certificate:\n{receipt_url}`,
};

export const DEFAULT_WA_CONFIG: WhatsAppConfig = {
  provider: "off",
  automations: DEFAULT_AUTOMATIONS,
  auto_send_pos: false,
  auto_send_business: false,
  gateway_url: "http://localhost:3001",
  gateway_api_key: "",
  templates: DEFAULT_WA_TEMPLATES,
};

export const SQL_TEMPLATES_MIGRATION = `-- WhatsApp Templates Migration
create table if not exists public.whatsapp_templates (
  id text primary key default 'default',
  templates jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_templates enable row level security;
create policy "whatsapp_templates select" on public.whatsapp_templates for select to authenticated using (public.is_back_office());
create policy "whatsapp_templates insert" on public.whatsapp_templates for insert to authenticated with check (public.is_back_office());
create policy "whatsapp_templates update" on public.whatsapp_templates for update to authenticated using (public.is_back_office()) with check (public.is_back_office());
`;

export function formatWhatsAppPhone(rawPhone: string): string { let digits = String(rawPhone || "").replace(/\D/g, ""); if (digits.startsWith("00")) digits = digits.slice(2); if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1); if (digits.length === 10) return `91${digits}`; return digits; }
export function getDirectWhatsAppUrl(phone: string, text: string): string { const clean = formatWhatsAppPhone(phone); return clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`; }
export function renderWhatsAppTemplate(templateText?: string | null, vars: Record<string, string | number | null | undefined> = {}): string { let rendered = templateText || ""; for (const [key, value] of Object.entries(vars)) { const valStr = String(value ?? ""); rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), valStr).replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), valStr); } return rendered.trim(); }
