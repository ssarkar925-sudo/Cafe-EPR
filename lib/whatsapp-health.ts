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

function resolveSafeReconnectEndpoint(gatewayUrl: string, endpoint: unknown): string | null {
  if (typeof endpoint !== "string" || !endpoint.trim()) return null;
  try {
    const base = new URL(gatewayUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    const resolved = new URL(endpoint, base);
    if (resolved.protocol !== base.protocol || resolved.hostname !== base.hostname || resolved.port !== base.port) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export async function checkWhatsAppHealth(): Promise<WhatsAppHealth> {
  const config = await getServerWhatsAppConfig();
  if (!config.provider || config.provider === "off") return { provider: "off", configured: false, connected: false, status: "not_configured", error: "WhatsApp integration is disabled." };

  if (config.provider === "meta") {
    const phoneId = config.meta_phone_number_id?.trim();
    const token = config.meta_access_token?.trim();
    if (!phoneId || !token) return { provider: "meta", configured: false, connected: false, status: "not_configured", error: "Meta Phone Number ID or Access Token is missing." };
    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}?fields=id,verified_name,display_phone_number,quality_rating,status,code_verification_status`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const metaError = data?.error;
        return { provider: "meta", configured: true, connected: false, status: "disconnected", error: metaError?.message || `Meta returned HTTP ${response.status}`, code: metaError?.code, details: { httpStatus: response.status, errorType: metaError?.type, errorSubcode: metaError?.error_subcode } };
      }
      return { provider: "meta", configured: true, connected: true, status: "connected", code: response.status, details: { phoneNumberId: phoneId, displayPhoneNumber: data?.display_phone_number, verifiedName: data?.verified_name, qualityRating: data?.quality_rating, status: data?.status, codeVerificationStatus: data?.code_verification_status } };
    } catch (err: any) {
      return { provider: "meta", configured: true, connected: false, status: "unknown", error: err?.message || "Could not reach Meta." };
    }
  }

  if (config.provider === "local_gateway") {
    const gatewayUrl = String(config.gateway_url || "").trim().replace(/\/$/, "");
    if (!gatewayUrl) return { provider: "local_gateway", configured: false, connected: false, status: "not_configured", error: "WhatsApp gateway URL is missing." };
    try {
      const response = await fetch(`${gatewayUrl}/health`, { headers: { "Bypass-Tunnel-Reminder": "true", ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}) }, cache: "no-store", signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => ({}));
      const connected = response.ok && Boolean(data?.connected);
      const gatewayState = String(data?.status || "").toLowerCase();
      const waitingForQr = gatewayState === "waiting_for_qr";
      const isController = data?.controller === "cafeerp-whatsapp-gateway-controller-v1";
      const reconnectEndpoint = isController ? String(data?.reconnectEndpoint || "") : "";
      const safeReconnectUrl = isController ? resolveSafeReconnectEndpoint(gatewayUrl, reconnectEndpoint) : null;
      const reconnectSupported = Boolean(safeReconnectUrl);
      const error = connected
        ? undefined
        : waitingForQr
          ? "WhatsApp gateway is running, but this gateway session is waiting for a QR scan."
          : data?.error || `Gateway returned HTTP ${response.status}`;
      return {
        provider: "local_gateway",
        configured: true,
        connected,
        status: connected ? "connected" : "disconnected",
        code: response.status,
        error,
        details: {
          ...data,
          gatewayUrl,
          waitingForQr,
          reconnectSupported,
          reconnectEndpoint: reconnectSupported ? reconnectEndpoint : undefined,
          reconnectUrl: safeReconnectUrl || undefined,
        },
      };
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
      return { provider: "ultramsg", configured: true, connected, status: connected ? "connected" : "disconnected", code: response.status, error: connected ? undefined : data?.error || "UltraMsg instance is not authenticated.", details: data };
    } catch (err: any) {
      return { provider: "ultramsg", configured: true, connected: false, status: "unknown", error: err?.message || "Could not reach UltraMsg." };
    }
  }

  return { provider: config.provider, configured: true, connected: false, status: "unknown", error: "Unknown WhatsApp provider." };
}

/** Safely restarts a gateway only when the gateway itself advertises the CafeERP recovery contract. */
export async function repairLocalWhatsAppGateway() {
  const config = await getServerWhatsAppConfig();
  if (config.provider !== "local_gateway") return { repaired: false, reason: "Self-repair is only supported for the configured local_gateway provider." };
  const gatewayUrl = String(config.gateway_url || "").trim().replace(/\/$/, "");
  if (!gatewayUrl) return { repaired: false, reason: "WhatsApp gateway URL is missing." };

  try {
    const before = await checkWhatsAppHealth();
    const reconnectUrl = typeof before.details?.reconnectUrl === "string" ? before.details.reconnectUrl : null;
    if (!reconnectUrl || before.details?.reconnectSupported !== true) {
      return { repaired: false, reason: "The configured WhatsApp gateway did not advertise the verified CafeERP reconnect contract." };
    }

    const response = await fetch(reconnectUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Bypass-Tunnel-Reminder": "true",
        ...(config.gateway_api_key ? { "x-api-key": config.gateway_api_key } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { repaired: false, reason: data?.error || `Gateway reconnect returned HTTP ${response.status}`, code: response.status };

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const health = await checkWhatsAppHealth();
      if (health.connected) return { repaired: true, verified: true, message: "WhatsApp gateway was restarted and the connection is healthy." };
      if (health.details?.waitingForQr) return { repaired: true, verified: false, requiresQr: true, message: "Gateway restarted successfully, but WhatsApp now requires a QR scan to link the device." };
    }

    const after = await checkWhatsAppHealth();
    return { repaired: true, verified: false, requiresQr: Boolean(after.details?.waitingForQr), message: after.error || "Gateway restart completed, but WhatsApp is not connected yet." };
  } catch (err: any) {
    return { repaired: false, reason: err?.message || "Local gateway reconnect failed." };
  }
}

/** Safely repairs a stale Meta Phone Number ID by resolving the configured WABA's phone list. */
export async function repairMetaPhoneNumberId() {
  const config = await getServerWhatsAppConfig();
  if (config.provider !== "meta") return { repaired: false, reason: "Self-repair is only supported for Meta Cloud API." };
  const token = config.meta_access_token?.trim();
  const wabaId = config.meta_waba_id?.trim();
  const targetPhone = String(config.meta_display_phone_number || "").replace(/\D/g, "");
  if (!token || !wabaId) return { repaired: false, reason: "Meta Access Token or WABA ID is missing." };
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app&limit=100`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { repaired: false, reason: payload?.error?.message || `Meta returned HTTP ${response.status}`, code: payload?.error?.code };
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const match = rows.find((item: any) => targetPhone && String(item?.display_phone_number || "").replace(/\D/g, "") === targetPhone) || (rows.length === 1 ? rows[0] : null);
    if (!match?.id) return { repaired: false, reason: "Meta did not return a unique phone number matching the configured business number." };
    const db = createAdminClient();
    const oldId = config.meta_phone_number_id || "";
    const { error } = await db.from("whatsapp_gateway_secrets").upsert({ id: "default", meta_phone_number_id: String(match.id), updated_at: new Date().toISOString() });
    if (error) throw error;
    return { repaired: String(match.id) !== oldId, phoneNumberId: String(match.id), displayPhoneNumber: String(match.display_phone_number || ""), verifiedName: String(match.verified_name || "") };
  } catch (err: any) {
    return { repaired: false, reason: err?.message || "Meta self-repair failed." };
  }
}

export async function recordWhatsAppHealthAlert(health: WhatsAppHealth) {
  const db = createAdminClient();
  const title = "WhatsApp gateway is disconnected or unhealthy";

  if (health.connected) {
    const { error } = await db.from("ai_monitor_events")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_note: "Automatically resolved after a successful live WhatsApp health check.",
        details: { provider: health.provider, status: health.status, code: health.code, details: health.details || {} },
      })
      .eq("source", "system")
      .eq("title", title)
      .in("status", ["open", "acknowledged"]);
    if (error) throw error;
    return null;
  }

  if (health.status === "not_configured") return null;
  const { data: existing } = await db.from("ai_monitor_events").select("id").eq("source", "system").eq("title", title).in("status", ["open", "acknowledged"]).limit(1).maybeSingle();
  if (existing) {
    await db.from("ai_monitor_events").update({
      severity: "critical",
      details: { provider: health.provider, status: health.status, error: health.error, code: health.code, details: health.details || {} },
    }).eq("id", existing.id);
    return existing;
  }
  const { data, error } = await db.from("ai_monitor_events").insert({ severity: "critical", source: "system", title, details: { provider: health.provider, status: health.status, error: health.error, code: health.code, details: health.details || {} }, status: "open" }).select("id,severity,source,title,details,status,detected_at").single();
  if (error) throw error;
  return data;
}
