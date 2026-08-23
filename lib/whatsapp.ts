export type WhatsAppProvider = "meta" | "local_gateway" | "ultramsg" | "off";

export type WhatsAppConfig = {
  provider: WhatsAppProvider;
  auto_send_pos: boolean;
  auto_send_business: boolean;
  // Meta Cloud API
  meta_phone_number_id?: string;
  meta_access_token?: string;
  // Local Gateway (Baileys / WPPConnect server, default http://localhost:3001)
  gateway_url?: string;
  gateway_api_key?: string;
  // UltraMsg / Green API Gateway
  ultramsg_instance_id?: string;
  ultramsg_token?: string;
};

const WA_CONFIG_KEY = "sccomm_whatsapp_config";

export const DEFAULT_WA_CONFIG: WhatsAppConfig = {
  provider: "off",
  auto_send_pos: false,
  auto_send_business: false,
  gateway_url: "http://localhost:3001",
  gateway_api_key: "",
};

export function getWhatsAppConfig(): WhatsAppConfig {
  if (typeof window === "undefined") return DEFAULT_WA_CONFIG;
  try {
    const raw = localStorage.getItem(WA_CONFIG_KEY);
    if (!raw) return DEFAULT_WA_CONFIG;
    return { ...DEFAULT_WA_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WA_CONFIG;
  }
}

export function saveWhatsAppConfig(cfg: WhatsAppConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WA_CONFIG_KEY, JSON.stringify(cfg));
}

export function formatWhatsAppPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function getDirectWhatsAppUrl(phone: string, text: string): string {
  const clean = formatWhatsAppPhone(phone);
  return clean
    ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function sendWhatsAppMessage({
  phone,
  message,
}: {
  phone: string;
  message: string;
}): Promise<{ ok: boolean; fallbackUrl: string; error?: string }> {
  const config = getWhatsAppConfig();
  const fallbackUrl = getDirectWhatsAppUrl(phone, message);

  if (config.provider === "off") {
    return { ok: false, fallbackUrl };
  }

  // If using local_gateway, attempt direct browser-to-gateway communication first
  // (Allows cloud-hosted sites on Vercel to directly talk to the local PC's port 3001)
  if (config.provider === "local_gateway") {
    const gatewayUrl = (config.gateway_url?.trim() || "http://localhost:3001").replace(/\/$/, "");
    try {
      const directController = new AbortController();
      const directTimeout = setTimeout(() => directController.abort(), 5000);

      const directRes = await fetch(`${gatewayUrl}/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        return { ok: true, fallbackUrl };
      }
    } catch (directErr: any) {
      // Direct client fetch failed, fall through to server route
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
      return { ok: false, fallbackUrl, error: data.error || "Failed to send message" };
    }

    return { ok: true, fallbackUrl };
  } catch (err: any) {
    return { ok: false, fallbackUrl, error: err?.message || "Network error" };
  }
}

