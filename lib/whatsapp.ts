"use client";

import { createClient } from "@/lib/supabase/client";

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

const WA_CONFIG_KEY = "sccomm_whatsapp_config";
const WA_LOCAL_OUTBOX_KEY = "sccomm_whatsapp_local_outbox";

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

export function getWhatsAppConfig(): WhatsAppConfig {
  if (typeof window === "undefined") return DEFAULT_WA_CONFIG;
  try {
    const raw = localStorage.getItem(WA_CONFIG_KEY);
    if (!raw) return DEFAULT_WA_CONFIG;
    const parsed = JSON.parse(raw);
    const autoPos = parsed.auto_send_pos ?? parsed.automations?.auto_send_pos ?? true;
    const autoBiz = parsed.auto_send_business ?? parsed.automations?.auto_send_aeps ?? true;
    return {
      ...DEFAULT_WA_CONFIG,
      ...parsed,
      auto_send_pos: autoPos,
      auto_send_business: autoBiz,
      automations: {
        ...DEFAULT_AUTOMATIONS,
        ...(parsed.automations || {}),
        auto_send_pos: autoPos,
        auto_send_aeps: autoBiz,
      },
      templates: {
        ...DEFAULT_WA_TEMPLATES,
        ...(parsed.templates || {}),
      },
    };
  } catch {
    return DEFAULT_WA_CONFIG;
  }
}

export function saveWhatsAppConfig(cfg: WhatsAppConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WA_CONFIG_KEY, JSON.stringify(cfg));
}

export async function fetchCloudWhatsAppConfig(): Promise<WhatsAppConfig> {
  const localCfg = getWhatsAppConfig();
  if (typeof window === "undefined") return localCfg;

  try {
    const supabase = createClient();
    const { data: tmplRow } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (tmplRow && (tmplRow.templates || tmplRow.config)) {
      const merged: WhatsAppConfig = {
        ...DEFAULT_WA_CONFIG,
        ...(tmplRow.config || {}),
        ...localCfg,
        automations: {
          ...DEFAULT_AUTOMATIONS,
          ...(tmplRow.config?.automations || {}),
          ...(localCfg.automations || {}),
        },
        templates: {
          ...DEFAULT_WA_TEMPLATES,
          ...(tmplRow.templates || {}),
          ...(tmplRow.config?.templates || {}),
        },
      };
      saveWhatsAppConfig(merged);
      return merged;
    }
  } catch (err) {
    console.warn("fetchCloudWhatsAppConfig fallback:", err);
  }

  return localCfg;
}

export async function saveCloudWhatsAppConfig(cfg: WhatsAppConfig): Promise<{ success: boolean; error?: string }> {
  saveWhatsAppConfig(cfg);
  try {
    const supabase = createClient();
    await supabase.from("whatsapp_templates").upsert({
      id: "default",
      templates: cfg.templates || DEFAULT_WA_TEMPLATES,
      config: cfg,
      updated_at: new Date().toISOString(),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to sync config" };
  }
}

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

let keepAliveTimer: any = null;
export function startGatewayHeartbeat() {
  if (typeof window === "undefined" || keepAliveTimer) return;

  const ping = async () => {
    try {
      const cfg = getWhatsAppConfig();
      if (cfg.provider === "local_gateway" && cfg.gateway_url) {
        const url = cfg.gateway_url.replace(/\/$/, "");
        fetch(`${url}/health`, {
          mode: "no-cors",
          headers: { "Bypass-Tunnel-Reminder": "true" },
        }).catch(() => {});
      }
    } catch {}
  };

  ping();
  keepAliveTimer = setInterval(ping, 3 * 60 * 1000);
}

export async function checkGatewayHealth(targetUrl?: string): Promise<{
  ok: boolean;
  status: "connected" | "waiting_for_qr" | "offline" | "waking_up" | "error";
  connected: boolean;
  phone?: string;
  service?: string;
  error?: string;
  isLocal?: boolean;
}> {
  const config = getWhatsAppConfig();
  const rawUrl = targetUrl || config.gateway_url || "http://localhost:3001";
  const gatewayUrl = rawUrl.trim().replace(/\/$/, "");
  const isLocal = gatewayUrl.includes("localhost") || gatewayUrl.includes("127.0.0.1");

  if (isLocal) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${gatewayUrl}/health`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return {
          ok: true,
          status: data.connected ? "connected" : "waiting_for_qr",
          connected: Boolean(data.connected),
          phone: data.userPhone || "",
          service: data.service,
          isLocal: true,
        };
      }
      return {
        ok: false,
        status: "error",
        connected: false,
        error: `Local Gateway returned HTTP ${res.status}`,
        isLocal: true,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: "offline",
        connected: false,
        error: `Cannot connect to Local PC Gateway at ${gatewayUrl}.`,
        isLocal: true,
      };
    }
  }

  try {
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "0000000000",
        message: "__PING_HEALTH_CHECK__",
        config: {
          ...config,
          provider: "local_gateway",
          gateway_url: gatewayUrl,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.data) {
      const isConn = Boolean(data.data.connected);
      return {
        ok: true,
        status: isConn ? "connected" : "waiting_for_qr",
        connected: isConn,
        phone: data.data.userPhone || "",
        service: data.data.service,
        isLocal: false,
      };
    }
    return {
      ok: false,
      status: "offline",
      connected: false,
      error: data?.error || `Could not connect to Cloud Gateway at ${gatewayUrl}.`,
      isLocal: false,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: "offline",
      connected: false,
      error: err?.message || `Could not connect to Cloud Gateway at ${gatewayUrl}.`,
      isLocal: false,
    };
  }
}

// -----------------------------------------------------------------------------
// DURABLE OUTBOX QUEUE SYSTEM
// -----------------------------------------------------------------------------

export function getLocalWhatsAppOutbox(): WhatsAppOutboxMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WA_LOCAL_OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalWhatsAppOutbox(messages: WhatsAppOutboxMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WA_LOCAL_OUTBOX_KEY, JSON.stringify(messages.slice(0, 500)));
  } catch (e) {
    console.warn("Failed to save local outbox:", e);
  }
}

export async function enqueueWhatsAppOutbox(params: {
  phone: string;
  messageType: WhatsAppOutboxMessage["message_type"];
  messageBody: string;
  recipientName?: string | null;
  customerId?: string | null;
  templateId?: string | null;
  referenceType?: WhatsAppOutboxMessage["reference_type"];
  referenceId?: string | null;
}): Promise<{ enqueued: boolean; messageId: string; duplicate?: boolean }> {
  const {
    phone,
    messageType,
    messageBody,
    recipientName,
    customerId,
    templateId,
    referenceType = "manual",
    referenceId = "manual_" + Date.now(),
  } = params;

  const cleanPhone = formatWhatsAppPhone(phone);
  const idempotencyKey = `${referenceType}:${referenceId}:${messageType}`;
  const config = getWhatsAppConfig();

  const localQueue = getLocalWhatsAppOutbox();
  const existingLocal = localQueue.find((m) => m.idempotency_key === idempotencyKey);
  if (existingLocal) {
    return { enqueued: false, messageId: existingLocal.id, duplicate: true };
  }

  const outboxId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "msg_" + Date.now();
  const now = new Date().toISOString();

  const newMessage: WhatsAppOutboxMessage = {
    id: outboxId,
    customer_id: customerId || null,
    phone: cleanPhone,
    recipient_name: recipientName || null,
    message_type: messageType,
    template_id: templateId || null,
    message_body: messageBody,
    reference_type: referenceType,
    reference_id: referenceId,
    idempotency_key: idempotencyKey,
    status: config.provider === "off" ? "CANCELLED" : "PENDING",
    attempt_count: 0,
    next_attempt_at: now,
    provider: config.provider,
    created_at: now,
  };

  saveLocalWhatsAppOutbox([newMessage, ...localQueue]);

  try {
    const supabase = createClient();
    await supabase.from("whatsapp_outbox").insert({
      id: newMessage.id,
      customer_id: newMessage.customer_id,
      phone: newMessage.phone,
      recipient_name: newMessage.recipient_name,
      message_type: newMessage.message_type,
      template_id: newMessage.template_id,
      message_body: newMessage.message_body,
      reference_type: newMessage.reference_type,
      reference_id: newMessage.reference_id,
      idempotency_key: newMessage.idempotency_key,
      status: newMessage.status,
      attempt_count: newMessage.attempt_count,
      next_attempt_at: newMessage.next_attempt_at,
      provider: newMessage.provider,
      created_at: newMessage.created_at,
    });
  } catch (err) {}

  if (config.provider !== "off" && typeof window !== "undefined") {
    setTimeout(() => {
      processWhatsAppOutbox().catch(() => {});
    }, 100);
  }

  return { enqueued: true, messageId: outboxId };
}

export async function processWhatsAppOutbox(): Promise<{ processed: number; sent: number; failed: number }> {
  const config = getWhatsAppConfig();
  if (config.provider === "off") return { processed: 0, sent: 0, failed: 0 };

  const queue = getLocalWhatsAppOutbox();
  const now = new Date();
  let sentCount = 0;
  let failCount = 0;

  const updatedQueue = [...queue];

  for (let i = 0; i < updatedQueue.length; i++) {
    const msg = updatedQueue[i];
    if (msg.status !== "PENDING") continue;
    if (new Date(msg.next_attempt_at) > now) continue;

    msg.status = "PROCESSING";
    msg.attempt_count += 1;

    try {
      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: msg.phone,
          message: msg.message_body,
          config,
        }),
      });

      const resData = await sendRes.json().catch(() => ({}));

      if (sendRes.ok && (resData.success || resData.ok)) {
        msg.status = "SENT";
        msg.sent_at = new Date().toISOString();
        msg.provider_message_id = resData.messageId || resData.data?.id || null;
        msg.error_message = null;
        sentCount++;
      } else {
        throw new Error(resData.error || `Transport error HTTP ${sendRes.status}`);
      }
    } catch (err: any) {
      failCount++;
      msg.error_message = err.message || "Transport error";

      if (msg.attempt_count >= 4) {
        msg.status = "FAILED";
      } else {
        msg.status = "PENDING";
        const backoffMinutes = msg.attempt_count === 1 ? 1 : msg.attempt_count === 2 ? 5 : 15;
        msg.next_attempt_at = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
      }
    }

    try {
      const supabase = createClient();
      await supabase
        .from("whatsapp_outbox")
        .update({
          status: msg.status,
          attempt_count: msg.attempt_count,
          next_attempt_at: msg.next_attempt_at,
          provider_message_id: msg.provider_message_id,
          error_message: msg.error_message,
          sent_at: msg.sent_at,
        })
        .eq("id", msg.id);
    } catch {}
  }

  saveLocalWhatsAppOutbox(updatedQueue);
  return { processed: sentCount + failCount, sent: sentCount, failed: failCount };
}

// -----------------------------------------------------------------------------
// EVENT AUTOMATION DISPATCHER (9 CORE AUTOMATIONS)
// -----------------------------------------------------------------------------

export async function triggerWhatsAppAutomation(event: {
  type:
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
    | "banking_txn";
  phone: string;
  recipientName?: string | null;
  customerId?: string | null;
  referenceId: string;
  data: Record<string, string | number | null | undefined>;
}): Promise<{ triggered: boolean; messageId?: string; reason?: string }> {
  const config = getWhatsAppConfig();
  const automations = config.automations;

  const isEnabled = {
    pos_invoice: automations.auto_send_pos,
    quick_sale: automations.auto_send_quick,
    payment_receipt: automations.auto_send_payment,
    due_reminder: automations.auto_send_due_reminder,
    doc_ready: automations.auto_send_document_ready,
    aeps_confirmation: automations.auto_send_aeps,
    dmt_confirmation: automations.auto_send_dmt,
    recharge_confirmation: automations.auto_send_recharge,
    daily_summary: automations.auto_send_daily_summary,
    financial_alert: automations.auto_send_financial_alerts,
    banking_txn: automations.auto_send_aeps,
  }[event.type];

  if (!isEnabled) {
    return { triggered: false, reason: `Automation for ${event.type} is disabled in Settings.` };
  }

  if (event.customerId) {
    try {
      const supabase = createClient();
      const { data: cust } = await supabase
        .from("customers")
        .select("whatsapp_opt_out, notify_invoices, notify_payments, notify_dues, notify_services")
        .eq("id", event.customerId)
        .maybeSingle();

      if (cust?.whatsapp_opt_out) {
        return { triggered: false, reason: "Customer has opted out of WhatsApp messages." };
      }
    } catch {}
  }

  const templates = config.templates || DEFAULT_WA_TEMPLATES;
  const templateKey = event.type as keyof WhatsAppTemplates;
  const templateText = templates[templateKey] || DEFAULT_WA_TEMPLATES[templateKey] || "";

  if (!templateText) {
    return { triggered: false, reason: `No template found for ${event.type}` };
  }

  const messageBody = renderWhatsAppTemplate(templateText, {
    shop_name: "Sarkar Communication",
    customer_name: event.recipientName || "Customer",
    customer_name_line: event.recipientName ? `👤 Customer: ${event.recipientName}\n` : "",
    date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    ...event.data,
  });

  const refTypeMap: Record<string, WhatsAppOutboxMessage["reference_type"]> = {
    pos_invoice: "invoice",
    quick_sale: "quick_sale",
    payment_receipt: "payment",
    due_reminder: "due",
    doc_ready: "document",
    aeps_confirmation: "transaction",
    dmt_confirmation: "transaction",
    recharge_confirmation: "transaction",
    banking_txn: "transaction",
    daily_summary: "day_close",
    financial_alert: "self_audit",
  };

  const res = await enqueueWhatsAppOutbox({
    phone: event.phone,
    recipientName: event.recipientName,
    customerId: event.customerId,
    messageType: event.type,
    templateId: event.type,
    messageBody,
    referenceType: refTypeMap[event.type] || "manual",
    referenceId: event.referenceId,
  });

  return { triggered: res.enqueued, messageId: res.messageId };
}

// -----------------------------------------------------------------------------
// COMPATIBILITY INTERFACES
// -----------------------------------------------------------------------------

export type WhatsAppLogEntry = {
  id?: string;
  recipient_phone: string;
  recipient_name?: string | null;
  message_type: WhatsAppOutboxMessage["message_type"];
  ref_id?: string | null;
  ref_number?: string | null;
  message_text: string;
  status: "sent" | "delivered" | "failed" | "fallback_link";
  provider: WhatsAppProvider | "manual_link";
  error_message?: string | null;
  created_at?: string;
};

export async function sendWhatsAppMessage(params: {
  phone: string;
  message: string;
  recipientName?: string | null;
  messageType?: WhatsAppOutboxMessage["message_type"];
  refId?: string | null;
  refNumber?: string | null;
}): Promise<{ ok: boolean; fallbackUrl: string; error?: string }> {
  const fallbackUrl = getDirectWhatsAppUrl(params.phone, params.message);
  const enqueueRes = await enqueueWhatsAppOutbox({
    phone: params.phone,
    recipientName: params.recipientName,
    messageType: params.messageType || "custom",
    messageBody: params.message,
    referenceType: "manual",
    referenceId: params.refId || "manual_" + Date.now(),
  });

  return { ok: enqueueRes.enqueued, fallbackUrl };
}
