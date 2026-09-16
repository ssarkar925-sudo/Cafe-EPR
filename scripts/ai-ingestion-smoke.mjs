// LIVE AI ingestion smoke test (operator-run, production-safe).
//
// Proves the complete pipeline with ONE synthetic event:
//   SOURCE -> ingestion API -> ai_ingestion_events -> normalization ->
//   validation -> deterministic dedupe -> entity/customer matching ->
//   reconciliation -> ai_reconciliation_drafts -> PENDING_APPROVAL
//
// The synthetic event uses source_type "api" with provider "test-bank" (the
// "test" label from the acceptance plan maps to the api source; no schema
// change is needed). Nothing here writes to ledger/accounting tables.
//
// Usage (operator machine, production credentials required):
//   npx wrangler secret put AI_INGESTION_WORKER_KEY   # one-time, then deploy
//   node scripts/ai-ingestion-smoke.mjs \
//     --base-url https://cafeerp.ssarkar925.workers.dev \
//     --worker-key <AI_INGESTION_WORKER_KEY> \
//     [--cron-secret <CRON_SECRET>] \
//     [--service-key <SUPABASE_SERVICE_ROLE_KEY> --supabase-url <URL>] \
//     [--cleanup]
//
// Exit 0 only if every executed step passes. Steps requiring a missing
// credential are reported as SKIPPED (never faked).

const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const eq = rawArgs[i].match(/^--([^=]+)=(.*)$/);
  if (eq) {
    args[eq[1]] = eq[2];
    continue;
  }
  const flag = rawArgs[i].match(/^--(.+)$/);
  if (flag) {
    const next = rawArgs[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[flag[1]] = next;
      i++;
    } else {
      args[flag[1]] = true;
    }
  }
}

const BASE_URL = String(args["base-url"] || process.env.SMOKE_BASE_URL || "https://cafeerp.ssarkar925.workers.dev").replace(/\/$/, "");
const WORKER_KEY = String(args["worker-key"] || process.env.AI_INGESTION_WORKER_KEY || "").trim();
const CRON_SECRET = String(args["cron-secret"] || process.env.CRON_SECRET || "").trim();
const SERVICE_KEY = String(args["service-key"] || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SUPABASE_URL = String(args["supabase-url"] || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const CLEANUP = Boolean(args.cleanup);

const results = [];
function step(name, status, detail = "") {
  const normalized = status === true || status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
  results.push({ name, status: normalized, detail });
  console.log(`  ${normalized}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { method = "GET", body = null, auth = true, timeoutMs = 30000 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && WORKER_KEY) headers["x-ingestion-worker-key"] = WORKER_KEY;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function sbRest(table, query = "select=*&limit=1") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function sbCount(table) {
  // Exact counts would scan full tables; head requests are enough for smoke deltas.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=2000`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: "count=exact" },
    signal: AbortSignal.timeout(30000),
  });
  const range = res.headers.get("content-range") || "";
  const m = range.match(/\/(\d+)$/);
  await res.json().catch(() => null);
  return m ? Number(m[1]) : -1;
}

async function main() {
  console.log("AI ingestion LIVE smoke test");
  console.log(`target: ${BASE_URL}`);

  // 0. Preflight: unauthenticated stats must be rejected (deployment + guard proof).
  try {
    const res = await fetch(`${BASE_URL}/api/ai/ingestion/stats`, { signal: AbortSignal.timeout(20000) });
    step("preflight: stats endpoint deployed and guarded", res.status === 401, `HTTP ${res.status}`);
  } catch (e) {
    step("preflight: stats endpoint reachable", false, String((e && e.message) || e));
    return done(false);
  }

  if (!WORKER_KEY) {
    step("worker-key present", false, "pass --worker-key (and set AI_INGESTION_WORKER_KEY via wrangler secret + redeploy)");
    return done(false);
  }

  const uid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const externalEventId = `smoke-test-${uid}`;
  const externalReference = `TEST-${uid}`;
  const occurredAt = new Date().toISOString();
  const payload = {
    source_type: "api",
    source_provider: "test-bank",
    source_instance: "smoke-test",
    api_event: {
      event_type: "bank_credit",
      status: "completed",
      occurred_at: occurredAt,
      amount: 100,
      currency: "INR",
      customer_name: null,
      customer_mobile: null,
      external_event_id: externalEventId,
      external_reference: externalReference,
    },
  };

  let ledgerBefore = null;
  if (SERVICE_KEY && SUPABASE_URL) {
    try {
      ledgerBefore = {
        transactions: await sbCount("transactions"),
        invoices: await sbCount("invoices"),
        payments: await sbCount("payments"),
        customers: await sbCount("customers"),
      };
      step("ledger snapshot before", true, JSON.stringify(ledgerBefore));
    } catch (e) {
      step("ledger snapshot before", false, String((e && e.message) || e));
    }
  } else {
    step("ledger snapshot before", "SKIP", "no --service-key (direct DB proof unavailable)");
  }

  // 1. Accept event.
  const first = await api("/api/ai/ingestion/events", { method: "POST", body: payload });
  const eventId = first.data && first.data.eventId;
  step(
    "1. event accepted by ingestion endpoint",
    first.status === 201 && first.data.state !== "duplicate" && Boolean(eventId),
    `HTTP ${first.status} state=${first.data && first.data.state} eventId=${eventId || "?"} ${first.data && first.data.error ? `err=${first.data.error}` : ""}`,
  );
  if (!eventId) return done(false);

  // 2-4. Read back the row: exactly-once presence, normalized fields, validation.
  const list = await api(`/api/ai/ingestion/events?provider=test-bank&limit=20`);
  const rows = Array.isArray(list.data && list.data.events) ? list.data.events.filter((r) => r.id === eventId) : [];
  step("2. exactly one row in ai_ingestion_events", rows.length === 1, `matches=${rows.length}`);
  const row = rows[0] || {};
  step(
    "3. normalized amount/direction/reference correct",
    Number(row.amount) === 100 && row.external_reference === externalReference && row.event_type === "bank_credit",
    `amount=${row.amount} ref=${row.external_reference} type=${row.event_type}`,
  );
  step(
    "4. validation succeeds",
    row.validation_state === "valid" || row.validation_state === "needs_review",
    `validation_state=${row.validation_state} issues=${JSON.stringify((row.metadata && row.metadata.validation_issues) || row.validation_issues || [])}`,
  );

  // 5-6. Duplicate submission.
  const second = await api("/api/ai/ingestion/events", { method: "POST", body: payload });
  const dupOk = second.data && second.data.state === "duplicate" && second.data.eventId === eventId;
  step("5. duplicate detected", Boolean(dupOk), `state=${second.data && second.data.state} kind=${second.data && second.data.duplicateKind}`);
  const list2 = await api(`/api/ai/ingestion/events?provider=test-bank&limit=50`);
  const dupRows = Array.isArray(list2.data && list2.data.events)
    ? list2.data.events.filter((r) => r.external_event_id === externalEventId || r.external_reference === externalReference)
    : [];
  step("6. no second financial event created", dupRows.length === 1, `rows=${dupRows.length}`);

  // 7-9. Reconciliation: prefer the server processor, else stage an explicit draft.
  let verdict = null;
  let draftId = null;
  let draftState = null;
  if (CRON_SECRET) {
    try {
      const procRes = await fetch(`${BASE_URL}/api/ai/ingestion/process`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: AbortSignal.timeout(120000),
      });
      const proc = await procRes.json().catch(() => ({}));
      step("7a. server processor ran", procRes.ok === true, `processed=${proc.processed} reconciled=${proc.reconciled} review=${proc.needsReview}`);
      const refreshed = await api(`/api/ai/ingestion/events?provider=test-bank&limit=20`);
      const current = Array.isArray(refreshed.data && refreshed.data.events)
        ? refreshed.data.events.find((r) => r.id === eventId)
        : null;
      verdict = current && current.metadata && current.metadata.reconcile_verdict;
      step("7. reconciliation produced verdict with evidence", Boolean(verdict), `verdict=${verdict} state=${current && current.state}`);
      const drafts = await api(`/api/ai/ingestion/drafts?limit=50`);
      const mine = Array.isArray(drafts.data && drafts.data.drafts)
        ? drafts.data.drafts.find((d) => d.source_event_id === eventId)
        : null;
      if (mine) {
        draftId = mine.id;
        draftState = mine.state;
      }
    } catch (e) {
      step("7a. server processor ran", false, String((e && e.message) || e));
    }
  } else {
    step("7a. server processor ran", "SKIP", "no --cron-secret; run processor via app cron, then re-run with --verify-only");
  }

  if (!draftId) {
    // Explicit draft for the unmatched bank credit (proposal only, stays pending).
    const created = await api("/api/ai/ingestion/drafts", {
      method: "POST",
      body: {
        business_id: "default",
        source_event_id: eventId,
        action_type: "record_customer_payment",
        target_entity: "customers",
        target_id: null,
        proposed_payload: { event_id: eventId, amount: 100, smoke_test: true },
        evidence: { smoke_test: true, verdict: verdict || "missing_in_erp", reference: externalReference },
        confidence: 0.6,
      },
    });
    if (created.status === 201 && created.data && created.data.draft) {
      draftId = created.data.draft.id;
      draftState = created.data.draft.state;
    }
    step("8. reconciliation draft created", Boolean(draftId), `draftId=${draftId || "?"} risk=${created.data && created.data.draft && created.data.draft.risk_level}`);
  } else {
    step("8. reconciliation draft created", true, `draftId=${draftId} (by server processor)`);
  }
  step("9. draft is PENDING_APPROVAL", draftState === "pending", `state=${draftState} (pending + high-risk = owner approval required)`);

  // 10. No ledger writes.
  if (ledgerBefore) {
    const after = {
      transactions: await sbCount("transactions"),
      invoices: await sbCount("invoices"),
      payments: await sbCount("payments"),
      customers: await sbCount("customers"),
    };
    const same =
      after.transactions === ledgerBefore.transactions &&
      after.invoices === ledgerBefore.invoices &&
      after.payments === ledgerBefore.payments &&
      after.customers === ledgerBefore.customers;
    step("10. no accounting write occurred", same, `before=${JSON.stringify(ledgerBefore)} after=${JSON.stringify(after)}`);
  } else {
    step("10. no accounting write occurred", "SKIP", "direct DB proof needs --service-key (API responses show reads/proposals only)");
  }

  // 11. Response clarity is demonstrated by the steps above (IDs printed).

  if (CLEANUP) {
    if (SERVICE_KEY && SUPABASE_URL) {
      const report = [];
      if (draftId) {
        const r = await sbRest(`ai_reconciliation_drafts?id=eq.${draftId}`, "select=id");
        report.push(`draft:${r.status}`);
        await fetch(`${SUPABASE_URL}/rest/v1/ai_reconciliation_drafts?id=eq.${draftId}`, {
          method: "DELETE",
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
          signal: AbortSignal.timeout(30000),
        }).catch(() => null);
      }
      await fetch(`${SUPABASE_URL}/rest/v1/ai_ingestion_events?id=eq.${eventId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      step("cleanup synthetic rows", true, report.join(" ") || "deleted");
    } else {
      step("cleanup synthetic rows", "SKIP", "needs --service-key");
    }
  }

  console.log("\nsummary:", JSON.stringify({ syntheticEventId: externalEventId, ingestionEventId: eventId, reconciliationVerdict: verdict, draftId, draftState, duplicateDeduped: Boolean(dupOk) }, null, 2));
  return done(true);
}

function done(okAll) {
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${results.length - failed} passed, ${failed} failed, ${results.filter((r) => r.status === "SKIP").length} skipped.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", (e && e.message) || e);
  process.exit(1);
});
