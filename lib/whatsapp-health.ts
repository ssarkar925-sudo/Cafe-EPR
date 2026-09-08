import { createAdminClient } from "@/lib/supabase/admin";
import { getServerWhatsAppConfig } from "@/lib/whatsapp-sender";

export type WhatsAppHealth = {
  provider: string;
  configured: boolean;
  connected: boolean;
  status: "connected" | "disconnected" | "not_configured" | "unknown";
  error?: string;
  code?: number;
  details?: Record<string, unknown>;
};

export async function checkWhatsAppHealth(): Promise<WhatsAppHealth> {
  const config = await getServerWhatsAppConfig();
  if (!config.provider || config.provider === "off") {
    return { provider: "off", configured: false, connected: false, status: "not_configured", error: "WhatsApp integration is disabled." };
  }

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    if (!phoneId || !token) {
      return { provider: "meta", configured: false, connected: false, status: "not_configured", error: "Meta Phone Number ID or Access Token is missing." };
    }
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}?fields=id,verified_name,display_phone_number,quality_rating,status,code_verification_status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const metaError = data?.error;
        return {
          provider: "meta",
          configured: true,
          connected: false,
          status: "disconnected",
          error: metaError?.message || `Meta returned HTTP ${response.status}`,
          code: metaError?.code,
          details: { errorType: metaError?.type, errorSubcode: metaError?.error_subcode },
        };
      }
      return {
        provider: "meta",
        configured: true,
        connected: true,
        status: "connected",
        details: {
          phoneNumberId: phoneId,
          displayPhoneNumber: data?.display_phone_number,
          verifiedName: data?.verified_name,
          qualityRating: data?.quality_rating,
          status: data?.status,
          codeVerificationStatus: data?.code_verification_status,
        },
      };
    } catch (err: any) {
      return { provider: "meta", configured: true, connected: false, status: "unknown", error: err?.message || "Could not reach Meta." };
    }
  }

  if (config.provider === "local_gateway") {
    const gatewayUrl = String(config.gateway_url || "").trim().replace(/\/$/, "");
    if (!gatewayUrl) return { provider: "local_gateway", configured: false, connected: false, status: "not_configured", error: "WhatsApp gateway URL is missing." };
    try {
      const response = await fetch(`${gatewayUrl}/health`, {
        headers: { "Bypass-Tunnel-Reminder": "true", ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}) },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json().catch(() => ({}));
      const connected = response.ok && Boolean(data?.connected);
      return { provider: "local_gateway", configured: true, connected, status: connected ? "connected" : "disconnected", error: connected ? undefined : data?.error || `Gateway returned HTTP ${response.status}`, details: data };
    } catch (err: any) {
      return { provider: "local_gateway", configured: true, connected: false, status: "disconnected", error: `Could not reach WhatsApp Gateway: ${err?.message || "request failed"}` };
    }
  }

  if (config.provider === "ultramsg") {
    const instanceId = config.ultramsg_instance_id?.trim();
    const token = config.ultramsg_token?.trim();
    if (!instanceId || !token) return { provider: "ultramsg", configured: false, connected: false, status: "not_configured", error: "UltraMsg Instance ID or Token is missing." };
    try {
      const response = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instanceId)}/instance/status?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => ({}));
      const connected = response.ok && String(data?.status || "").toLowerCase() === "authenticated";
      return { provider: "ultramsg", configured: true, connected, status: connected ? "connected" : "disconnected", error: connected ? undefined : data?.error || "UltraMsg instance is not authenticated.", details: data };
    } catch (err: any) {
      return { provider: "ultramsg", configured: true, connected: false, status: "unknown", error: err?.message || "Could not reach UltraMsg." };
    }
  }

  return { provider: config.provider, configured: true, connected: false, status: "unknown", error: "Unknown WhatsApp provider." };
}

export async function recordWhatsAppHealthAlert(health: WhatsAppHealth) {
  const db = createAdminClient();
  if (health.connected || health.status === "not_configured") return null;
  const title = "WhatsApp gateway is disconnected or unhealthy";
  const { data: existing } = await db.from("ai_monitor_events").select("id").eq("source", "system").eq("title", title).in("status", ["open", "acknowledged"]).limit(1).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from("ai_monitor_events").insert({
    severity: "critical",
    source: "system",
    title,
    details: { provider: health.provider, status: health.status, error: health.error, code: health.code, details: health.details || {} },
    status: "open",
  }).select("id,severity,source,title,details,status,detected_at").single();
  if (error) throw error;
  return data;
}
