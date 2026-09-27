import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getUserRole, hasRole } from "@/lib/authz";
import { parseMobileTransaction, transactionFingerprint, type MobileCollectedTransaction } from "@/lib/aeps/mobile-collector";

export const runtime = "nodejs";
export const maxDuration = 30;

function getSupabaseConfig() {
  let runtimeEnv: Record<string, unknown> = {};
  try {
    runtimeEnv = (getCloudflareContext().env as Record<string, unknown>) || {};
  } catch {}
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    runtimeEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!url || !key) throw new Error("Supabase environment is not configured.");
  return { url, key };
}

async function getAuthorizedClient(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\\s+/i, "").trim();
  if (!token) return { error: "Missing mobile collector authentication token." as const };

  const { url, key } = getSupabaseConfig();
  const supabase = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return { error: "Mobile collector authentication expired. Sign in again." as const };
  return { supabase, user: data.user };
}

function providerDisplay(code: string, fallback: string) {
  const map: Record<string, string> = {
    csc_digipay: "CSC DigiPay",
    ezeepay: "ezeepay",
    spice_money: "Spice Money",
    fino: "Fino",
  };
  return map[code] || fallback || code;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthorizedClient(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });

    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 403 });
    }

    const body = await request.json();
    const items = Array.isArray(body?.transactions) ? body.transactions : [body];
    if (items.length === 0 || items.length > 100) {
      return NextResponse.json({ success: false, error: "Send between 1 and 100 transactions per batch." }, { status: 400 });
    }

    const accepted: unknown[] = [];
    const duplicates: unknown[] = [];
    const rejected: unknown[] = [];

    for (const item of items) {
      const candidate: MobileCollectedTransaction | null =
        item?.externalTransactionId && item?.amount
          ? {
              portalCode: item.portalCode || "unknown",
              portalName: providerDisplay(item.portalCode || "unknown", item.portalName),
              packageName: String(item.packageName || "unknown"),
              sourceId: item.sourceId || null,
              externalTransactionId: String(item.externalTransactionId),
              externalReference: item.externalReference || null,
              status: String(item.status || "UNKNOWN"),
              transactionType: item.transactionType || "cash_out",
              amount: Number(item.amount),
              fee: item.fee == null ? null : Number(item.fee),
              commission: item.commission == null ? null : Number(item.commission),
              occurredAt: item.occurredAt || item.capturedAt || new Date().toISOString(),
              customerName: item.customerName || null,
              customerMobile: item.customerMobile || null,
              aadhaarLast4: item.aadhaarLast4 || null,
              bankName: item.bankName || null,
              rrn: item.rrn || null,
              screenSource: item.screenSource || "accessibility",
              confidence: Math.max(0, Math.min(1, Number(item.confidence ?? 0.8))),
              rawData: item.rawData && typeof item.rawData === "object" ? item.rawData : {},
            }
          : parseMobileTransaction({
              packageName: String(item?.packageName || ""),
              appLabel: String(item?.appLabel || ""),
              screenText: String(item?.screenText || ""),
              sourceId: item?.sourceId || null,
              capturedAt: item?.capturedAt || new Date().toISOString(),
              screenSource: item?.screenSource || "accessibility",
            });

      if (!candidate || candidate.amount <= 0 || !candidate.externalTransactionId) {
        rejected.push({ reason: "No safe transaction candidate could be extracted.", packageName: item?.packageName || null });
        continue;
      }

      const fingerprint = transactionFingerprint(candidate);
      const { data: existing } = await auth.supabase
        .from("ai_transaction_imports")
        .select("id,state,external_transaction_id")
        .eq("created_by", auth.user.id)
        .eq("fingerprint", fingerprint)
        .maybeSingle();

      if (existing) {
        duplicates.push({ fingerprint, id: existing.id, state: existing.state });
        continue;
      }

      const { data: inserted, error } = await auth.supabase
        .from("ai_transaction_imports")
        .insert({
          created_by: auth.user.id,
          provider_name: candidate.portalName,
          source_type: `android_${candidate.screenSource}`,
          external_transaction_id: candidate.externalTransactionId,
          external_reference: candidate.externalReference || candidate.rrn || null,
          status: candidate.status,
          transaction_type: candidate.transactionType,
          amount: candidate.amount,
          fee: candidate.fee,
          commission: candidate.commission,
          occurred_at: candidate.occurredAt,
          customer_name: candidate.customerName,
          customer_mobile: candidate.customerMobile,
          raw_data: {
            portalCode: candidate.portalCode,
            packageName: candidate.packageName,
            sourceId: candidate.sourceId,
            bankName: candidate.bankName,
            aadhaarLast4: candidate.aadhaarLast4,
            rrn: candidate.rrn,
            screenSource: candidate.screenSource,
            confidence: candidate.confidence,
            ...(candidate.rawData || {}),
          },
          fingerprint,
          state: candidate.status === "SUCCESS" ? "pending" : "needs_review",
          review_note: candidate.status === "SUCCESS"
            ? "Automatically collected from the authenticated mobile portal. Review before posting to the financial ledger."
            : `Portal status is ${candidate.status}; manual review required.`,
        })
        .select("id,provider_name,external_transaction_id,state,created_at")
        .single();

      if (error || !inserted) {
        rejected.push({ fingerprint, reason: error?.message || "Failed to save transaction candidate." });
        continue;
      }

      accepted.push(inserted);
    }

    return NextResponse.json({
      success: true,
      accepted,
      duplicates,
      rejected,
      acceptedCount: accepted.length,
      duplicateCount: duplicates.length,
      rejectedCount: rejected.length,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Mobile collector ingestion failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthorizedClient(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "manager", "staff"])) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 403 });

    const { data, error } = await auth.supabase
      .from("ai_transaction_imports")
      .select("id,provider_name,source_type,external_transaction_id,external_reference,status,transaction_type,amount,fee,commission,occurred_at,customer_name,customer_mobile,raw_data,fingerprint,state,review_note,created_at,updated_at")
      .eq("created_by", auth.user.id)
      .in("state", ["pending", "needs_review"])
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, items: data || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load mobile review queue." }, { status: 500 });
  }
}
