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
  repairKind?: "meta_phone_number_id";
};

export async function diagnoseApplication(supabase: SupabaseClient<any, any, any>): Promise<{ findings: SelfHealingFinding[]; scannedAt: string }> {
  const findings: SelfHealingFinding[] = [];
  const scannedAt = new Date().toISOString();

  const whatsapp = await checkWhatsAppHealth();
  if (whatsapp.status === "disconnected") {
    findings.push({
      id: "whatsapp-disconnected",
      severity: "critical",
      area: "WhatsApp",
      title: "WhatsApp integration is disconnected or unhealthy",
      evidence: whatsapp.error || `Provider ${whatsapp.provider || "unknown"} reported ${whatsapp.status}.`,
      recommendation: whatsapp.provider === "meta"
        ? "Re-resolve the configured Meta WABA phone number ID, then verify the Graph API connection."
        : "Check the configured WhatsApp provider and its gateway credentials/health endpoint.",
      autoFixable: whatsapp.provider === "meta",
      repairKind: whatsapp.provider === "meta" ? "meta_phone_number_id" : undefined,
    });
  } else if (whatsapp.status === "unknown") {
    findings.push({ id: "whatsapp-unknown", severity: "high", area: "WhatsApp", title: "WhatsApp health could not be verified", evidence: whatsapp.error || "The provider did not return a conclusive health state.", recommendation: "Review provider configuration and connectivity before making changes.", autoFixable: false });
  }

  const [negativeStock, invalidPrices, audit] = await Promise.all([
    supabase.from("products").select("id,name,stock_qty,reorder_level").eq("is_active", true).lt("stock_qty", 0).limit(50),
    supabase.from("products").select("id,name,sale_price").eq("is_active", true).or("sale_price.is.null,sale_price.lt.0").limit(50),
    supabase.from("audit_runs").select("id,audit_score,status,total_findings,critical_count,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (negativeStock.error) findings.push({ id: "stock-check-failed", severity: "medium", area: "Inventory", title: "Inventory integrity check failed", evidence: negativeStock.error.message, recommendation: "Run the inventory/self-audit tools before changing any stock values.", autoFixable: false });
  else if ((negativeStock.data ?? []).length) findings.push({ id: "negative-stock", severity: "high", area: "Inventory", title: "Negative stock detected", evidence: `${negativeStock.data!.length} active product(s) have stock below zero.`, recommendation: "Trace the related inventory movements and correct the underlying transaction rather than silently overwriting stock.", autoFixable: false });

  if (invalidPrices.error) findings.push({ id: "price-check-failed", severity: "medium", area: "Catalog", title: "Catalog price integrity check failed", evidence: invalidPrices.error.message, recommendation: "Review catalog permissions/schema before changing prices.", autoFixable: false });
  else if ((invalidPrices.data ?? []).length) findings.push({ id: "invalid-prices", severity: "high", area: "Catalog", title: "Invalid active product prices detected", evidence: `${invalidPrices.data!.length} active product(s) have a null or negative sale price.`, recommendation: "Review each catalog record; never guess a replacement price.", autoFixable: false });

  if (audit.data && Number((audit.data as any).critical_count || 0) > 0) findings.push({ id: "audit-critical", severity: "critical", area: "Self-audit", title: "Latest self-audit contains critical findings", evidence: `${Number((audit.data as any).critical_count)} critical finding(s) in the latest audit run.`, recommendation: "Inspect the audit findings and apply a specific approved repair rather than making broad database changes.", autoFixable: false });

  return { findings, scannedAt };
}
