import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_TEMPLATES, type WhatsAppProvider } from "@/lib/whatsapp-shared";

const DEFAULT_CLOUD_GATEWAY = "https://sccomm-whatsapp-gateway.onrender.com";

export async function GET(req: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(req.url);
    const checkLive = searchParams.get("check_live") === "1";

    let db: any = null;
    try {
      db = createAdminClient();
    } catch {}
    const userClient = await createClient();
    const client = db || userClient;

    let row: any = null;
    let secrets: any = null;
    let settingsRow: any = null;

    try {
      const [{ data: r }, sRes, { data: stRow }] = await Promise.all([
        client.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
        db ? db.from("whatsapp_gateway_secrets").select("provider, gateway_url, meta_access_token, meta_phone_number_id, waba_id, verify_token").eq("id", "default").maybeSingle() : Promise.resolve({ data: null }),
        client.from("settings").select("whatsapp_config").limit(1).maybeSingle(),
      ]);
      row = r;
      secrets = sRes?.data;
      settingsRow = stRow;
    } catch {
      const [{ data: uRow }, { data: stRow }] = await Promise.all([
        userClient.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle(),
        userClient.from("settings").select("whatsapp_config").limit(1).maybeSingle(),
      ]);
      row = uRow;
      settingsRow = stRow;
    }

    const config = row?.config || settingsRow?.whatsapp_config || {};
    const phoneId = secrets?.meta_phone_number_id || config.meta_phone_number_id || "";
    const wabaId = secrets?.waba_id || config.meta_waba_id || row?.meta_waba_id || "";
    const token = secrets?.meta_access_token;

    // Smart provider resolution: prefer explicitly saved provider from secrets or config;
    // if neither exists or is "off" but gateway_url is configured, keep local_gateway active!
    let provider: WhatsAppProvider = (secrets?.provider || config.provider || settingsRow?.whatsapp_config?.provider) as WhatsAppProvider;
    if (!provider || provider === "off") {
      // Default to local_gateway so 24/7 Render gateway is active by default
      provider = "local_gateway";
    }

    const gatewayUrl = config.gateway_url || secrets?.gateway_url || settingsRow?.whatsapp_config?.gateway_url || DEFAULT_CLOUD_GATEWAY;

    let metaLive: any = null;
    if (checkLive && phoneId && token) {
      try {
        const [phoneRes, wabaRes, meRes] = await Promise.all([
          fetch(
            `https://graph.facebook.com/v21.0/${phoneId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,status`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
          wabaId
            ? fetch(
                `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,account_review_status,business_verification_status,owner_business_info`,
                { headers: { Authorization: `Bearer ${token}` } }
              )
            : Promise.resolve(null),
          fetch(`https://graph.facebook.com/v21.0/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const phoneData = phoneRes.ok
          ? await phoneRes.json()
          : await phoneRes.json().catch(() => ({ error: "Phone query failed" }));
        const wabaData = wabaRes && wabaRes.ok ? await wabaRes.json().catch(() => null) : null;
        const meData = meRes.ok ? await meRes.json().catch(() => null) : null;

        const businessId = wabaData?.owner_business_info?.id || "2078690092683215";
        const targetWabaId = wabaId || "448036473626878";
        const directVerifyUrl = `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=${businessId}&asset_id=${targetWabaId}&waba_id=${targetWabaId}`;

        metaLive = {
          ...phoneData,
          waba_name: wabaData?.name,
          account_review_status: wabaData?.account_review_status,
          business_verification_status: wabaData?.business_verification_status,
          business_id: businessId,
          business_name: wabaData?.owner_business_info?.name,
          system_user: meData?.name,
          direct_verify_url: directVerifyUrl,
          token_valid: Boolean(meData?.id || phoneRes.ok),
        };
      } catch (liveErr: any) {
        metaLive = { error: liveErr?.message || "Failed to reach Meta servers" };
      }
    }

    return NextResponse.json({
      provider,
      gateway_url: gatewayUrl,
      meta_phone_number_id: phoneId,
      meta_waba_id: wabaId,
      meta_app_id: config.meta_app_id || "",
      meta_display_phone_number: config.meta_display_phone_number || row?.meta_display_phone_number || metaLive?.display_phone_number || "917003037208",
      meta_access_token_set: Boolean(token),
      meta_verify_token: secrets?.verify_token || "SarkarCafe_WA_Verify_9K7mX4_2026",
      meta_live: metaLive,
      automations: { ...DEFAULT_AUTOMATIONS, ...(config.automations || {}) },
      configured: true,
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
    let db: any = null;
    try {
      db = createAdminClient();
    } catch {}
    const userClient = await createClient();
    const client = db || userClient;

    let existing: any = null;
    try {
      const { data: exRow } = await client.from("whatsapp_templates").select("config, templates").eq("id", "default").maybeSingle();
      existing = exRow;
    } catch {}
    
    const phoneId = String(body.meta_phone_number_id || "").trim();
    const wabaId = String(body.meta_waba_id || "").trim();
    const appId = String(body.meta_app_id || "").trim();
    const displayPhone = String(body.meta_display_phone_number || "").trim();
    const gatewayUrl = String(body.gateway_url || DEFAULT_CLOUD_GATEWAY).trim();

    const config = {
      ...(existing?.config || {}),
      provider,
      gateway_url: gatewayUrl,
      meta_phone_number_id: phoneId,
      meta_waba_id: wabaId,
      meta_app_id: appId,
      meta_display_phone_number: displayPhone,
      automations: { ...DEFAULT_AUTOMATIONS, ...(body.automations || {}) },
    };
    delete config.meta_access_token;
    delete config.gateway_api_key;
    delete config.ultramsg_token;

    const payload = {
      id: "default",
      templates: existing?.templates || DEFAULT_WA_TEMPLATES,
      config,
      updated_at: new Date().toISOString(),
    };

    // 1. Persist to whatsapp_templates with onConflict
    if (db) {
      try {
        await db.from("whatsapp_templates").upsert(payload, { onConflict: "id" });
      } catch {}
    }
    try {
      await userClient.from("whatsapp_templates").upsert(payload, { onConflict: "id" });
    } catch {}

    // 2. Persist to whatsapp_gateway_secrets (provider, gateway_url, tokens)
    const secretPatch: Record<string, string> = { provider, gateway_url: gatewayUrl };
    if (phoneId) secretPatch.meta_phone_number_id = phoneId;
    if (wabaId) secretPatch.waba_id = wabaId;
    if (body.meta_access_token) secretPatch.meta_access_token = String(body.meta_access_token).trim();

    if (db) {
      try {
        await db.from("whatsapp_gateway_secrets").upsert({
          id: "default",
          ...secretPatch,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
      } catch {}
    }

    // 3. Persist to settings table as resilient multi-layer backup
    try {
      await client.from("settings").update({
        whatsapp_config: config,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
    } catch {}

    return NextResponse.json({
      success: true,
      provider,
      gateway_url: gatewayUrl,
      config,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not save WhatsApp configuration" }, { status: 500 });
  }
}
