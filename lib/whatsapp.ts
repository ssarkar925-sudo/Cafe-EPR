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

export const SQL_TEMPLATES_MIGRATION = `-- WhatsApp Templates Multi-Device Sync Migration
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/tvxehxnvuwojjbhysajp/sql

create table if not exists public.whatsapp_templates (
  id text primary key default 'default',
  templates jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  gateway_session jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_templates add column if not exists gateway_session jsonb;

alter table public.whatsapp_templates enable row level security;
create policy "whatsapp_templates select" on public.whatsapp_templates for select to authenticated using (true);
create policy "whatsapp_templates insert" on public.whatsapp_templates for insert to authenticated with check (true);
create policy "whatsapp_templates update" on public.whatsapp_templates for update to authenticated using (true);
create policy "whatsapp_templates public read" on public.whatsapp_templates for select to anon using (true);

alter table public.settings add column if not exists whatsapp_config jsonb;
`;

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

/**
 * Fetch WhatsApp config and custom templates from Supabase Cloud
 * Updates local cache and returns the synchronized config across devices
 */
export async function fetchCloudWhatsAppConfig(): Promise<WhatsAppConfig> {
  const localCfg = getWhatsAppConfig();
  if (typeof window === "undefined") return localCfg;

  try {
    const supabase = createClient();

    // 1. Try public.whatsapp_templates table
    const { data: tmplRow, error: tmplErr } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (tmplRow && (tmplRow.templates || tmplRow.config)) {
      const merged: WhatsAppConfig = {
        ...DEFAULT_WA_CONFIG,
        ...(tmplRow.config || {}),
        ...localCfg,
        templates: {
          ...DEFAULT_WA_TEMPLATES,
          ...(tmplRow.templates || {}),
          ...(tmplRow.config?.templates || {}),
        },
      };
      saveWhatsAppConfig(merged);
      return merged;
    }

    // 2. Fallback: Check public.settings.whatsapp_config
    if (tmplErr) {
      const { data: setRow } = await supabase
        .from("settings")
        .select("whatsapp_config")
        .eq("id", 1)
        .maybeSingle();

      if (setRow?.whatsapp_config) {
        const merged: WhatsAppConfig = {
          ...DEFAULT_WA_CONFIG,
          ...setRow.whatsapp_config,
          templates: {
            ...DEFAULT_WA_TEMPLATES,
            ...(setRow.whatsapp_config.templates || {}),
          },
        };
        saveWhatsAppConfig(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn("fetchCloudWhatsAppConfig fallback to local:", err);
  }

  return localCfg;
}

/**
 * Save WhatsApp config & custom templates to both localStorage AND Supabase Cloud database
 * Ensures all staff devices stay synchronized
 */
export async function saveCloudWhatsAppConfig(cfg: WhatsAppConfig): Promise<{ success: boolean; error?: string }> {
  // 1. Always save locally first for immediate responsiveness
  saveWhatsAppConfig(cfg);

  try {
    const supabase = createClient();

    // 2. Upsert into public.whatsapp_templates table
    const { error: tmplErr } = await supabase
      .from("whatsapp_templates")
      .upsert({
        id: "default",
        templates: cfg.templates || DEFAULT_WA_TEMPLATES,
        config: cfg,
        updated_at: new Date().toISOString(),
      });

    // 3. Also try updating settings.whatsapp_config as fallback
    try {
      await supabase
        .from("settings")
        .update({ whatsapp_config: cfg })
        .eq("id", 1);
    } catch {}

    if (tmplErr) {
      return { success: false, error: tmplErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to sync with cloud database" };
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

const WA_LOCAL_LOGS_KEY = "sccomm_whatsapp_local_logs";

export function getLocalWhatsAppLogs(): WhatsAppLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WA_LOCAL_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalWhatsAppLog(entry: WhatsAppLogEntry): void {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalWhatsAppLogs();
    const exists = current.some((x) => x.id === entry.id || (x.created_at === entry.created_at && x.recipient_phone === entry.recipient_phone && x.message_text === entry.message_text));
    if (!exists) {
      const updated = [entry, ...current].slice(0, 300);
      localStorage.setItem(WA_LOCAL_LOGS_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.warn("Failed to save local WhatsApp log:", e);
  }
}

// Log message to both Local Storage & Supabase history tracker
export async function logWhatsAppMessage(entry: WhatsAppLogEntry): Promise<void> {
  if (typeof window === "undefined") return;

  const enrichedEntry: WhatsAppLogEntry = {
    ...entry,
    id: entry.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "log_" + Date.now()),
    created_at: entry.created_at || new Date().toISOString(),
  };

  // 1. Immediately persist locally (zero lag, 100% reliable)
  saveLocalWhatsAppLog(enrichedEntry);

  // 2. Also try inserting into Supabase cloud table
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("whatsapp_logs").insert({
      id: enrichedEntry.id,
      recipient_phone: enrichedEntry.recipient_phone,
      recipient_name: enrichedEntry.recipient_name || null,
      message_type: enrichedEntry.message_type,
      ref_id: enrichedEntry.ref_id || null,
      ref_number: enrichedEntry.ref_number || null,
      message_text: enrichedEntry.message_text,
      status: enrichedEntry.status,
      provider: enrichedEntry.provider,
      error_message: enrichedEntry.error_message || null,
      user_id: user?.id || null,
      created_at: enrichedEntry.created_at,
    });
  } catch (e) {
    // Supabase table might not be created yet, but local log is already saved
  }
}

// Check gateway connection health and live status (works for both local PC and cloud)
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

  // If local PC gateway, test directly from the browser client
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
        error: `Cannot connect to Local PC Gateway at ${gatewayUrl}. Please ensure your local PM2 or Node.js background service is running on port 3001.`,
        isLocal: true,
      };
    }
  }

  // If public Cloud Gateway (e.g. Render), attempt direct browser fetch, then fallback to server proxy
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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
        isLocal: false,
      };
    }
  } catch {
    // Attempt through server API route (helps if Render is sleeping or CORS is blocked)
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

  // Local or Cloud Baileys Gateway
  if (config.provider === "local_gateway") {
    const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
    const isLocal = gatewayUrl.includes("localhost") || gatewayUrl.includes("127.0.0.1");

    // 1. Direct browser-to-gateway request
    try {
      const directController = new AbortController();
      const directTimeout = setTimeout(() => directController.abort(), isLocal ? 6000 : 10000);

      const directRes = await fetch(`${gatewayUrl}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
          ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
        },
        body: JSON.stringify({
          phone: formatWhatsAppPhone(phone),
          number: formatWhatsAppPhone(phone),
          message,
          text: message,
        }),
        signal: directController.signal,
      });
      clearTimeout(directTimeout);

      const directData = await directRes.json().catch(() => ({}));
      if (directRes.ok && directData.success) {
        if (directData.status === "dispatched_mock") {
          const warnMsg = `Gateway active at ${gatewayUrl}, but WhatsApp is waiting for QR scan. Scan QR code to link your phone.`;
          logWhatsAppMessage({
            recipient_phone: phone,
            recipient_name: recipientName,
            message_type: messageType,
            ref_id: refId,
            ref_number: refNumber,
            message_text: message,
            status: "failed",
            provider: "local_gateway",
            error_message: warnMsg,
          });
          return { ok: false, fallbackUrl, error: warnMsg };
        }

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
      // If Local PC Gateway failed from browser, do not proxy to Vercel (Vercel can't reach user's localhost)
      if (isLocal) {
        const localError = `Could not connect to Local WhatsApp Gateway at ${gatewayUrl}. Please ensure your background service (PM2) is running on this PC, or switch to Render Cloud Gateway in Settings.`;
        logWhatsAppMessage({
          recipient_phone: phone,
          recipient_name: recipientName,
          message_type: messageType,
          ref_id: refId,
          ref_number: refNumber,
          message_text: message,
          status: "failed",
          provider: "local_gateway",
          error_message: localError,
        });
        return { ok: false, fallbackUrl, error: localError };
      }
    }
  }

  // Server API proxy route (handles Meta, UltraMsg, and Cloud Render gateways)
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

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      const errorMsg = data?.error || "Failed to send message";
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
