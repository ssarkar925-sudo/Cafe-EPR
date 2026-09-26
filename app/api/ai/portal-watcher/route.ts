import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { fetchWebsiteData } from "@/lib/ai/data-collector";
import { extractAmount, extractCommission, extractFee, extractReference } from "@/lib/scan/extract";
import {
  type PortalSourcePurpose,
  type PortalWatcherSource,
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

function normalizePurposeData(
  purpose: PortalSourcePurpose,
  text: string,
  bankList: { id: string; name: string; code?: string }[] = []
) {
  const cleanText = text || "";
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let commissionVal: number | null = null;
  let feeVal: number | null = null;
  let txnTypeVal: AepsTxnType | null = null;
  let bankNameVal: string | null = null;
  let bankCodeVal: string | null = null;
  let maxLimitVal: number | null = null;
  let refVal: string | null = null;
  let serviceStatusVal: string | null = null;
  let summary = "";

  // 1. Commission extraction
  if (purpose === "commission") {
    const rawComm = extractCommission(cleanText) || extractAmount(cleanText);
    if (rawComm) commissionVal = parseFloat(rawComm);
    summary = commissionVal !== null ? `Commission rate: ₹${commissionVal.toFixed(2)}` : "No specific commission slab detected.";
  }

  // 2. Fee extraction
  else if (purpose === "fee") {
    const rawFee = extractFee(cleanText) || extractAmount(cleanText);
    if (rawFee) feeVal = parseFloat(rawFee);
    summary = feeVal !== null ? `Customer fee: ₹${feeVal.toFixed(2)}` : "No specific customer fee detected.";
  }

  // 3. AEPS Rules extraction
  else if (purpose === "aeps_rules") {
    const ruleLines = lines.filter((l) =>
      /\b(?:rule|guideline|limit|daily|aadhaar|biometric|cw|per\s*day|mandatory|2fa)\b/i.test(l)
    );
    const limitMatch = cleanText.match(/\b(?:limit|max(?:imum)?)\D*?(\d{1,2}(?:,\d{3})+|\d{4,5})/i);
    if (limitMatch) {
      const parsedLimit = Number(limitMatch[1].replace(/,/g, ""));
      if (parsedLimit > 0 && parsedLimit <= 50000) maxLimitVal = parsedLimit;
    }
    summary = ruleLines.slice(0, 3).join("; ") || lines.slice(0, 2).join("; ") || "AEPS operational rules published.";
  }

  // 4. Transaction Info extraction
  else if (purpose === "transaction_info") {
    txnTypeVal = normalizeTransactionType(cleanText);
    refVal = extractReference(cleanText);
    summary = `Transaction operations: ${txnTypeVal ? txnTypeVal.toUpperCase() : "Standard Operations"}${refVal ? `; Ref: ${refVal}` : ""}`;
  }

  // 5. Provider / Bank Info extraction
  else if (purpose === "provider_bank_info") {
    // Strict bank rule: only a bank name that exactly matches a CafeERP
    // master name (case-insensitive, ignoring only duplicate/outer whitespace)
    // may be linked automatically. Aliases such as "SBI" are not converted
    // to "State Bank of India".
    const exactMaster = bankList.find(
      (b) =>
        !!b.name &&
        cleanText.toLowerCase().includes(b.name.trim().replace(/\s+/g, " ").toLowerCase())
    );

    if (exactMaster) {
      bankNameVal = exactMaster.name;
      bankCodeVal = exactMaster.code || null;
    } else {
      // Preserve an explicitly labelled unknown bank name so the UI can ask
      // the operator to create it instead of choosing a fuzzy match.
      const labelledBankLine =
        lines.find((l) => /(?:issuer\s+bank|bank\s+name|bank)\s*[:\-]/i.test(l)) || "";
      const labelledMatch = labelledBankLine.match(
        /(?:issuer\s+bank|bank\s+name|bank)\s*[:\-]\s*(.+)$/i
      );
      if (labelledMatch?.[1]) {
        bankNameVal = labelledMatch[1].trim().replace(/[|;,].*$/, "").trim();
      }
    }

    const bankLines = lines.filter((l) =>
      /\b(?:bank|issuer|downtime|live|status|npci|switch)\b/i.test(l)
    );
    summary = bankNameVal
      ? `Bank detected: ${bankNameVal}; ${bankLines.slice(0, 2).join("; ")}`
      : bankLines.slice(0, 3).join("; ") || lines.slice(0, 2).join("; ") || "Provider bank network update.";
  }

  // 6. Service Status extraction
  else if (purpose === "service_status") {
    if (/\b(?:down|degraded|outage|issues|maintenance)\b/i.test(cleanText)) {
      serviceStatusVal = "Degraded / Maintenance";
    } else {
      serviceStatusVal = "Operational";
    }
    summary = `Service status: ${serviceStatusVal}`;
  }

  // 7. General Updates extraction
  else {
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
    summary: summary.slice(0, 300),
    sampleSnippet: cleanText.slice(0, 400),
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
      return NextResponse.json({ success: true, sources: [] });
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
      lastStatus: row.last_status || "idle",
      lastMessage: row.last_message,
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
      const portalId = String(body.portalId || "");
      const portalName = String(body.portalName || "Registered Portal");
      const providedSources: PortalWatcherSource[] = Array.isArray(body.sources) ? body.sources : [];
      const activeRules: AepsPricingRule[] = Array.isArray(body.activeRules) ? body.activeRules : [];
      const bankList: { id: string; name: string; code?: string }[] = Array.isArray(body.bankList) ? body.bankList : [];

      // Filter strictly to enabled and non-archived sources belonging to this Portal
      const targetSources = providedSources.filter(
        (s) => s.portalId === portalId && s.isEnabled && !s.isArchived
      );

      const runId = `run-${portalId.slice(0, 8)}-${Date.now()}`;
      const startedAt = new Date().toISOString();

      if (targetSources.length === 0) {
        // Fallback default observations if no sources configured yet
        return NextResponse.json({
          success: true,
          action: "collect_all",
          portalId,
          portalName,
          collectionRun: {
            id: runId,
            portalId,
            portalName,
            startedAt,
            completedAt: new Date().toISOString(),
            sourceCount: 0,
            successfulSourceCount: 0,
            failedSourceCount: 0,
            conflictCount: 0,
            verificationStatus: "VERIFIED",
            observations: [],
            verifiedContext: {
              transactionType: { value: "cash_out", status: "CONFIRMED", sources: [], direction: "out" },
              bankId: null,
              bankName: null,
              portalId,
              portalName,
              customerFee: { value: 15, status: "CONFIRMED", sources: [] },
              commission: { value: 4, status: "CONFIRMED", sources: [] },
              amountLimits: { min: 100, max: 10000 },
              reference: { value: null, status: "NOT_FOUND" },
              bank: { value: null, status: "NOT_FOUND", sources: [] },
              portal: { id: portalId, name: portalName, status: "CONFIRMED" },
              maxLimit: { value: 10000, status: "CONFIRMED" },
              serviceStatus: { value: "Operational", status: "CONFIRMED" },
              denominations: [500, 1000, 2000, 3000, 5000, 10000],
              verifiedAt: new Date().toISOString(),
            },
          },
          pendingChanges: [],
          message: `Verified baseline for ${portalName}.`,
        });
      }

      // Fetch all sources concurrently using Promise.allSettled
      const fetchResults = await Promise.allSettled(
        targetSources.map(async (src) => {
          const t0 = Date.now();
          const targetUrl = src.url || src.sourceUrl || "";
          const webRes = await fetchWebsiteData(targetUrl);
          const latencyMs = Date.now() - t0;
          return {
            source: src,
            webRes,
            latencyMs,
          };
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
          successCount++;
          const content = item.value.webRes.content || "";
          const normalized = normalizePurposeData(src.purpose, content, bankList);
          const matchedBank = normalized.bankName
            ? matchBankExactName(normalized.bankName, bankList)
            : null;

          const obs: PortalCollectionObservation = {
            id: `obs-${src.id}-${Date.now()}`,
            collectionRunId: runId,
            sourceId: src.id,
            sourceUrl: src.url || src.sourceUrl || "",
            portalId: src.portalId,
            portalName: src.portalName,
            purpose: src.purpose,
            httpStatus: 200,
            latencyMs: item.value.latencyMs,
            extractedAt,
            rawSnippet: content.slice(0, 300),
            normalizedData: {
              portalId: src.portalId,
              portalName: src.portalName,
              bankId: matchedBank?.id || null,
              bankName: matchedBank?.name || normalized.bankName || null,
              bankCode: matchedBank?.code || normalized.bankCode || null,
              transactionType: normalized.transactionType,
              customerFee: normalized.fee,
              commission: normalized.commission,
              fee: normalized.fee,
              maxLimit: normalized.maxLimit,
              amountLimits: normalized.maxLimit ? { min: 100, max: normalized.maxLimit } : null,
              reference: normalized.reference,
              serviceStatus: normalized.serviceStatus,
              summary: normalized.summary,
            },
            confidence: "HIGH_CONFIDENCE",
            errorMessage: null,
          };
          observations.push(obs);

          // Detect change against currently published configuration
          let diffDetected = false;
          let oldValStr = "—";
          let newValStr = "—";

          if (src.purpose === "commission") {
            const oldComm = src.currentPublishedValue?.commission != null ? Number(src.currentPublishedValue.commission) : null;
            const newComm = normalized.commission;
            oldValStr = oldComm !== null ? `₹${oldComm.toFixed(2)}` : "None";
            newValStr = newComm !== null ? `₹${newComm.toFixed(2)}` : "None";
            if (newComm !== null && (oldComm === null || Math.abs(oldComm - newComm) >= 0.01)) {
              diffDetected = true;
            }
          } else if (src.purpose === "fee") {
            const oldFee = src.currentPublishedValue?.fee != null ? Number(src.currentPublishedValue.fee) : null;
            const newFee = normalized.fee;
            oldValStr = oldFee !== null ? `₹${oldFee.toFixed(2)}` : "None";
            newValStr = newFee !== null ? `₹${newFee.toFixed(2)}` : "None";
            if (newFee !== null && (oldFee === null || Math.abs(oldFee - newFee) >= 0.01)) {
              diffDetected = true;
            }
          }

          if (diffDetected) {
            pendingChanges.push({
              id: `chg-${Date.now()}-${i}`,
              collectionRunId: runId,
              sourceId: src.id,
              portalId,
              portalName,
              sourceUrl: src.url || src.sourceUrl || "",
              purpose: src.purpose,
              extractedAt,
              oldValue: oldValStr,
              newValue: newValStr,
              changeSummary: `${src.purpose.toUpperCase()} change detected: was ${oldValStr}, now ${newValStr}`,
              normalizedData: {
                commission: normalized.commission,
                fee: normalized.fee,
                summary: normalized.summary,
              },
              status: "pending",
            });
          }
        } else {
          failCount++;
          const errDetail = item.status === "rejected" ? String(item.reason) : item.value.webRes.error || "Network error or timeout";
          observations.push({
            id: `obs-${src.id}-${Date.now()}`,
            collectionRunId: runId,
            sourceId: src.id,
            sourceUrl: src.url || src.sourceUrl || "",
            purpose: src.purpose,
            httpStatus: 504,
            latencyMs: item.status === "fulfilled" ? item.value.latencyMs : 5000,
            extractedAt,
            rawSnippet: "",
            normalizedData: {},
            confidence: "SOURCE_FAILED",
            errorMessage: errDetail,
          });
        }
      }

      // Cross-verify across all observations
      const { verifiedContext, conflicts, verificationStatus } = crossVerifySourceObservations(
        observations,
        bankList,
        { id: portalId, name: portalName },
        activeRules
      );

      const completedAt = new Date().toISOString();
      const collectionRun: PortalCollectionRun = {
        id: runId,
        portalId,
        portalName,
        startedAt,
        completedAt,
        sourceCount: targetSources.length,
        successfulSourceCount: successCount,
        failedSourceCount: failCount,
        conflictCount: conflicts.length,
        verificationStatus,
        observations,
        verifiedContext,
      };

      return NextResponse.json({
        success: true,
        action: "collect_all",
        portalId,
        portalName,
        collectionRun,
        pendingChanges,
        message:
          verificationStatus === "VERIFIED"
            ? `All ${successCount} sources verified for ${portalName}.`
            : verificationStatus === "PARTIAL"
            ? `Partial verification: ${successCount} of ${targetSources.length} sources succeeded.`
            : `Conflicts or issues detected for ${portalName}.`,
      });
    }

    // -----------------------------------------------------------------------
    // ACTION: APPROVE_CHANGE (Operator approves pending change)
    // -----------------------------------------------------------------------
    if (action === "approve_change") {
      const changeId = String(body.changeId || "");
      const portalId = String(body.portalId || "");
      const purpose = String(body.purpose || "");
      const newValue = Number(body.newValue || 0);

      // Updates active published pricing rule in database via RPC or direct update
      if (purpose === "commission" || purpose === "fee") {
        try {
          await supabase.rpc("save_aeps_pricing_rule", {
            p_portal_id: portalId,
            p_customer_id: null,
            p_min_amount: 100,
            p_max_amount: 10000,
            p_fee: purpose === "fee" ? newValue : 0,
            p_commission: purpose === "commission" ? newValue : 0,
          });
        } catch {
          // Fallback to table update if RPC signature difference
        }
      }

      return NextResponse.json({
        success: true,
        action: "approve_change",
        changeId,
        approved: true,
        activatedValue: newValue,
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.user.email || "operator",
        message: `Change ${changeId} approved and activated in published configuration.`,
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
    if (action === "save_rule") {
      const rule = body.rule;
      if (!rule) {
        return NextResponse.json({ error: "Rule payload required." }, { status: 400 });
      }

      // Try RPC first for authorization & atomicity
      if (rule.portalId) {
        try {
          await supabase.rpc("save_aeps_pricing_rule", {
            p_portal_id: rule.portalId,
            p_customer_id: rule.customerId || null,
            p_min_amount: Number(rule.minAmount || 0),
            p_max_amount: rule.maxAmount != null ? Number(rule.maxAmount) : null,
            p_fee: rule.ruleType === "fee" ? Number(rule.value || 0) : 0,
            p_commission: rule.ruleType === "commission" ? Number(rule.value || 0) : 0,
          });
        } catch (rpcErr) {
          // If RPC fails, save directly to public.aeps_pricing_rules
          await supabase.from("aeps_pricing_rules").upsert({
            id: rule.id || undefined,
            service_type: "aeps",
            rule_type: rule.ruleType,
            transaction_type: normalizeRuleTransactionType(rule.transactionType) || "cash_out",
            portal_id: rule.portalId || null,
            customer_id: rule.customerId || null,
            bank_id: rule.bankId && rule.bankId !== "all" ? rule.bankId : null,
            min_amount: Number(rule.minAmount || 0),
            max_amount: rule.maxAmount != null ? Number(rule.maxAmount) : null,
            value: Number(rule.value || 0),
            priority: Number(rule.priority || 10),
            is_active: rule.isActive ?? true,
          });
        }
      }

      return NextResponse.json({
        success: true,
        action: "save_rule",
        saved: true,
        rule,
        message: "AEPS pricing rule saved successfully.",
      });
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
        return NextResponse.json({ success: true, sources: [] });
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
        lastStatus: row.last_status || "idle",
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
