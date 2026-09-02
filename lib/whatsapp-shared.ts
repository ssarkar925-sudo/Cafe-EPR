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
  banking_txn?: string; // Backward compatibility
};

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  automations: WhatsAppAutomationRules;
  auto_send_pos?: boolean; // Backward compatibility
  auto_send_business?: boolean; // Backward compatibility
  gateway_url?: string;
  gateway_api_key?: string;
  meta_phone_number_id?: string;
  meta_access_token?: string;
  ultramsg_instance_id?: string;
  ultramsg_token?: string;
  templates?: WhatsAppTemplates;
  fallback_provider?: WhatsAppProvider;
  enable_fallback?: boolean;
};

export type OutboxStatus = "PENDING" | "PROCESSING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED";

export type WhatsAppOutboxMessage = {
  id: string;
  customer_id?: string | null;
  phone: string;
  recipient_name?: string | null;
  message_type:
    | "pos_invoice"
    | "quick_sale"
    | "payment_receipt"
    | "due_reminder"
    | "doc_ready"
    | "aeps_confirmation"
    | "dmt_confirmation"
    | "recharge_confirmation"
    | "daily_summary"
    | "financial_alert"
    | "day_close"
    | "banking_txn"
    | "custom"
    | "test";
  template_id?: string | null;
  message_body: string;
  reference_type?: "invoice" | "quick_sale" | "payment" | "due" | "document" | "transaction" | "day_close" | "self_audit" | "manual";
  reference_id?: string | null;
  idempotency_key: string;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: string;
  provider: WhatsAppProvider;
  provider_message_id?: string | null;
  error_message?: string | null;
  created_at: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
};

export const GATEWAY_PRESETS = [
  {
    id: "local" as const,
    label: "Local PC Gateway",
    url: "http://localhost:3001",
    desc: "Running on this PC via PM2/Node (Fast, 100% Free)",
    icon: "💻",
    badge: "Local PC",
  },
  {
    id: "render" as const,
    label: "Render Cloud Gateway",
    url: "https://sccomm-whatsapp-gateway.onrender.com",
    desc: "24/7 Cloud Service (Works even when PC is off)",
    icon: "☁️",
    badge: "Cloud 24/7",
  },
] as const;

export const DEFAULT_AUTOMATIONS: WhatsAppAutomationRules = {
  auto_send_pos: true,
  auto_send_quick: true,
  auto_send_payment: true,
  auto_send_due_reminder: true,
  auto_send_document_ready: true,
  auto_send_aeps: true,
  auto_send_dmt: true,
  auto_send_recharge: true,
  auto_send_daily_summary: false,
  auto_send_financial_alerts: true,
};

export const DEFAULT_WA_TEMPLATES: WhatsAppTemplates = {
  pos_invoice: `🧾 *TAX INVOICE: {invoice_number}*
📅 Date: {invoice_date}
{customer_name_line}───────────────
💰 Total Bill: {total_amount}
💳 Amount Paid: {paid_amount}
{status_line}
───────────────
📄 View / Download A4 Invoice (PDF):
{receipt_url}

Thank you for choosing {shop_name}!`,

  quick_sale: `🧾 *QUICK SALE RECEIPT: {sale_number}*
📅 Date: {sale_date}
{customer_name_line}───────────────
📦 Item: {item_name}
💰 Amount Paid: {paid_amount}
───────────────
📄 View / Download Receipt:
{receipt_url}

Thank you for your business!`,

  payment_receipt: `💳 *PAYMENT CONFIRMATION - {shop_name}*

Dear {customer_name},
We have received your payment of *{paid_amount}* towards Invoice *#{invoice_number}*.

📅 Date: {date}
💰 Remaining Balance Due: {due_amount}
───────────────
📄 View Updated Invoice:
{receipt_url}

Thank you for your timely payment!`,

  due_reminder: `⚠️ *PAYMENT REMINDER - {shop_name}*

Dear {customer_name},
This is a friendly reminder that you have an outstanding balance of *{due_amount}* on Invoice *#{invoice_number}* (Dated: {invoice_date}).

📄 View Invoice Details & Scan to Pay:
{receipt_url}

Please settle at your earliest convenience. Thank you!`,

  doc_ready: `📂 *DOCUMENT READY FOR PICKUP - {shop_name}*

Dear {customer_name},
Your requested document / service *{document_name}* is completed and ready for pickup.

📅 Completion Date: {date}
🏷️ Reference: {ref_number}
───────────────
Please visit the store during business hours. Thank you!`,

  aeps_confirmation: `🏧 *AEPS CASH WITHDRAWAL RECEIPT*
🔢 Txn RRN: {ref_number}
📅 Date: {date}
{customer_name_line}───────────────
💰 Withdrawal Amount: {amount}
🏷️ Service Fee: {service_fee}
✅ Status: SUCCESS
───────────────
📄 View Official Digital Receipt:
{receipt_url}

Thank you for banking with {shop_name}!`,

  dmt_confirmation: `💸 *MONEY TRANSFER CONFIRMATION*
🔢 Txn RRN: {ref_number}
📅 Date: {date}
{customer_name_line}───────────────
💰 Remittance Amount: {amount}
🏷️ Transfer Fee: {service_fee}
✅ Status: TRANSFERRED
───────────────
📄 View Official Remittance Receipt:
{receipt_url}

Thank you for using {shop_name}!`,

  recharge_confirmation: `📱 *RECHARGE SUCCESSFUL*
🔢 Txn No: {txn_number}
📅 Date: {date}
───────────────
📱 Mobile / Service: {phone}
💰 Plan Amount: {amount}
✅ Status: SUCCESS
───────────────
Thank you for choosing {shop_name}!`,

  banking_txn: `📱 *{service_name} RECEIPT*
🔢 Txn No: {txn_number}
📅 Date: {txn_date}
{customer_name_line}───────────────
💰 Amount: {amount}
🏷️ Ref / RRN: {ref_number}
✅ Status: {status}
───────────────
📄 View / Download Receipt (PDF):
{receipt_url}

Thank you for choosing {shop_name}!`,

  daily_summary: `📊 *DAILY EXECUTIVE SUMMARY - {shop_name}*
📅 Date: {date}
───────────────
💰 Operating Revenue: {total_revenue}
📉 Recorded Expenses: {total_expenses}
📈 Business Profit Before Tax: {net_profit}

🏦 Physical Cash Drawer: {cash_balance}
🏛️ Bank Accounts: {bank_balance}
📱 Digital Float: {float_balance}

🛡️ Financial Integrity: {audit_score}/100 {audit_status}
🔒 Day Close: {day_close_status}
───────────────
Authoritative Canonical ERP System`,

  financial_alert: `🚨 *FINANCIAL INTEGRITY ALARM - {shop_name}*
⚠️ Priority: {severity}

{alert_reason}

📅 Timestamp: {date}
🛡️ Audit Run Score: {audit_score}/100
───────────────
Please open /ai/self-audit immediately to review and resolve this invariant finding.`,

  day_close: `📊 *DAILY STORE HANDOVER CERTIFICATE*

🏪 Store: {shop_name}
📅 Date: {close_date}
🔢 Shift Closing: #{closing_number}
───────────────
💰 Net Shift Profit: {net_profit}
💼 Total Liquid Position: {liquid_position}
───────────────
📄 View Handover Audit Certificate:
{receipt_url}`,
};

export const DEFAULT_WA_CONFIG: WhatsAppConfig = {
  provider: "off",
  automations: DEFAULT_AUTOMATIONS,
  auto_send_pos: true,
  auto_send_business: true,
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
create policy "whatsapp_templates select" on public.whatsapp_templates for select to authenticated using (true);
create policy "whatsapp_templates insert" on public.whatsapp_templates for insert to authenticated with check (true);
create policy "whatsapp_templates update" on public.whatsapp_templates for update to authenticated using (true);
`;

export function formatWhatsAppPhone(rawPhone: string): string {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function getDirectWhatsAppUrl(phone: string, text: string): string {
  const clean = formatWhatsAppPhone(phone);
  return clean
    ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function renderWhatsAppTemplate(
  templateText?: string | null,
  vars: Record<string, string | number | null | undefined> = {}
): string {
  let rendered = templateText || "";
  for (const [key, value] of Object.entries(vars)) {
    const valStr = String(value ?? "");
    const singleBrace = new RegExp(`\\{${key}\\}`, "g");
    const doubleBrace = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    rendered = rendered.replace(doubleBrace, valStr).replace(singleBrace, valStr);
  }
  return rendered.trim();
}
