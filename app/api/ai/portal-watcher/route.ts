import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { fetchWebsiteData } from "@/lib/ai/data-collector";
import { extractAmount, extractCommission, extractFee } from "@/lib/scan/extract";

export const runtime = "nodejs";
export const maxDuration = 30;

export type PortalSourcePurpose =
  | "commission"
  | "fee"
  | "aeps_rules"
  | "provider_bank_info"
  | "general_updates";

function normalizePurposeData(purpose: PortalSourcePurpose, text: string) {
  const cleanText = text || "";
  const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let commissionVal: number | null = null;
  let feeVal: number | null = null;
  let summary = "";

  if (purpose === "commission") {
    const rawComm = extractCommission(cleanText) || extractAmount(cleanText);
    if (rawComm) commissionVal = parseFloat(rawComm);
    summary = commissionVal !== null ? `Commission rate: ₹${commissionVal.toFixed(2)}` : "No specific commission slab detected.";
  } else if (purpose === "fee") {
    const rawFee = extractFee(cleanText) || extractAmount(cleanText);
    if (rawFee) feeVal = parseFloat(rawFee);
    summary = feeVal !== null ? `Customer fee: ₹${feeVal.toFixed(2)}` : "No specific customer fee detected.";
  } else if (purpose === "aeps_rules") {
    // Extract rule summary lines
    const ruleLines = lines.filter((l) => /\b(?:rule|guideline|limit|aadhaar|biometric|cw|per\s*day|mandatory)\b/i.test(l));
    summary = ruleLines.slice(0, 3).join("; ") || lines.slice(0, 2).join("; ") || "AEPS operational rules published.";
  } else if (purpose === "provider_bank_info") {
    const bankLines = lines.filter((l) => /\b(?:bank|issuer|downtime|live|status|npci|switch)\b/i.test(l));
    summary = bankLines.slice(0, 3).join("; ") || lines.slice(0, 2).join("; ") || "Provider bank network update.";
  } else {
    summary = lines.slice(0, 3).join("; ") || "General portal notice.";
  }

  return {
    commission: commissionVal,
    fee: feeVal,
    summary: summary.slice(0, 300),
    sampleSnippet: cleanText.slice(0, 400),
  };
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager"])) {
      return NextResponse.json({ error: "Unauthorized: admin or manager role required." }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const action = String(body.action || "test").toLowerCase();
    const rawUrl = String(body.url || "").trim();
    const purpose = (String(body.purpose || "commission") as PortalSourcePurpose);
    const portalId = String(body.portalId || "");
    const portalName = String(body.portalName || "Registered Portal");
    const currentPublished = body.currentPublished || {};

    if (!rawUrl) {
      return NextResponse.json({ error: "Source URL is required." }, { status: 400 });
    }

    // SSRF-protected fetch via verified data-collector
    const webResult = await fetchWebsiteData(rawUrl);

    if (!webResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: webResult.error || "Failed to fetch source URL.",
          url: rawUrl,
        },
        { status: 422 }
      );
    }

    const content = webResult.content || "";
    const normalized = normalizePurposeData(purpose, content);
    const extractedAt = new Date().toISOString();

    if (action === "test") {
      return NextResponse.json({
        success: true,
        action: "test",
        url: rawUrl,
        title: webResult.title || "Portal Source",
        purpose,
        normalized,
        testedAt: extractedAt,
        message: `URL tested successfully. ${normalized.summary}`,
      });
    }

    // Action: collect
    if (action === "collect") {
      // Process independent collection
    }
    // Detect change against currently published value
    let hasDifference = false;
    let oldValStr = "—";
    let newValStr = "—";

    if (purpose === "commission") {
      const oldComm = currentPublished?.commission != null ? Number(currentPublished.commission) : null;
      const newComm = normalized.commission;
      oldValStr = oldComm !== null ? `₹${oldComm.toFixed(2)}` : "None";
      newValStr = newComm !== null ? `₹${newComm.toFixed(2)}` : "None";
      if (newComm !== null && (oldComm === null || Math.abs(oldComm - newComm) >= 0.01)) {
        hasDifference = true;
      }
    } else if (purpose === "fee") {
      const oldFee = currentPublished?.fee != null ? Number(currentPublished.fee) : null;
      const newFee = normalized.fee;
      oldValStr = oldFee !== null ? `₹${oldFee.toFixed(2)}` : "None";
      newValStr = newFee !== null ? `₹${newFee.toFixed(2)}` : "None";
      if (newFee !== null && (oldFee === null || Math.abs(oldFee - newFee) >= 0.01)) {
        hasDifference = true;
      }
    } else {
      oldValStr = currentPublished?.summary || "Initial baseline";
      newValStr = normalized.summary;
      if (newValStr && newValStr !== oldValStr) {
        hasDifference = true;
      }
    }

    return NextResponse.json({
      success: true,
      action: "collect",
      portalId,
      portalName,
      url: rawUrl,
      purpose,
      extractedAt,
      hasDifference,
      oldValue: oldValStr,
      newValue: newValStr,
      normalizedData: {
        commission: normalized.commission,
        fee: normalized.fee,
        summary: normalized.summary,
      },
      // Never overwrite production automatically: must stay under operator review
      reviewRequired: hasDifference,
      status: hasDifference ? "pending_review" : "current",
      message: hasDifference
        ? `Difference detected for ${portalName} (${purpose}). Queued for operator review.`
        : `Verified up to date with currently published values for ${portalName}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error in portal watcher." },
      { status: 500 }
    );
  }
}
