"use client";

import { createClient } from "@/lib/supabase/client";

export type WhatsAppProvider = "meta" | "local_gateway" | "ultramsg" | "off";

export type WhatsAppTemplates = {
  pos_invoice: string;
  quick_sale: string;
  banking_txn: string;
  due_reminder: string;
  day_close: string;
};

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  auto_send_pos: boolean;
  auto_send_business: boolean;
  gateway_url?: string;
  gateway_api_key?: string;
  meta_phone_number_id?: string;
  meta_access_token?: string;
  ultramsg_instance_id?: string;
  ultramsg_token?: string;
  templates?: WhatsAppTemplates;
};

const WA_CONFIG_KEY = "sccomm_whatsapp_config";

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

  due_reminder: `⚠️ *PAYMENT REMINDER - {shop_name}*

Dear {customer_name},
This is a friendly reminder that you have an outstanding balance of *{due_amount}* on Invoice *#{invoice_number}* (Dated: {invoice_date}).

📄 View Invoice Details & Scan to Pay:
{receipt_url}

Please settle at your earliest convenience. Thank you!`,

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
  auto_send_pos: false,
  auto_send_business: false,
  gateway_url: "http://localhost:3001",
  gateway_api_key: "",
  templates: DEFAULT_WA_TEMPLATES,
};

export function getWhatsAppConfig(): WhatsAppConfig {
  if (typeof window === "undefined") return DEFAULT_WA_CONFIG;
  try {
    const raw = localStorage.getItem(WA_CONFIG_KEY);
    if (!raw) return DEFAULT_WA_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_WA_CONFIG,
      ...parsed,
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

// Render dynamic tags in template
export function renderWhatsAppTemplate(
  templateText: string,
  vars: Record<string, string | number | null | undefined>
): string {
  let rendered = templateText;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{${key}\\}`, "g");
    rendered = rendered.replace(placeholder, String(value ?? ""));
  }
  return rendered.trim();
}

export type WhatsAppLogEntry = {
  id?: string;
  recipient_phone: string;
  recipient_name?: string | null;
  message_type: "pos_invoice" | "quick_sale" | "banking_txn" | "due_reminder" | "day_close" | "custom" | "test";
  ref_id?: string | null;
  ref_number?: string | null;
  message_text: string;
  status: "sent" | "delivered" | "failed" | "fallback_link";
  provider: WhatsAppProvider | "manual_link";
  error_message?: string | null;
  created_at?: string;
};

// Log message to Supabase history tracker
export async function logWhatsAppMessage(entry: WhatsAppLogEntry): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("whatsapp_logs").insert({
      recipient_phone: entry.recipient_phone,
      recipient_name: entry.recipient_name || null,
      message_type: entry.message_type,
      ref_id: entry.ref_id || null,
      ref_number: entry.ref_number || null,
      message_text: entry.message_text,
      status: entry.status,
      provider: entry.provider,
      error_message: entry.error_message || null,
      user_id: user?.id || null,
    });
  } catch (e) {
    console.warn("Failed to log WhatsApp message history:", e);
  }
}

export async function sendWhatsAppMessage({
  phone,
  message,
  recipientName,
  messageType = "custom",
  refId,
  refNumber,
}: {
  phone: string;
  message: string;
  recipientName?: string | null;
  messageType?: WhatsAppLogEntry["message_type"];
  refId?: string | null;
  refNumber?: string | null;
}): Promise<{ ok: boolean; fallbackUrl: string; error?: string }> {
  const config = getWhatsAppConfig();
  const fallbackUrl = getDirectWhatsAppUrl(phone, message);

  if (config.provider === "off") {
    // Log fallback link action
    logWhatsAppMessage({
      recipient_phone: phone,
      recipient_name: recipientName,
      message_type: messageType,
      ref_id: refId,
      ref_number: refNumber,
      message_text: message,
      status: "fallback_link",
      provider: "off",
    });
    return { ok: false, fallbackUrl };
  }

  // If using local_gateway, attempt direct browser-to-gateway communication first
  if (config.provider === "local_gateway") {
    const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
    try {
      const directController = new AbortController();
      const directTimeout = setTimeout(() => directController.abort(), 5000);

      const directRes = await fetch(`${gatewayUrl}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
        },
        body: JSON.stringify({
          phone: formatWhatsAppPhone(phone),
          message,
        }),
        signal: directController.signal,
      });
      clearTimeout(directTimeout);

      const directData = await directRes.json().catch(() => ({}));
      if (directRes.ok && directData.success) {
        logWhatsAppMessage({
          recipient_phone: phone,
          recipient_name: recipientName,
          message_type: messageType,
          ref_id: refId,
          ref_number: refNumber,
          message_text: message,
          status: "sent",
          provider: "local_gateway",
        });
        return { ok: true, fallbackUrl };
      }
    } catch {
      // Direct local fetch failed, fall through to server route
    }
  }

  try {
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: formatWhatsAppPhone(phone),
        message,
        config,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      const errorMsg = data.error || "Failed to send message";
      logWhatsAppMessage({
        recipient_phone: phone,
        recipient_name: recipientName,
        message_type: messageType,
        ref_id: refId,
        ref_number: refNumber,
        message_text: message,
        status: "failed",
        provider: config.provider,
        error_message: errorMsg,
      });
      return { ok: false, fallbackUrl, error: errorMsg };
    }

    logWhatsAppMessage({
      recipient_phone: phone,
      recipient_name: recipientName,
      message_type: messageType,
      ref_id: refId,
      ref_number: refNumber,
      message_text: message,
      status: "sent",
      provider: config.provider,
    });

    return { ok: true, fallbackUrl };
  } catch (err: any) {
    const errText = err?.message || "Network error";
    logWhatsAppMessage({
      recipient_phone: phone,
      recipient_name: recipientName,
      message_type: messageType,
      ref_id: refId,
      ref_number: refNumber,
      message_text: message,
      status: "failed",
      provider: config.provider,
      error_message: errText,
    });
    return { ok: false, fallbackUrl, error: errText };
  }
}
