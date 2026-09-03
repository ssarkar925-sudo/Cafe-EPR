import { NextResponse } from "next/server";
import crypto from "crypto";
import { getUserRole, hasRole } from "@/lib/authz";
import { createSecretsAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_WABA_ID = "448036473626878";

function envFirst(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" } });
}
function digits(value: string) { return String(value || "").replace(/\D/g, ""); }
function appSecretProof(token: string, appSecret: string) {
  return crypto.createHmac("sha256", appSecret).update(token).digest("hex");
}

async function graphRequest(url: string, token: string, appSecret: string, init?: RequestInit) {
  const u = new URL(url);
  u.searchParams.set("appsecret_proof", appSecretProof(token, appSecret));
  return fetch(u.toString(), {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) return json({ error: "Only administrators can complete WhatsApp onboarding." }, 403);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const requestedWabaId = String(body.waba_id || "").trim();
    const requestedPhoneId = String(body.phone_number_id || "").trim();
    if (!code || code.length < 20 || code.length > 4096) return json({ error: "Invalid or missing Meta Embedded Signup authorization code." }, 400);

    const db = createSecretsAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_app_secret, meta_phone_number_id").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;

    const config = row?.config || {};
    const appId = String(config.meta_app_id || envFirst("META_APP_ID", "NEXT_PUBLIC_META_APP_ID") || "").trim();
    const appSecret = String(secrets?.meta_app_secret || envFirst("META_APP_SECRET", "Meta_App_Secret") || "").trim();
    const graphVersion = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
    if (!appId) return json({ error: "Meta App ID is not configured. Save the non-secret App ID in WhatsApp settings or set META_APP_ID." }, 400);
    if (!appSecret) return json({ error: "Meta App Secret is not configured on the server." }, 400);

    const exchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    exchangeUrl.searchParams.set("client_id", appId);
    exchangeUrl.searchParams.set("client_secret", appSecret);
    exchangeUrl.searchParams.set("code", code);
    const exchangeResponse = await fetch(exchangeUrl.toString(), { method: "GET", cache: "no-store" });
    const exchangePayload = await exchangeResponse.json().catch(() => ({}));
    if (!exchangeResponse.ok || !exchangePayload?.access_token) {
      const meta = exchangePayload?.error;
      return json({ error: meta?.message || `Meta authorization-code exchange failed (HTTP ${exchangeResponse.status})`, meta_error_code: meta?.code, meta_error_type: meta?.type }, exchangeResponse.status >= 400 && exchangeResponse.status < 500 ? exchangeResponse.status : 502);
    }

    const businessToken = String(exchangePayload.access_token).trim();
    let wabaId = requestedWabaId;
    if (!/^\d{10,30}$/.test(wabaId)) {
      const appAccessToken = `${appId}|${appSecret}`;
      const debugUrl = new URL(`https://graph.facebook.com/${graphVersion}/debug_token`);
      debugUrl.searchParams.set("input_token", businessToken);
      const debugResponse = await fetch(debugUrl.toString(), { headers: { Authorization: `Bearer ${appAccessToken}` }, cache: "no-store" });
      const debugPayload = await debugResponse.json().catch(() => ({}));
      const granular = Array.isArray(debugPayload?.data?.granular_scopes) ? debugPayload.data.granular_scopes : [];
      const scopedIds = granular.flatMap((scope: any) => Array.isArray(scope?.target_ids) ? scope.target_ids : []).map((id: any) => String(id));
      const fallbackIds = scopedIds.filter((id: string) => /^\d{10,30}$/.test(id));
      wabaId = fallbackIds[0] || "";
      if (!wabaId) return json({ error: "Meta completed the signup but did not return a WABA ID. Retry the connection from the WhatsApp Business App onboarding button.", meta_debug: debugPayload?.data?.is_valid === false ? "The returned authorization token is not valid." : undefined }, 409);
    }

    const phoneUrl = `https://graph.facebook.com/${graphVersion}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app&limit=100`;
    const phoneResponse = await graphRequest(phoneUrl, businessToken, appSecret);
    const phonePayload = await phoneResponse.json().catch(() => ({}));
    if (!phoneResponse.ok) {
      const meta = phonePayload?.error;
      return json({ error: meta?.message || `Meta phone-number discovery failed (HTTP ${phoneResponse.status})`, meta_error_code: meta?.code, meta_error_type: meta?.type }, phoneResponse.status >= 400 && phoneResponse.status < 500 ? phoneResponse.status : 502);
    }
    const phones = Array.isArray(phonePayload?.data) ? phonePayload.data : [];
    const configuredPhone = digits(String(config.meta_display_phone_number || ""));
    const match = phones.find((item: any) => {
      const id = String(item?.id || "").trim();
      const phone = digits(String(item?.display_phone_number || ""));
      return (requestedPhoneId && id === requestedPhoneId) || (configuredPhone && phone === configuredPhone);
    }) || (phones.length === 1 ? phones[0] : null);
    if (!match?.id) return json({ error: "Meta connected the WhatsApp Business Account, but Cafe-EPR could not uniquely identify the business phone number. Open WhatsApp settings, set the business number, and retry." }, 409);

    const phoneId = String(match.id).trim();
    const phoneDetails = await graphRequest(`https://graph.facebook.com/${graphVersion}/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,is_on_biz_app`, businessToken, appSecret);
    const phoneDetailsPayload = await phoneDetails.json().catch(() => ({}));
    const details = phoneDetails.ok ? phoneDetailsPayload : match;
    const isOnBusinessApp = Boolean(details?.is_on_biz_app) || String(details?.platform_type || "").toUpperCase() === "ON_PREMISE";

    const subscribeResponse = await graphRequest(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, businessToken, appSecret, { method: "POST" });
    const subscribePayload = await subscribeResponse.json().catch(() => ({}));
    if (!subscribeResponse.ok) {
      const meta = subscribePayload?.error;
      return json({ error: meta?.message || `Meta webhook subscription failed (HTTP ${subscribeResponse.status})`, meta_error_code: meta?.code, meta_error_type: meta?.type }, subscribeResponse.status >= 400 && subscribeResponse.status < 500 ? subscribeResponse.status : 502);
    }

    const existingToken = String(secrets?.meta_access_token || "").trim();
    const mergedConfig = {
      ...config,
      provider: "meta",
      meta_waba_id: wabaId,
      meta_display_phone_number: String(details?.display_phone_number || match?.display_phone_number || config.meta_display_phone_number || "").trim(),
      meta_embedded_signup_connected_at: new Date().toISOString(),
      meta_embedded_signup_mode: isOnBusinessApp ? "coexistence" : "cloud_api",
    };
    const { error: configError } = await db.from("whatsapp_templates").upsert({ id: "default", config: mergedConfig, templates: row?.templates || {}, updated_at: new Date().toISOString() });
    if (configError) throw configError;

    const secretPatch: Record<string, string> = { id: "default", meta_phone_number_id: phoneId, updated_at: new Date().toISOString() };
    if (!existingToken) secretPatch.meta_access_token = businessToken;
    const { error: secretUpdateError } = await db.from("whatsapp_gateway_secrets").upsert(secretPatch);
    if (secretUpdateError) throw secretUpdateError;

    return json({
      success: true,
      waba_id: wabaId,
      phone_number_id: phoneId,
      display_phone_number: String(details?.display_phone_number || match?.display_phone_number || ""),
      verified_name: String(details?.verified_name || match?.verified_name || ""),
      platform_type: String(details?.platform_type || match?.platform_type || "").toUpperCase(),
      is_on_biz_app: isOnBusinessApp,
      coexistence: isOnBusinessApp,
      subscribed: true,
      operational_token_preserved: Boolean(existingToken),
    });
  } catch (err: any) {
    return json({ error: err?.message || "Could not complete Meta Embedded Signup." }, 500);
  }
}
