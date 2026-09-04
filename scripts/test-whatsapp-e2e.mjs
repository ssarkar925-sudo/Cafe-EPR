import { createAdminClient } from "../lib/supabase/admin.ts";
import { getServerWhatsAppConfig, sendWhatsAppViaConfig } from "../lib/whatsapp-sender.ts";

const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exitCode = 1;
};

async function main() {
  console.log("🔍 Checking ERP WhatsApp Configuration & Connectivity...");

  try {
    const config = await getServerWhatsAppConfig();
    console.log(`Active Provider: ${config.provider.toUpperCase()}`);
    console.log(`Display Phone:   ${config.meta_display_phone_number || "None"}`);
    console.log(`WABA ID:         ${config.meta_waba_id || "None"}`);
    console.log(`Phone Number ID: ${config.meta_phone_number_id || "None"}`);
    console.log(`Token Present:   ${Boolean(config.meta_access_token)}`);

    if (config.provider === "meta") {
      if (!config.meta_access_token || !config.meta_phone_number_id) {
        throw new Error("Meta access token or phone number ID missing from secure storage.");
      }

      // Check Meta Graph API connectivity
      const graphRes = await fetch(
        `https://graph.facebook.com/v21.0/${config.meta_phone_number_id}?fields=id,verified_name,display_phone_number,code_verification_status,status,quality_rating`,
        {
          headers: { Authorization: `Bearer ${config.meta_access_token}` },
        }
      );

      if (!graphRes.ok) {
        const errJson = await graphRes.json().catch(() => ({}));
        throw new Error(`Meta API error: ${errJson?.error?.message || graphRes.statusText}`);
      }

      const metaInfo = await graphRes.json();
      console.log(`\n📱 Live Meta Number Details:`);
      console.log(`- Verified Name:        ${metaInfo.verified_name || "N/A"}`);
      console.log(`- Display Phone:        ${metaInfo.display_phone_number || "N/A"}`);
      console.log(`- Verification Status:  ${metaInfo.code_verification_status}`);
      console.log(`- Meta Phone Status:    ${metaInfo.status}`);
      console.log(`- Quality Rating:       ${metaInfo.quality_rating}`);

      if (metaInfo.code_verification_status === "VERIFIED" && metaInfo.status === "CONNECTED") {
        console.log("\n✅ Phone number is fully verified and connected for live WhatsApp delivery!");
      } else {
        console.log("\n⚠️ Notice: Phone number is pending 1-time SMS/Voice verification in Meta WhatsApp Manager.");
        console.log(`👉 Verification URL: https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=2078690092683215&waba_id=${config.meta_waba_id}`);
      }

      const testTo = process.env.WHATSAPP_TEST_TO;
      if (testTo) {
        console.log(`\n📤 Attempting test message to ${testTo}...`);
        const sendResult = await sendWhatsAppViaConfig(
          testTo,
          process.env.WHATSAPP_TEST_MESSAGE || "Test message from Sarkar Cafe ERP",
          config
        );
        if (sendResult.success) {
          console.log(`✅ Test message sent successfully! ID: ${sendResult.messageId}`);
        } else {
          console.log(`⚠️ Send result: ${sendResult.error}`);
        }
      } else {
        console.log("\n💡 (Set WHATSAPP_TEST_TO to a phone number to test direct delivery)");
      }
    } else if (config.provider === "local_gateway") {
      const base = config.gateway_url || "http://localhost:3001";
      console.log(`Checking local gateway at ${base}...`);
      const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
      const state = await health.json();
      console.log(`Gateway Status: ${state.status}, Connected: ${state.connected}`);
    } else {
      console.log("ℹ️ WhatsApp provider is set to:", config.provider);
    }
    console.log("\n🎉 WhatsApp integration health check completed successfully.");
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
