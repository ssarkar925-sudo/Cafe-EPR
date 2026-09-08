import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { checkWhatsAppHealth, recordWhatsAppHealthAlert, repairMetaPhoneNumberId } from "@/lib/whatsapp-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CONNECT_PATTERN = /\b(connect|reconnect|repair|fix|restore)\b/i;

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "WhatsApp status";

  let health = await checkWhatsAppHealth();
  let repair: any = null;

  if (!health.connected && CONNECT_PATTERN.test(message) && role === "admin" && health.provider === "meta") {
    repair = await repairMetaPhoneNumberId();
    if (repair?.repaired || repair?.phoneNumberId) health = await checkWhatsAppHealth();
  }

  if (!health.connected && health.status !== "not_configured") {
    await recordWhatsAppHealthAlert(health).catch((error) => console.error("[AI WhatsApp] alert recording failed", error));
  }

  const providerLabel = health.provider === "meta" ? "Meta Cloud API" : health.provider === "local_gateway" ? "Local WhatsApp Gateway" : health.provider === "ultramsg" ? "UltraMsg" : health.provider;
  let messageText = "";
  if (health.connected) {
    const details = health.details || {};
    messageText = `✓ WhatsApp is connected through ${providerLabel}.${details.displayPhoneNumber ? ` Business number: ${details.displayPhoneNumber}.` : ""}${details.qualityRating ? ` Quality rating: ${details.qualityRating}.` : ""}`;
    if (repair?.repaired) messageText = `✓ I repaired the stored Meta Phone Number ID and verified WhatsApp is connected through ${providerLabel}.`;
  } else if (health.status === "not_configured") {
    messageText = `⚠️ WhatsApp is not configured. ${health.error || "Open WhatsApp settings and complete the gateway configuration."}`;
  } else if (health.status === "disconnected") {
    messageText = `🚨 WhatsApp is disconnected or unhealthy. ${health.error || "The gateway did not report a healthy connection."}`;
    if (repair && !repair.repaired) messageText += ` I attempted the safe Meta self-repair, but it could not restore the connection: ${repair.reason || "manual verification is required"}.`;
    if (health.provider === "meta") messageText += " Meta Cloud API has no phone-session QR to reconnect; if the access token or phone registration is invalid, the owner must correct that credential/registration in WhatsApp Manager.";
  } else {
    messageText = `⚠️ WhatsApp status could not be confirmed: ${health.error || "the provider did not respond."}`;
  }

  return NextResponse.json({ message: messageText, mode: "whatsapp-health", connected: health.connected, status: health.status, provider: health.provider, repair });
}
