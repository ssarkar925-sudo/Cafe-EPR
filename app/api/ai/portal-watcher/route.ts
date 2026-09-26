import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { fetchWebsiteData } from "@/lib/ai/data-collector";
import { extractAmount, extractCommission, extractFee, extractReference } from "@/lib/scan/extract";
import {
  type PortalSourcePurpose,
  type PortalWatcherSource,
  type SourceConfidenceStatus,
  type PortalCollectionObservation,
  type PortalCollectionRun,
  type PortalChangeRecord,
  type AepsPricingRule,
  type AepsTxnType,
  normalizeTransactionType,
  normalizeRuleTransactionType,
  crossVerifySourceObservations,
  getDefaultWatcherSources,
  getDefaultAepsPricingRules,
  matchBankExactName,
  validatePortalSourceUrl,
  VALID_PORTAL_PURPOSES,
} from "@/lib/aeps/portal-watcher";

export const runtime = "nodejs";
export const maxDuration = 45;

function extractRateSlabs(
  text: string,
  label: "fee" | "commission"
): { minAmount: number; maxAmount: number | null; value: number; label: "fee" | "commission" }[] {
  const slabs: { minAmount: number; maxAmount: number | null; value: number; label: "fee" | "commission" }[] = [];
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const range = line.match(/(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*)\s*(?:-|–|—|to)\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*)/i);
    if (!range || range.index == null) continue;

    const suffix = line.slice(range.index + range[0].length);
    const valueMatch =
      suffix.match(/(?:₹|Rs\.?|INR|fee|charge|commission|comm)\s*[:=\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
      line.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*$/i);

    if (!valueMatch) continue;

    const minAmount = Number(range[1].replace(/,/g, ""));
    const maxAmount = Number(range[2].replace(/,/g, ""));
    const value = Number(valueMatch[1]);

    if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount) || !Number.isFinite(value)) continue;
    if (minAmount < 0 || maxAmount < minAmount || value < 0) continue;

    slabs.push({ minAmount, maxAmount, value, label });
  }

  return slabs.filter(
    (s, index, arr) =>
      arr.findIndex(
        (x) =>
          x.minAmount === s.minAmount &&
          x.maxAmount === s.maxAmount &&
          x.value === s.value &&
          x.label === s.label
      ) === index
  );
}

function normalizePurposeData(
  purpose: PortalSourcePurpose,
  text: string,
  bankList: { id: string; name: string; code?: string }[] = []
) {
  const cleanText = text || "";
  const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let commissionVal: number | null = null;
  let feeVal: number | null = null;
  let txnTypeVal: AepsTxnType | null = null;
  let bankNameVal: string | null = null;
  let bankCodeVal: string | null = null;
  let maxLimitVal: number | null = null;
  let refVal: string | null = null;
  let serviceStatusVal: string | null = null;
  let summary = "";

  const rateSlabs =
    purpose === "commission" || purpose === "fee"
      ? extractRateSlabs(cleanText, purpose)
      : [];

  // Pages often expose more than one data point (for example a transaction
  // report can also contain Bank Name / Fee / Commission). Keep those labelled
  // facts available to cross-verification regardless of the source's primary
  // purpose.
  const labelledBankLine =
    lines.find((l) => /(?:issuer\s+bank|customer\s+bank|bank\s+name)\s*[:\-]/i.test(l)) || "";
  const labelledBankMatch = labelledBankLine.match(
    /(?:issuer\s+bank|customer\s+bank|bank\s+name)\s*[:\-]\s*(.+)$/i
  );
  if (labelledBankMatch?.[1]) {
    bankNameVal = labelledBankMatch[1].trim().replace(/[|;,].*$/, "").trim();
    const exactBank = matchBankExactName(bankNameVal, bankList);
    if (exactBank) {
      bankNameVal = exactBank.name;
      bankCodeVal = exactBank.code || null;
    }
  }

  const genericCommission = extractCommission(cleanText);
  if (commissionVal === null && genericCommission) {
    const parsed = parseFloat(genericCommission);
    if (Number.isFinite(parsed)) commissionVal = parsed;
  }
  const genericFee = extractFee(cleanText);
  if (feeVal === null && genericFee) {
    const parsed = parseFloat(genericFee);
    if (Number.isFinite(parsed)) feeVal = parsed;
  }

  if (purpose === "commission") {
    const rawComm = extractCommission(cleanText);
    if (rawComm) commissionVal = parseFloat(rawComm);
    if (commissionVal === null && rateSlabs.length === 1) commissionVal = rateSlabs[0].value;
    summary =
      rateSlabs.length > 0
        ? "Commission slabs extracted: " + rateSlabs.length
        : commissionVal !== null
        ? "Commission rate: ₹" + commissionVal.toFixed(2)
        : "No specific commission data detected.";
  } else if (purpose === "fee") {
    const rawFee = extractFee(cleanText);
    if (rawFee) feeVal = parseFloat(rawFee);
    if (feeVal === null && rateSlabs.length === 1) feeVal = rateSlabs[0].value;
    summary =
      rateSlabs.length > 0
        ? "Fee slabs extracted: " + rateSlabs.length
        : feeVal !== null
        ? "Customer fee: ₹" + feeVal.toFixed(2)
        : "No specific customer fee data detected.";
  } else if (purpose === "aeps_rules") {
    const ruleLines = lines.filter((l) =>
      /\b(?:rule|guideline|limit|daily|aadhaar|biometric|cw|per\s*day|mandatory|2fa)\b/i.test(l)
    );
    const limitMatch = cleanText.match(/\b(?:limit|max(?:imum)?)\D*?(\d{1,2}(?:,\d{3})+|\d{4,5})/i);
    if (limitMatch) {
      const parsedLimit = Number(limitMatch[1].replace(/,/g, ""));
      if (parsedLimit > 0 && parsedLimit <= 50000) maxLimitVal = parsedLimit;
    }
    summary =
      ruleLines.slice(0, 3).join("; ") ||
      lines.slice(0, 2).join("; ") ||
      "AEPS operational rules published.";
  } else if (purpose === "transaction_info") {
    txnTypeVal = normalizeTransactionType(cleanText);
    refVal = extractReference(cleanText);
    summary =
      "Transaction operations: " +
      (txnTypeVal ? txnTypeVal.toUpperCase() : "STANDARD") +
      (refVal ? "; Ref: " + refVal : "");
  } else if (purpose === "provider_bank_info") {
    const bankLines = lines.filter((l) =>
      /\b(?:bank|issuer|downtime|live|status|npci|switch)\b/i.test(l)
    );
    summary = bankNameVal
      ? "Bank detected: " + bankNameVal + "; " + bankLines.slice(0, 2).join("; ")
      : bankLines.slice(0, 3).join("; ") ||
        lines.slice(0, 2).join("; ") ||
        "Provider bank network update.";
  } else if (purpose === "service_status") {
    serviceStatusVal = /\b(?:down|degraded|outage|issues|maintenance)\b/i.test(cleanText)
      ? "Degraded / Maintenance"
      : "Operational";
    summary = "Service status: " + serviceStatusVal;
  } else {
    summary = lines.slice(0, 3).join("; ") || "General portal notice.";
  }

  return {
    commission: commissionVal,
    fee: feeVal,
    transactionType: txnTypeVal,
    bankName: bankNameVal,
    bankCode: bankCodeVal,
    maxLimit: maxLimitVal,
    reference: refVal,
    serviceStatus: serviceStatusVal,
    rateSlabs,
    summary: summary.slice(0, 300),
    sampleSnippet: cleanText.slice(0, 400),
  };
}

function mapPricingRule(row: any): AepsPricingRule {
  return {
    id: String(row.id),
    serviceType: "aeps",
    ruleType: row.rule_type as "fee" | "commission",
    transactionType: normalizeRuleTransactionType(row.transaction_type) || "all",
    portalId: row.portal_id || null,
    customerId: row.customer_id || null,
    bankId: row.bank_id || null,
    minAmount: Number(row.min_amount || 0),
    maxAmount: row.max_amount == null ? null : Number(row.max_amount),
    value: Number(row.value || 0),
    priority: Number(row.priority || 0),
    isActive: Boolean(row.is_active),
    effectiveFrom: row.created_at ? String(row.created_at).slice(0, 10) : undefined,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const actionParam = searchParams.get("action");

    if (actionParam === "get_rules") {
      const portalIdParam = searchParams.get("portalId");
      let ruleQuery = supabase
        .from("aeps_pricing_rules")
        .select("id,service_type,rule_type,transaction_type,portal_id,customer_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at")
        .eq("service_type", "aeps")
        .order("is_active", { ascending: false })
        .order("priority", { ascending: false })
        .order("min_amount", { ascending: false })
        .order("created_at", { ascending: true });
      if (portalIdParam) {
        ruleQuery = ruleQuery.or("portal_id.is.null,portal_id.eq." + portalIdParam);
      }
      const { data: rulesData, error: rulesErr } = await ruleQuery;
      if (rulesErr) {
        return NextResponse.json({ success: false, error: "Unable to load AEPS pricing rules: " + rulesErr.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        rules: (rulesData || []).map(mapPricingRule),
      });
    }

    if (actionParam === "get_runs") {
      const runPortalId = searchParams.get("portalId");
      let runQuery = supabase
        .from("aeps_portal_collection_runs")
        .select("id,portal_id,portal_name,started_at,completed_at,source_count,successful_source_count,failed_source_count,conflict_count,verification_status,verified_context")
        .order("completed_at", { ascending: false })
        .limit(50);
      if (runPortalId) runQuery = runQuery.eq("portal_id", runPortalId);
      const { data: runs, error: runErr } = await runQuery;
      if (runErr) {
        return NextResponse.json({ success: false, error: "Unable to load watcher runs: " + runErr.message }, { status: 500 });
      }
      const runRows = runs || [];
      const runIds = runRows.map((r: any) => r.id).filter(Boolean);
      let observationRows: any[] = [];
      if (runIds.length > 0) {
        const { data: loadedObservations, error: obsErr } = await supabase
          .from("aeps_portal_collection_observations")
          .select("id,collection_run_id,source_id,source_url,portal_id,portal_name,purpose,http_status,latency_ms,extracted_at,raw_snippet,normalized_data,confidence,error_message")
          .in("collection_run_id", runIds)
          .order("extracted_at", { ascending: true });
        if (obsErr) {
          return NextResponse.json({ success: false, error: "Unable to load saved watcher observations: " + obsErr.message }, { status: 500 });
        }
        observationRows = loadedObservations || [];
      }

      const observationsByRun = new Map<string, PortalCollectionObservation[]>();
      for (const row of observationRows) {
        const observation: PortalCollectionObservation = {
          id: String(row.id),
          collectionRunId: String(row.collection_run_id),
          sourceId: String(row.source_id),
          sourceUrl: String(row.source_url || ""),
          portalId: row.portal_id || undefined,
          portalName: row.portal_name || undefined,
          purpose: row.purpose as PortalSourcePurpose,
          httpStatus: Number(row.http_status || 0),
          latencyMs: Number(row.latency_ms || 0),
          extractedAt: String(row.extracted_at),
          rawSnippet: String(row.raw_snippet || ""),
          normalizedData: row.normalized_data || {},
          confidence: row.confidence as SourceConfidenceStatus,
          errorMessage: row.error_message || null,
        };
        const existing = observationsByRun.get(observation.collectionRunId) || [];
        existing.push(observation);
        observationsByRun.set(observation.collectionRunId, existing);
      }

      return NextResponse.json({
        success: true,
        runs: runRows.map((r: any) => ({
          id: r.id,
          portalId: r.portal_id,
          portalName: r.portal_name,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          sourceCount: r.source_count,
          successfulSourceCount: r.successful_source_count,
          failedSourceCount: r.failed_source_count,
          conflictCount: r.conflict_count,
          verificationStatus: r.verification_status,
          verifiedContext: r.verified_context,
          observations: observationsByRun.get(String(r.id)) || [],
        })),
      });
    }

    const portalId = searchParams.get("portalId");

    let query = supabase
      .from("aeps_portal_sources")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: true });

    if (portalId) {
      query = query.eq("portal_id", portalId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: "Unable to load watcher sources: " + error.message }, { status: 500 });
    }

    const sources: PortalWatcherSource[] = (data || []).map((row: any) => ({
      id: row.id,
      portalId: row.portal_id,
      portalName: row.portal_name,
      url: row.url,
      sourceUrl: row.url,
      sourceType: row.source_type || "web_page",
      purpose: row.purpose,
      isEnabled: row.is_enabled,
      priority: row.priority ?? 3,
      description: row.description,
      lastChecked: row.last_checked,
      lastSuccessfulCheck: row.last_successful_check || null,
      lastStatus: row.last_status || "idle",
      lastMessage: row.last_message,
      httpStatus: row.http_status || null,
      extractionConfidence: row.extraction_confidence || undefined,
      currentPublishedValue: row.current_published_value || {},
      isArchived: row.is_archived,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return NextResponse.json({ success: true, sources });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error in portal watcher sources." },
      { status: 500 }
    );
  }
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

    // -----------------------------------------------------------------------
    // ACTION: COLLECT_ALL (Checks ALL enabled URLs for portal together)
    // -----------------------------------------------------------------------
    if (action === "collect_all" || action === "collect_portal_context") {
      const portalId = String(body.portalId || "").trim();
      if (!portalId) return NextResponse.json({ error: "Portal ID is required." }, { status: 400 });

      // Server-authoritative source set. Never trust the browser's copy of sources.
      const { data: portal, error: portalErr } = await supabase
        .from("aeps_portals")
        .select("id,name")
        .eq("id", portalId)
        .maybeSingle();
      if (portalErr || !portal) return NextResponse.json({ error: "Portal not found." }, { status: 404 });

      const { data: sourceRows, error: sourceErr } = await supabase
        .from("aeps_portal_sources")
        .select("*")
        .eq("portal_id", portalId)
        .eq("is_archived", false)
        .eq("is_enabled", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true });
      if (sourceErr) return NextResponse.json({ error: "Unable to load watcher sources: " + sourceErr.message }, { status: 500 });

      const targetSources: PortalWatcherSource[] = (sourceRows || []).map((row: any) => ({
        id: row.id,
        portalId: row.portal_id,
        portalName: row.portal_name || portal.name,
        url: row.url,
        sourceUrl: row.url,
        sourceType: row.source_type || "web_page",
        purpose: row.purpose as PortalSourcePurpose,
        isEnabled: row.is_enabled,
        priority: row.priority ?? 3,
        lastChecked: row.last_checked,
        lastSuccessfulCheck: row.last_successful_check || null,
        lastStatus: row.last_status || "idle",
        lastMessage: row.last_message,
        httpStatus: row.http_status || null,
        extractionConfidence: row.extraction_confidence || undefined,
        currentPublishedValue: row.current_published_value || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        description: row.description,
        isArchived: row.is_archived,
        archivedAt: row.archived_at,
      }));

      const { data: bankRows, error: bankErr } = await supabase
        .from("aeps_banks")
        .select("id,name,code")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (bankErr) return NextResponse.json({ error: "Unable to load Bank Master: " + bankErr.message }, { status: 500 });
      const bankList = (bankRows || []) as { id: string; name: string; code?: string }[];

      const { data: ruleRows, error: ruleErr } = await supabase
        .from("aeps_pricing_rules")
        .select("id,service_type,rule_type,portal_id,customer_id,min_amount,max_amount,value,priority,is_active,transaction_type,bank_id,created_at,updated_at")
        .eq("service_type", "aeps")
        .eq("is_active", true)
        .or("portal_id.is.null,portal_id.eq." + portalId);
      if (ruleErr) return NextResponse.json({ error: "Unable to load AEPS pricing rules: " + ruleErr.message }, { status: 500 });
      const activeRules: AepsPricingRule[] = (ruleRows || []).map((r: any) => ({
        id: r.id,
        serviceType: r.service_type,
        ruleType: r.rule_type,
        transactionType: r.transaction_type || "all",
        portalId: r.portal_id || null,
        customerId: r.customer_id || null,
        bankId: r.bank_id || null,
        minAmount: Number(r.min_amount || 0),
        maxAmount: r.max_amount == null ? null : Number(r.max_amount),
        value: Number(r.value || 0),
        priority: Number(r.priority || 0),
        isActive: Boolean(r.is_active),
        effectiveFrom: r.created_at ? String(r.created_at).slice(0, 10) : undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      const runId = "run-" + portalId.slice(0, 8) + "-" + Date.now();
      const startedAt = new Date().toISOString();

      if (targetSources.length === 0) {
        const completedAt = new Date().toISOString();
        const emptyContext = {
          transactionType: { value: null, status: "NOT_FOUND", sources: [] },
          bankId: null, bankName: null, portalId, portalName: portal.name,
          customerFee: { value: null, status: "NOT_FOUND", sources: [] },
          commission: { value: null, status: "NOT_FOUND", sources: [] },
          reference: { value: null, status: "NOT_FOUND" },
          bank: { value: null, status: "NOT_FOUND", sources: [], candidates: [] },
          portal: { id: portalId, name: portal.name, status: "CONFIRMED" },
          amountLimits: { min: 100, max: 10000 },
          maxLimit: { value: null, status: "NOT_FOUND" },
          serviceStatus: { value: "Not verified", status: "NOT_FOUND" },
          denominations: [],
          verifiedAt: completedAt,
        };
        await supabase.from("aeps_portal_collection_runs").insert({
          id: runId, portal_id: portalId, portal_name: portal.name, started_at: startedAt, completed_at: completedAt,
          source_count: 0, successful_source_count: 0, failed_source_count: 0, conflict_count: 0,
          verification_status: "FAILED", verified_context: emptyContext, created_by: auth.user.id,
        });
        return NextResponse.json({ success: false, action: "collect_all", portalId, portalName: portal.name,
          error: "No enabled watcher sources are configured for " + portal.name + ". Add at least one source URL before live verification.",
          collectionRun: { id: runId, portalId, portalName: portal.name, startedAt, completedAt, sourceCount: 0, successfulSourceCount: 0, failedSourceCount: 0, conflictCount: 0, verificationStatus: "FAILED", observations: [], verifiedContext: emptyContext }, pendingChanges: [] }, { status: 400 });
      }

      // Desktop Electron can provide browser-rendered/authenticated content.
      // The server still resolves the source list from the database and performs
      // all normalization/verification itself.
      const browserObservations: any[] = Array.isArray(body.browserObservations) ? body.browserObservations : [];
      const browserBySource = new Map<string, any>(
        browserObservations
          .filter((o: any) => o && o.sourceId)
          .map((o: any) => [String(o.sourceId), o] as [string, any])
      );

      const fetchResults = await Promise.allSettled(
        targetSources.map(async (src) => {
          const t0 = Date.now();
          const browserObservation = browserBySource.get(String(src.id));

          if (browserObservation) {
            const samePortal = String(browserObservation.portalId || "") === portalId;
            const sameUrl = String(browserObservation.sourceUrl || "").trim().toLowerCase() === String(src.url || "").trim().toLowerCase();
            if (samePortal && sameUrl) {
              return {
                source: src,
                webRes: {
                  success: Boolean(browserObservation.success) && !browserObservation.authRequired,
                  url: src.url,
                  title: String(browserObservation.title || ""),
                  content: String(browserObservation.content || ""),
                  error: browserObservation.error || null,
                  httpStatus: Number(browserObservation.httpStatus || 0) || undefined,
                  requiresBrowser: Boolean(browserObservation.authRequired),
                  rendered: Boolean(browserObservation.rendered),
                },
                latencyMs: Number(browserObservation.latencyMs || (Date.now() - t0)),
              };
            }
          }

          const targetUrl = src.url || src.sourceUrl || "";
          const webRes = await fetchWebsiteData(targetUrl);
          return { source: src, webRes, latencyMs: Date.now() - t0 };
        })
      );

      const observations: PortalCollectionObservation[] = [];
      const pendingChanges: PortalChangeRecord[] = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < fetchResults.length; i++) {
        const item = fetchResults[i];
        const src = targetSources[i];
        const extractedAt = new Date().toISOString();

        if (item.status === "fulfilled" && item.value.webRes.success) {
          const webRes = item.value.webRes;
          const content = webRes.content || "";
          const normalized = normalizePurposeData(src.purpose, content, bankList);
          const matchedBank = normalized.bankName ? matchBankExactName(normalized.bankName, bankList) : null;
          const extractedAny =
            normalized.transactionType != null ||
            normalized.reference != null ||
            normalized.bankName != null ||
            normalized.fee != null ||
            normalized.commission != null ||
            normalized.maxLimit != null ||
            normalized.serviceStatus != null ||
            normalized.rateSlabs.length > 0;
          const useful = extractedAny || (src.purpose === "general_updates" && content.trim().length > 0);
          const confidence: SourceConfidenceStatus = useful ? "HIGH_CONFIDENCE" : "NEEDS_REVIEW";
          if (useful) successCount++; else failCount++;

          const obs: PortalCollectionObservation = {
            id: "obs-" + src.id + "-" + Date.now() + "-" + i,
            collectionRunId: runId, sourceId: src.id, sourceUrl: src.url || src.sourceUrl || "",
            portalId: src.portalId, portalName: src.portalName, purpose: src.purpose,
            httpStatus: webRes.httpStatus || 200, latencyMs: item.value.latencyMs, extractedAt,
            rawSnippet: content.slice(0, 500),
            normalizedData: {
              portalId: src.portalId, portalName: src.portalName,
              bankId: matchedBank?.id || null, bankName: matchedBank?.name || normalized.bankName || null,
              bankCode: matchedBank?.code || normalized.bankCode || null,
              transactionType: normalized.transactionType, customerFee: normalized.fee, fee: normalized.fee,
              commission: normalized.commission, maxLimit: normalized.maxLimit,
              amountLimits: normalized.maxLimit ? { min: 100, max: normalized.maxLimit } : null,
              reference: normalized.reference,
              serviceStatus: normalized.serviceStatus,
              rateSlabs: normalized.rateSlabs || [],
              summary: normalized.summary,
            },
            confidence,
            errorMessage: useful ? null : "HTTP source succeeded but no purpose-specific data was extracted.",
          };
          observations.push(obs);

          const oldVal = src.purpose === "commission" ? src.currentPublishedValue?.commission : src.purpose === "fee" ? src.currentPublishedValue?.fee : null;
          const newVal = src.purpose === "commission" ? normalized.commission : src.purpose === "fee" ? normalized.fee : null;
          if (newVal != null && (oldVal == null || Math.abs(Number(oldVal) - Number(newVal)) >= 0.01)) {
            pendingChanges.push({
              id: "chg-" + Date.now() + "-" + i, collectionRunId: runId, sourceId: src.id, portalId, portalName: portal.name,
              sourceUrl: src.url, purpose: src.purpose, extractedAt,
              oldValue: oldVal == null ? "None" : "₹" + Number(oldVal).toFixed(2),
              newValue: "₹" + Number(newVal).toFixed(2),
              changeSummary: src.purpose.toUpperCase() + " change detected",
              normalizedData: {
                commission: normalized.commission,
                fee: normalized.fee,
                transactionType: normalized.transactionType,
                bankId: matchedBank?.id || null,
                summary: normalized.summary,
              },
              status: "pending",
            });
          }
        } else {
          failCount++;
          const webRes = item.status === "fulfilled" ? item.value.webRes : null;
          const errDetail = item.status === "rejected" ? String(item.reason) : (webRes?.error || "Network error or timeout");
          observations.push({
            id: "obs-" + src.id + "-" + Date.now() + "-" + i, collectionRunId: runId, sourceId: src.id,
            sourceUrl: src.url || src.sourceUrl || "", portalId: src.portalId, portalName: src.portalName, purpose: src.purpose,
            httpStatus: webRes?.httpStatus || 503, latencyMs: item.status === "fulfilled" ? item.value.latencyMs : 15000,
            extractedAt, rawSnippet: webRes?.content?.slice(0, 500) || "", normalizedData: {}, confidence: "SOURCE_FAILED",
            errorMessage: errDetail + (webRes?.requiresBrowser ? " Open this source in the desktop browser watcher." : ""),
          });
        }
      }

      const { verifiedContext, conflicts, verificationStatus } = crossVerifySourceObservations(
        observations, bankList, { id: portalId, name: portal.name }, activeRules
      );
      const completedAt = new Date().toISOString();
      const collectionRun: PortalCollectionRun = {
        id: runId, portalId, portalName: portal.name, startedAt, completedAt, sourceCount: targetSources.length,
        successfulSourceCount: successCount, failedSourceCount: failCount, conflictCount: conflicts.length,
        verificationStatus, observations, verifiedContext,
      };

      const { error: runInsertErr } = await supabase.from("aeps_portal_collection_runs").insert({
        id: runId, portal_id: portalId, portal_name: portal.name, started_at: startedAt, completed_at: completedAt,
        source_count: targetSources.length, successful_source_count: successCount, failed_source_count: failCount,
        conflict_count: conflicts.length, verification_status: verificationStatus, verified_context: verifiedContext,
        created_by: auth.user.id,
      });
      if (runInsertErr) return NextResponse.json({ error: "Failed to persist watcher collection run: " + runInsertErr.message }, { status: 500 });

      const obsRows = observations.map((o) => ({
        id: o.id, collection_run_id: o.collectionRunId, source_id: o.sourceId, source_url: o.sourceUrl,
        portal_id: o.portalId || portalId, portal_name: o.portalName || portal.name, purpose: o.purpose,
        http_status: o.httpStatus, latency_ms: o.latencyMs, extracted_at: o.extractedAt, raw_snippet: o.rawSnippet,
        normalized_data: o.normalizedData, confidence: o.confidence, error_message: o.errorMessage || null,
      }));
      const { error: obsInsertErr } = await supabase.from("aeps_portal_collection_observations").insert(obsRows);
      if (obsInsertErr) return NextResponse.json({ error: "Failed to persist watcher observations: " + obsInsertErr.message }, { status: 500 });

      const sourceUpdates = targetSources.map((src) => {
        const obs = observations.find((o) => o.sourceId === src.id);
        const sourceFailed = !obs || obs.confidence === "SOURCE_FAILED";
        const warning = obs?.confidence === "NEEDS_REVIEW";
        const usableSuccess =
          obs?.confidence === "HIGH_CONFIDENCE" || obs?.confidence === "CONFIRMED";
        return supabase.from("aeps_portal_sources").update({
          last_checked: completedAt,
          last_successful_check: usableSuccess ? completedAt : src.lastSuccessfulCheck || null,
          last_status: sourceFailed ? "error" : warning ? "warning" : "success",
          last_message: obs?.errorMessage || obs?.normalizedData?.summary || (sourceFailed ? "Source failed." : "Live collection completed."),
          http_status: obs?.httpStatus || null,
          extraction_confidence: obs?.confidence || null,
          updated_at: completedAt,
        }).eq("id", src.id).eq("portal_id", portalId);
      });
      const sourceUpdateResults = await Promise.all(sourceUpdates);
      const sourceUpdateError = sourceUpdateResults.find((r: any) => r.error)?.error;
      if (sourceUpdateError) return NextResponse.json({ error: "Watcher collected data but failed to persist source status: " + sourceUpdateError.message }, { status: 500 });

      return NextResponse.json({
        success: true, action: "collect_all", portalId, portalName: portal.name, collectionRun, pendingChanges,
        message: verificationStatus === "VERIFIED"
          ? "All " + successCount + " sources verified for " + portal.name + "."
          : verificationStatus === "PARTIAL"
          ? "Partial verification: " + successCount + " of " + targetSources.length + " sources produced usable data."
          : "Conflicts or issues detected for " + portal.name + ".",
      });
    }
    // -----------------------------------------------------------------------
    // ACTION: APPROVE_CHANGE (Operator approves pending change)
    // -----------------------------------------------------------------------
    if (action === "approve_change") {
      const changeId = String(body.changeId || "").trim();
      const portalId = String(body.portalId || "").trim();
      const purpose = String(body.purpose || "").toLowerCase();
      const newValue = Number(body.newValue);
      const requestedTxnType = normalizeRuleTransactionType(body.transactionType) || "cash_out";
      const bankId = body.bankId ? String(body.bankId).trim() : null;

      if (!changeId || !portalId) {
        return NextResponse.json({ error: "Change ID and portal ID are required." }, { status: 400 });
      }
      if (purpose !== "commission" && purpose !== "fee") {
        return NextResponse.json({ error: "Only fee and commission changes can be approved." }, { status: 400 });
      }
      if (!Number.isFinite(newValue) || newValue < 0) {
        return NextResponse.json({ error: "Approved value must be a non-negative number." }, { status: 400 });
      }

      // Operator approval is the only path that publishes a watcher observation.
      // Scope the published rule to the observed transaction type/bank so one
      // portal page can never rewrite unrelated pricing rules.
      let existingQuery = supabase
        .from("aeps_pricing_rules")
        .select("id,service_type,rule_type,transaction_type,portal_id,customer_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at")
        .eq("service_type", "aeps")
        .eq("rule_type", purpose)
        .eq("portal_id", portalId)
        .eq("transaction_type", requestedTxnType)
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("min_amount", { ascending: false })
        .limit(1);

      existingQuery = bankId ? existingQuery.eq("bank_id", bankId) : existingQuery.is("bank_id", null);
      const { data: existingRows, error: existingErr } = await existingQuery;
      if (existingErr) {
        return NextResponse.json({ error: "Unable to load existing pricing rule: " + existingErr.message }, { status: 500 });
      }

      const existing = existingRows?.[0];
      const now = new Date().toISOString();
      let saved: any = null;

      if (existing) {
        const { data: updated, error: updateErr } = await supabase
          .from("aeps_pricing_rules")
          .update({ value: newValue, updated_at: now })
          .eq("id", existing.id)
          .select("id,service_type,rule_type,transaction_type,portal_id,customer_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at")
          .single();
        if (updateErr || !updated) {
          return NextResponse.json({ error: "Failed to publish approved pricing rule: " + (updateErr?.message || "unknown error") }, { status: 500 });
        }
        saved = updated;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("aeps_pricing_rules")
          .insert({
            service_type: "aeps",
            rule_type: purpose,
            transaction_type: requestedTxnType,
            portal_id: portalId,
            customer_id: null,
            bank_id: bankId,
            min_amount: Number(body.minAmount ?? 100),
            max_amount: body.maxAmount == null || body.maxAmount === "" ? 10000 : Number(body.maxAmount),
            value: newValue,
            priority: Number(body.priority ?? 100),
            is_active: true,
            created_at: now,
            updated_at: now,
          })
          .select("id,service_type,rule_type,transaction_type,portal_id,customer_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at")
          .single();
        if (insertErr || !inserted) {
          return NextResponse.json({ error: "Failed to publish approved pricing rule: " + (insertErr?.message || "unknown error") }, { status: 500 });
        }
        saved = inserted;
      }

      return NextResponse.json({
        success: true,
        action: "approve_change",
        changeId,
        approved: true,
        activatedValue: newValue,
        reviewedAt: now,
        reviewedBy: auth.user.email || "operator",
        rule: mapPricingRule(saved),
        message: "Watcher change approved and published to the scoped AEPS pricing rule.",
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: REJECT_CHANGE (Operator rejects pending change)
    // -----------------------------------------------------------------------
    if (action === "reject_change") {
      const changeId = String(body.changeId || "");
      return NextResponse.json({
        success: true,
        action: "reject_change",
        changeId,
        rejected: true,
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.user.email || "operator",
        message: `Change ${changeId} rejected. Production active configuration unchanged.`,
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: SAVE_RULE (Creates or updates an AEPS pricing rule)
    // -----------------------------------------------------------------------
    const looksUuidSafe = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

    if (action === "save_rule") {
      const input = body.rule;
      if (!input || typeof input !== "object") {
        return NextResponse.json({ error: "Rule payload required." }, { status: 400 });
      }

      const portalId = input.portalId ? String(input.portalId) : null;
      const ruleType = String(input.ruleType || "").toLowerCase();
      if (!portalId) {
        return NextResponse.json({ error: "Portal is required for an AEPS pricing rule." }, { status: 400 });
      }
      if (ruleType !== "fee" && ruleType !== "commission") {
        return NextResponse.json({ error: "Rule type must be fee or commission." }, { status: 400 });
      }

      const rulePayload: any = {
        service_type: "aeps",
        rule_type: ruleType,
        transaction_type: normalizeRuleTransactionType(input.transactionType) || "all",
        portal_id: portalId,
        customer_id: input.customerId || null,
        bank_id: input.bankId && input.bankId !== "all" ? input.bankId : null,
        min_amount: Number(input.minAmount ?? 0),
        max_amount: input.maxAmount == null || input.maxAmount === "" ? null : Number(input.maxAmount),
        value: Number(input.value ?? 0),
        priority: Number(input.priority ?? 10),
        is_active: input.isActive !== false,
        updated_at: new Date().toISOString(),
      };

      if (!Number.isFinite(rulePayload.min_amount) || rulePayload.min_amount < 0) {
        return NextResponse.json({ error: "Minimum amount must be non-negative." }, { status: 400 });
      }
      if (
        rulePayload.max_amount !== null &&
        (!Number.isFinite(rulePayload.max_amount) || rulePayload.max_amount < rulePayload.min_amount)
      ) {
        return NextResponse.json({ error: "Maximum amount must be greater than or equal to minimum amount." }, { status: 400 });
      }
      if (!Number.isFinite(rulePayload.value) || rulePayload.value < 0) {
        return NextResponse.json({ error: "Rule value must be non-negative." }, { status: 400 });
      }

      if (looksUuidSafe(String(input.id || ""))) {
        rulePayload.id = String(input.id);
      }

      const { data: saved, error: saveErr } = await supabase
        .from("aeps_pricing_rules")
        .upsert(rulePayload)
        .select("id,service_type,rule_type,transaction_type,portal_id,customer_id,bank_id,min_amount,max_amount,value,priority,is_active,created_at,updated_at")
        .single();

      if (saveErr || !saved) {
        return NextResponse.json(
          { error: "Failed to persist AEPS pricing rule: " + (saveErr?.message || "unknown error") },
          { status: 500 }
        );
      }

      const rule = mapPricingRule(saved);

      return NextResponse.json({
        success: true,
        action: "save_rule",
        saved: true,
        rule,
        message: "AEPS pricing rule saved successfully.",
      });
    }

    if (action === "delete_rule") {
      const ruleId = String(body.ruleId || "").trim();
      if (!looksUuidSafe(ruleId)) {
        return NextResponse.json({ error: "Rule ID is invalid." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("aeps_pricing_rules")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", ruleId)
        .select("id")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Failed to archive pricing rule: " + (error?.message || "rule not found") },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, action: "delete_rule", ruleId, archived: true });
    }

    if (action === "toggle_rule") {
      const ruleId = String(body.ruleId || "").trim();
      if (!looksUuidSafe(ruleId)) {
        return NextResponse.json({ error: "Rule ID is invalid." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("aeps_pricing_rules")
        .update({ is_active: Boolean(body.isActive), updated_at: new Date().toISOString() })
        .eq("id", ruleId)
        .select("id,is_active")
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: "Failed to update pricing rule: " + (error?.message || "rule not found") },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, action: "toggle_rule", ruleId, isActive: data.is_active });
    }

    // -----------------------------------------------------------------------
    // ACTION: GET_SOURCES
    // -----------------------------------------------------------------------
    if (action === "get_sources") {
      const portalId = body.portalId ? String(body.portalId).trim() : null;
      let query = supabase
        .from("aeps_portal_sources")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: true });

      if (portalId) {
        query = query.eq("portal_id", portalId);
      }

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: "Unable to load watcher sources: " + error.message }, { status: 500 });
      }

      const sources: PortalWatcherSource[] = (data || []).map((row: any) => ({
        id: row.id,
        portalId: row.portal_id,
        portalName: row.portal_name,
        url: row.url,
        sourceUrl: row.url,
        sourceType: row.source_type || "web_page",
        purpose: row.purpose,
        isEnabled: row.is_enabled,
        priority: row.priority ?? 3,
        description: row.description,
        lastChecked: row.last_checked,
        lastSuccessfulCheck: row.last_successful_check || null,
        lastStatus: row.last_status || "idle",
        httpStatus: row.http_status || null,
        extractionConfidence: row.extraction_confidence || undefined,
        lastMessage: row.last_message,
        currentPublishedValue: row.current_published_value || {},
        isArchived: row.is_archived,
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return NextResponse.json({ success: true, sources });
    }

    // -----------------------------------------------------------------------
    // ACTION: CREATE_SOURCE
    // -----------------------------------------------------------------------
    if (action === "create_source") {
      const portalId = String(body.portalId || "").trim();
      const portalName = String(body.portalName || "Registered Portal").trim();
      const rawUrl = String(body.url || "").trim();
      const purpose = String(body.purpose || "") as PortalSourcePurpose;
      const isEnabled = body.isEnabled !== undefined ? Boolean(body.isEnabled) : true;
      const description = body.description ? String(body.description).trim() : null;

      if (!portalId) {
        return NextResponse.json({ error: "Portal ID is required." }, { status: 400 });
      }
      const urlValidation = validatePortalSourceUrl(rawUrl);
      if (!urlValidation.valid) {
        return NextResponse.json({ error: urlValidation.error }, { status: 400 });
      }
      const normalizedUrl = urlValidation.normalizedUrl!;
      if (!VALID_PORTAL_PURPOSES.includes(purpose)) {
        return NextResponse.json({ error: `Invalid purpose '${purpose}'.` }, { status: 400 });
      }

      // Enforce duplicate prevention per portal: partial unique constraint
      const { data: existingDup } = await supabase
        .from("aeps_portal_sources")
        .select("id")
        .eq("portal_id", portalId)
        .eq("is_archived", false)
        .ilike("url", normalizedUrl)
        .maybeSingle();

      if (existingDup) {
        return NextResponse.json({ error: "Source URL already configured for this portal." }, { status: 400 });
      }

      const id = body.id || `src-${portalId}-${Date.now()}`;
      const now = new Date().toISOString();
      const newRecord = {
        id,
        portal_id: portalId,
        portal_name: portalName,
        url: normalizedUrl,
        purpose,
        source_type: "web_page",
        is_enabled: isEnabled,
        priority: 3,
        description,
        last_checked: null,
        last_status: "idle",
        last_message: "Newly added watcher source.",
        current_published_value: {},
        is_archived: false,
        archived_at: null,
        created_by: auth.user.id,
        created_at: now,
        updated_at: now,
      };

      const { error: insertErr } = await supabase.from("aeps_portal_sources").insert(newRecord);
      if (insertErr) {
        return NextResponse.json({ error: `Database insert failed: ${insertErr.message}` }, { status: 500 });
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        user_name: auth.user.email || "operator",
        action: "CREATE",
        entity: "aeps_portal_sources",
        entity_id: id,
        description: `Created AEPS portal source for ${portalName}`,
        details: { portalId, portalName, url: normalizedUrl, purpose, isEnabled, description },
      });

      const source: PortalWatcherSource = {
        id,
        portalId,
        portalName,
        url: normalizedUrl,
        sourceUrl: normalizedUrl,
        sourceType: "web_page",
        purpose,
        isEnabled,
        priority: 3,
        description,
        lastChecked: null,
        lastStatus: "idle",
        lastMessage: "Newly added watcher source.",
        currentPublishedValue: {},
        isArchived: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      return NextResponse.json({
        success: true,
        action: "create_source",
        source,
        message: "Source created successfully.",
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: UPDATE_SOURCE
    // -----------------------------------------------------------------------
    if (action === "update_source") {
      const sourceId = String(body.sourceId || body.id || "").trim();
      if (!sourceId) {
        return NextResponse.json({ error: "Source ID is required." }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from("aeps_portal_sources")
        .select("*")
        .eq("id", sourceId)
        .eq("is_archived", false)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: "Source not found or already archived." }, { status: 404 });
      }

      const targetPortalId = body.portalId ? String(body.portalId).trim() : existing.portal_id;
      const targetPortalName = body.portalName ? String(body.portalName).trim() : existing.portal_name;
      const rawUrl = body.url ? String(body.url).trim() : existing.url;
      const purpose = (body.purpose ? String(body.purpose).trim() : existing.purpose) as PortalSourcePurpose;
      const isEnabled = body.isEnabled !== undefined ? Boolean(body.isEnabled) : existing.is_enabled;
      const description = body.description !== undefined ? (body.description ? String(body.description).trim() : null) : existing.description;

      const urlValidation = validatePortalSourceUrl(rawUrl);
      if (!urlValidation.valid) {
        return NextResponse.json({ error: urlValidation.error }, { status: 400 });
      }
      const normalizedUrl = urlValidation.normalizedUrl!;
      if (!VALID_PORTAL_PURPOSES.includes(purpose)) {
        return NextResponse.json({ error: `Invalid purpose '${purpose}'.` }, { status: 400 });
      }

      // Check duplicate on target portal (excluding current source)
      const { data: existingDup } = await supabase
        .from("aeps_portal_sources")
        .select("id")
        .eq("portal_id", targetPortalId)
        .eq("is_archived", false)
        .neq("id", sourceId)
        .ilike("url", normalizedUrl)
        .maybeSingle();

      if (existingDup) {
        return NextResponse.json({ error: "Source URL already configured for this portal." }, { status: 400 });
      }

      const urlChanged = existing.url.trim().toLowerCase() !== normalizedUrl.toLowerCase();
      const now = new Date().toISOString();

      const updatePayload: any = {
        portal_id: targetPortalId,
        portal_name: targetPortalName,
        url: normalizedUrl,
        purpose,
        is_enabled: isEnabled,
        description,
        updated_at: now,
      };

      if (urlChanged) {
        updatePayload.last_checked = null;
        updatePayload.last_status = "idle";
        updatePayload.last_message = "URL modified — pending verification";
      }

      const { error: updateErr } = await supabase
        .from("aeps_portal_sources")
        .update(updatePayload)
        .eq("id", sourceId);

      if (updateErr) {
        return NextResponse.json({ error: `Database update failed: ${updateErr.message}` }, { status: 500 });
      }

      // Re-fetch to guarantee persistence
      const { data: freshRecord } = await supabase
        .from("aeps_portal_sources")
        .select("*")
        .eq("id", sourceId)
        .single();

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        user_name: auth.user.email || "operator",
        action: "UPDATE",
        entity: "aeps_portal_sources",
        entity_id: sourceId,
        description: `Updated AEPS portal source for ${targetPortalName}`,
        details: {
          old: { portalId: existing.portal_id, url: existing.url, purpose: existing.purpose, isEnabled: existing.is_enabled, description: existing.description },
          new: { portalId: targetPortalId, url: normalizedUrl, purpose, isEnabled, description },
          urlChanged,
        },
      });

      const updatedSource: PortalWatcherSource = {
        id: freshRecord.id,
        portalId: freshRecord.portal_id,
        portalName: freshRecord.portal_name,
        url: freshRecord.url,
        sourceUrl: freshRecord.url,
        sourceType: freshRecord.source_type || "web_page",
        purpose: freshRecord.purpose,
        isEnabled: freshRecord.is_enabled,
        priority: freshRecord.priority ?? 3,
        description: freshRecord.description,
        lastChecked: freshRecord.last_checked,
        lastStatus: freshRecord.last_status || "idle",
        lastMessage: freshRecord.last_message,
        currentPublishedValue: freshRecord.current_published_value || {},
        isArchived: freshRecord.is_archived,
        archivedAt: freshRecord.archived_at,
        createdAt: freshRecord.created_at,
        updatedAt: freshRecord.updated_at,
      };

      return NextResponse.json({
        success: true,
        action: "update_source",
        source: updatedSource,
        message: "Source updated successfully.",
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: DELETE_SOURCE
    // -----------------------------------------------------------------------
    if (action === "delete_source") {
      const sourceId = String(body.sourceId || body.id || "").trim();
      if (!sourceId) {
        return NextResponse.json({ error: "Source ID is required." }, { status: 400 });
      }

      const { data: existing } = await supabase
        .from("aeps_portal_sources")
        .select("*")
        .eq("id", sourceId)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: "Source not found." }, { status: 404 });
      }

      const now = new Date().toISOString();
      const { error: archiveErr } = await supabase
        .from("aeps_portal_sources")
        .update({
          is_archived: true,
          is_enabled: false,
          archived_at: now,
          updated_at: now,
        })
        .eq("id", sourceId);

      if (archiveErr) {
        return NextResponse.json({ error: `Failed to archive source: ${archiveErr.message}` }, { status: 500 });
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        user_name: auth.user.email || "operator",
        action: "DELETE",
        entity: "aeps_portal_sources",
        entity_id: sourceId,
        description: `Archived AEPS portal source for ${existing.portal_name}`,
        details: {
          portalId: existing.portal_id,
          portalName: existing.portal_name,
          url: existing.url,
          purpose: existing.purpose,
          archivedAt: now,
        },
      });

      return NextResponse.json({
        success: true,
        action: "delete_source",
        sourceId,
        message: "Source deleted successfully.",
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: TOGGLE_SOURCE
    // -----------------------------------------------------------------------
    if (action === "toggle_source") {
      const sourceId = String(body.sourceId || body.id || "").trim();
      const isEnabled = Boolean(body.isEnabled);
      if (!sourceId) {
        return NextResponse.json({ error: "Source ID is required." }, { status: 400 });
      }

      const now = new Date().toISOString();
      const { error: toggleErr } = await supabase
        .from("aeps_portal_sources")
        .update({ is_enabled: isEnabled, updated_at: now })
        .eq("id", sourceId);

      if (toggleErr) {
        return NextResponse.json({ error: toggleErr.message }, { status: 500 });
      }

      await supabase.from("audit_logs").insert({
        user_id: auth.user.id,
        user_name: auth.user.email || "operator",
        action: "UPDATE",
        entity: "aeps_portal_sources",
        entity_id: sourceId,
        description: `${isEnabled ? "Enabled" : "Disabled"} AEPS portal source ${sourceId}`,
        details: { isEnabled, updatedAt: now },
      });

      return NextResponse.json({
        success: true,
        action: "toggle_source",
        sourceId,
        isEnabled,
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: TEST (Single URL testing)
    // -----------------------------------------------------------------------
    const rawUrl = String(body.url || "").trim();
    const purpose = String(body.purpose || "commission") as PortalSourcePurpose;
    const portalId = String(body.portalId || "");
    const portalName = String(body.portalName || "Registered Portal");
    const currentPublished = body.currentPublished || {};

    const urlCheck = validatePortalSourceUrl(rawUrl);
    if (!urlCheck.valid) {
      return NextResponse.json({ error: urlCheck.error }, { status: 400 });
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

    if (action === "collect") {
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
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error in portal watcher." },
      { status: 500 }
    );
  }
}
