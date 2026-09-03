import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppProvider } from "@/lib/whatsapp-shared";

export async function GET(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const checkLive = searchParams.get("check_live") === "1";

    const db = createAdminClient();
    const [{ data: row, error: rowError }, { data: secrets, error: secretError }] = await Promise.all([
      db.from("whatsapp_templates").select("config, templates, meta_waba_id, meta_display_phone_number").eq("id", "default").maybeSingle(),
      db.from("whatsapp_gateway_secrets").select("meta_access_token, meta_phone_number_id, waba_id, gateway_api_key, ultramsg_token, ultramsg_instance_id, verify_token").eq("id", "default").maybeSingle(),
    ]);
    if (rowError) throw rowError;
    if (secretError) throw secretError;
    const config = row?.config || {};
    const phoneId = secrets?.meta_phone_number_id || config.meta_phone_number_id || "";
    const wabaId = secrets?.waba_id || config.meta_waba_id || row?.meta_waba_id || "";
    const token = secrets?.meta_access_token;

    let metaLive: any = null;
    if (checkLive && phoneId && token) {
      try {
        const liveRes = await fetch(
          `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (liveRes.ok) {
          metaLive = await liveRes.json();
        } else {
          const errData = await liveRes.json().catch(() => ({}));
          metaLive = { error: errData?.error?.message || "Could not query Meta API" };
        }
      } catch (liveErr: any) {
        metaLive = { error: liveErr?.message || "Failed to reach Meta servers" };
      }
    }

    return NextResponse.json({
      provider: config.provider || "off",
      gateway_url: config.gateway_url || "",
      meta_phone_number_id: phoneId,
      meta_waba_id: wabaId,
      meta_app_id: config.meta_app_id || "",
      meta_display_phone_number: config.meta_display_phone_number || row?.meta_display_phone_number || metaLive?.display_phone_number || "",
      meta_access_token_set: Boolean(token),
      meta_verify_token: secrets?.verify_token || "SarkarCafe_WA_Verify_9K7mX4_2026",
      meta_live: metaLive,
      automations: { ...DEFAULT_AUTOMATIONS, ...(config.automations || {}) },
      configured: Boolean(token && phoneId),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load WhatsApp configuration" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin"])) return NextResponse.json({ error: "Only administrators can change WhatsApp configuration." }, { status: 403 });
    const body = await req.json();
    const provider = body.provider as WhatsAppProvider;
    if (!["off", "meta", "local_gateway", "ultramsg"].includes(provider)) return NextResponse.json({ error: "Invalid WhatsApp provider." }, { status: 400 });
    const db = createAdminClient();
    const { data: existing } = await db.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle();
    
    const phoneId = String(body.meta_phone_number_id || "").trim();
    const wabaId = String(body.meta_waba_id || "").trim();
    const appId = String(body.meta_app_id || "").trim();
    const displayPhone = String(body.meta_display_phone_number || "").trim();

    const config = {
      ...(existing?.config || {}),
      provider,
      gateway_url: body.gateway_url || "",
      meta_phone_number_id: phoneId,
      meta_waba_id: wabaId,
      meta_app_id: appId,
      meta_display_phone_number: displayPhone,
      automations: { ...DEFAULT_AUTOMATIONS, ...(body.automations || {}) },
    };
    delete config.meta_access_token;
    delete config.gateway_api_key;
    delete config.ultramsg_token;

    const { error: configError } = await db.from("whatsapp_templates").upsert({
      id: "default",
      templates: existing?.templates || DEFAULT_WA_TEMPLATES,
      config,
      meta_waba_id: wabaId || undefined,
      meta_display_phone_number: displayPhone || undefined,
      updated_at: new Date().toISOString(),
    });
    if (configError) throw configError;

    const secretPatch: Record<string, string> = { provider };
    if (phoneId) secretPatch.meta_phone_number_id = phoneId;
    if (wabaId) secretPatch.waba_id = wabaId;
    if (body.meta_access_token) secretPatch.meta_access_token = String(body.meta_access_token).trim();

    if (Object.keys(secretPatch).length) {
      const { error } = await db.from("whatsapp_gateway_secrets").upsert({
        id: "default",
        ...secretPatch,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not save WhatsApp configuration" }, { status: 500 });
  }
}
