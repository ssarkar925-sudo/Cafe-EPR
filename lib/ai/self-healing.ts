import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhatsAppHealth } from "@/lib/whatsapp-health";

export type SelfHealingFinding = {
  id: string;
  severity: "critical" | "high" | "medium" | "info";
  area: string;
  title: string;
  evidence: string;
  recommendation: string;
  autoFixable: boolean;
  repairBlocker?: string;
  repairKind?: "meta_phone_number_id" | "local_gateway_reconnect";
  actionUrl?: string;
};

export async function diagnoseApplication(supabase: SupabaseClient<any, any, any>): Promise<{ findings: SelfHealingFinding[]; scannedAt: string }> {
  const findings: SelfHealingFinding[] = [];
  const scannedAt = new Date().toISOString();

  const whatsapp = await checkWhatsAppHealth();
  if (whatsapp.status === "disconnected") {
    const isMeta = whatsapp.provider === "meta";
    const isLocalGateway = whatsapp.provider === "local_gateway";
    const isUltraMsg = whatsapp.provider === "ultramsg";
    const gatewayReachable = isLocalGateway && whatsapp.code === 200;
    const waitingForQr = Boolean(whatsapp.details?.waitingForQr);
    const reconnectSupported = Boolean(whatsapp.details?.reconnectSupported);
    const localExecutable = isLocalGateway && gatewayReachable && reconnectSupported && !waitingForQr;
    const gatewayUrl = typeof whatsapp.details?.gatewayUrl === "string" ? String(whatsapp.details.gatewayUrl) : undefined;
    findings.push({
      id: "whatsapp-disconnected",
      severity: "critical",
      area: "WhatsApp",
      title: "WhatsApp integration is disconnected or unhealthy",
      evidence: whatsapp.error || `Provider ${whatsapp.provider || "unknown"} reported ${whatsapp.status}.`,
      recommendation: isMeta
        ? "Resolve the configured Meta WABA phone number ID against the WABA phone-number list, persist the unique match, then re-check the Graph API connection."
        : isLocalGateway
          ? waitingForQr
            ? "The local WhatsApp gateway is running but the saved WhatsApp session is waiting for QR pairing. Open the gateway dashboard and scan the QR from WhatsApp → Linked Devices; AI cannot perform the phone-side scan."
            : localExecutable
              ? "Restart the CafeERP WhatsApp gateway using its supported recovery endpoint, preserve the existing authentication files, then re-run the health check. If the saved session is invalid, the gateway will expose a fresh QR instead of deleting credentials automatically."
              : "Restore connectivity to the configured WhatsApp gateway, then re-run its /health check and confirm connected=true before sending messages."
          : isUltraMsg
            ? "Reconnect/authenticate the configured UltraMsg instance, then re-run the instance status check until it reports authenticated."
            : "Identify the configured WhatsApp provider and its supported reconnect/authentication procedure, then re-run the health check.",
      autoFixable: isMeta || localExecutable,
      repairKind: isMeta ? "meta_phone_number_id" : localExecutable ? "local_gateway_reconnect" : undefined,
      actionUrl: isLocalGateway && waitingForQr ? gatewayUrl : undefined,
      repairBlocker: isMeta || localExecutable
        ? undefined
        : isLocalGateway
          ? waitingForQr
            ? "The gateway needs a human phone-side QR scan. AI can start/restart the gateway, but it cannot approve or perform the WhatsApp Linked Device scan on your phone."
            : "The configured gateway is not the CafeERP gateway with a verified recovery contract, so AI will not invent a restart endpoint or change credentials."
          : isUltraMsg
            ? "Re-authentication requires the provider session and cannot be safely invented by the ERP."
            : "No safe provider-specific repair operation is configured for this provider.",
    });
  } else if (whatsapp.status === "unknown") {
    findings.push({
      id: "whatsapp-unknown",
      severity: "high",
      area: "WhatsApp",
      title: "WhatsApp health could not be verified",
      evidence: whatsapp.error || "The provider did not return a conclusive health state.",
      recommendation: "Retry the provider health check, inspect the returned transport/authentication error, and only then select a provider-specific repair.",
      autoFixable: false,
      repairBlocker: "The health probe did not establish a safe root cause for an automatic repair.",
    });
  }

  const [negativeStock, invalidPrices, audit] = await Promise.all([
    supabase.from("products").select("id,name,stock_qty,reorder_level").eq("is_active", true).lt("stock_qty", 0).limit(50),
    supabase.from("products").select("id,name,sale_price").eq("is_active", true).or("sale_price.is.null,sale_price.lt.0").limit(50),
    supabase.from("audit_runs").select("id,audit_score,status,total_findings,critical_count,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (negativeStock.error) findings.push({ id: "stock-check-failed", severity: "medium", area: "Inventory", title: "Inventory integrity check failed", evidence: negativeStock.error.message, recommendation: "Trace the related inventory movements and correct the underlying transaction rather than silently overwriting stock values.", autoFixable: false, repairBlocker: "The check itself failed, so changing inventory values would be unsafe." });
  else if ((negativeStock.data ?? []).length) findings.push({ id: "negative-stock", severity: "high", area: "Inventory", title: "Negative stock detected", evidence: `${negativeStock.data!.length} active product(s) have stock below zero.`, recommendation: "Trace the related inventory movements, identify the transaction that caused the negative balance, and repair that transaction with an approved accounting-safe correction.", autoFixable: false, repairBlocker: "A replacement stock value cannot be inferred safely from the current evidence." });

  if (invalidPrices.error) findings.push({ id: "price-check-failed", severity: "medium", area: "Catalog", title: "Catalog price integrity check failed", evidence: invalidPrices.error.message, recommendation: "Review catalog permissions/schema before changing prices.", autoFixable: false, repairBlocker: "The catalog check failed; no trustworthy replacement price is available." });
  else if ((invalidPrices.data ?? []).length) findings.push({ id: "invalid-prices", severity: "high", area: "Catalog", title: "Invalid active product prices detected", evidence: `${invalidPrices.data!.length} active product(s) have a null or negative sale price.`, recommendation: "Review each affected catalog record and restore its approved business price; never guess a replacement price.", autoFixable: false, repairBlocker: "The correct business price cannot be inferred safely." });

  if (audit.data && Number((audit.data as any).critical_count || 0) > 0) findings.push({ id: "audit-critical", severity: "critical", area: "Self-audit", title: "Latest self-audit contains critical findings", evidence: `${Number((audit.data as any).critical_count)} critical finding(s) in the latest audit run.`, recommendation: "Open the specific audit findings, determine the affected transaction/configuration, and apply a targeted approved repair rather than making broad database changes.", autoFixable: false, repairBlocker: "The aggregate audit result does not identify one safe corrective mutation." });

  return { findings, scannedAt };
}
