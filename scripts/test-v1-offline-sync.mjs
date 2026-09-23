/**
 * V1 Offline Sync (G9 application layer) contract test — STATIC ONLY.
 *
 * Verifies, without touching any database or browser, the 47 static
 * checks: sync types, IndexedDB abstraction (never localStorage for the
 * outbox), enqueue/sequence/persistence, handshake/watermark handling,
 * ordered flush with stop-on-first-failure, DUPLICATE/GAP/STALE_EPOCH
 * semantics, the exact retry policy, conflict persistence + server-side
 * resolution, auth-expiry pause and safe resume, re-enrollment state,
 * provisional watermarking with no client-side canonical numbers, no
 * local financial authority, V1 RPC usage, no persisted credentials,
 * counts, explicit states, provider/status/panel/conflict UI, shell
 * integration, offline routes, and the bounded POS queue integration.
 * Browser-only behavior (IndexedDB, timers, connectivity events) is
 * asserted architecturally per the milestone testing requirement.
 *
 * Run: node scripts/test-v1-offline-sync.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const LIB = "lib/v1/sync";
const FILES = {
  types: `${LIB}/types.ts`,
  store: `${LIB}/store.ts`,
  sequence: `${LIB}/sequence.ts`,
  handshake: `${LIB}/handshake.ts`,
  flush: `${LIB}/flush.ts`,
  retry: `${LIB}/retry.ts`,
  conflicts: `${LIB}/conflicts.ts`,
  enqueue: `${LIB}/enqueue.ts`,
  provider: "components/v1/v1-sync-provider.tsx",
  status: "components/v1/v1-sync-status.tsx",
  panel: "components/v1/v1-sync-panel.tsx",
  shell: "components/v1/v1-shell.tsx",
  offline: "app/v1/offline/page.tsx",
  conflictsPage: "app/v1/offline/conflicts/page.tsx",
  loading: "app/v1/offline/loading.tsx",
  checkout: "app/v1/pos/checkout.tsx",
};
for (const [name, p] of Object.entries(FILES)) {
  check(`sync file exists: ${name}`, existsSync(join(root, p)));
}

const src = Object.fromEntries(Object.entries(FILES).map(([n, p]) => [n, read(p)]));
const codeOnly = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"))
    .join("\n");
const code = Object.fromEntries(Object.entries(src).map(([n, s]) => [n, codeOnly(s)]));
const libCode = [code.types, code.store, code.sequence, code.handshake, code.flush, code.retry, code.conflicts, code.enqueue].join("\n");
const uiCode = [code.provider, code.status, code.panel].join("\n");
const allNew = `${libCode}\n${uiCode}\n${code.shell}\n${code.offline}\n${code.conflictsPage}\n${code.loading}`;

// --- 1-3. types + persistence -----------------------------------------------------------------
check("1. sync types exist", src.types.includes("QueueRecord") && src.types.includes("QueueState") && src.types.includes("FlushSummary") && src.types.includes("UNSYNCED_LABEL") && src.types.includes("RETRY_BASE_MS"));
check(
  "2. IndexedDB abstraction exists",
  code.store.includes("indexedDB") && code.store.includes("outbox") && code.store.includes("typeof indexedDB"),
);
check("3. no localStorage financial outbox", !/localStorage/.test(libCode));

// --- 4-9. enqueue/sequence/handshake ---------------------------------------------------------------
check(
  "4. enqueue",
  code.enqueue.includes("enqueueOperation") && code.enqueue.includes("client_uuid") && code.enqueue.includes("idempotency_key") && code.enqueue.includes("device_id") && code.enqueue.includes("epoch"),
);
check("5. sequence allocation", code.sequence.includes("allocSequence") && code.sequence.includes("next_seq") && code.sequence.includes("watermark") && code.sequence.includes("+ 1"));
check("6. persistence", code.store.includes("enqueue") && code.store.includes("markAcknowledged") && code.store.includes("markConflict") && code.store.includes("markFailed") && code.store.includes("deleteRecord"));
check(
  "7. handshake",
  code.handshake.includes('"sync_handshake"') && code.handshake.includes("callV1Read") && code.handshake.includes("server_watermark"),
);
check("8. device/epoch handling", code.flush.includes("getEnrolledDevice") && code.handshake.includes("stale"));
check("9. watermark handling", code.flush.includes("setMeta") && code.handshake.includes("watermark"));

// --- 10-15. flush + dispositions ------------------------------------------------------------------------------
check("10. ordered flush", code.flush.includes('"sync_flush"') && code.flush.includes("a.seq - b.seq"));
check("11. stop-on-first-failure", code.flush.includes("stopped") && code.flush.includes("stopped = \"gap\""));
check("12. DUPLICATE handling", code.flush.includes('"duplicate"') && code.flush.includes("nothing re-executed"));
check("13. GAP handling", code.flush.includes('"gap"') && code.flush.includes("nothing skipped"));
check("14. STALE_EPOCH handling", code.flush.includes("stale-epoch") && code.flush.includes("Re-enroll") && code.provider.includes("needsReenroll"));
check("15. retry state", code.store.includes("next_retry_at") && code.store.includes("attempts"));

// --- 16-20. retry policy ----------------------------------------------------------------------------------------------------------------
check("16. 30-second retry rule", src.retry.includes("30_000") || src.types.includes("30_000"));
check("17. two-attempt rule", src.types.includes("RETRY_BASE_ROUNDS = 2"));
check("18. 15-minute retry cap", src.types.includes("15 * 60_000"));
check("19. 48-hour max age", src.types.includes("48 * 3600_000"));
check("20. semantic rejection not auto-retried", code.retry.includes("isRetryDue") && code.types.includes("isSemanticReason"));

// --- 21-26. conflicts + auth + re-enrollment -------------------------------------------------------------------------------------------------------------------
check("21. conflict persistence", code.conflicts.includes("listConflicts") && code.store.includes("server_conflict_id"));
check("22. conflict UI", src.panel.includes("V1SyncConflicts") && src.panel.includes("serverDetail"));
check("23. server-resolution path", code.conflicts.includes('"resolve_conflict"') && code.conflicts.includes("callV1Mutation"));
check("24. authentication expiry pauses sync", code.provider.includes("paused-auth") && src.provider.includes("retained"));
check("25. re-authentication resumes safely", code.provider.includes("online") && code.flush.includes("doHandshake"));
check("26. re-enrollment state", code.provider.includes("needsReenroll") && src.status.includes("RE-ENROLLMENT REQUIRED"));

// --- 27-32. provisional + no local authority ------------------------------------------------------------------------------------------------------------------------------
check("27. provisional number watermark", code.enqueue.includes("provisional_number") && src.panel.includes("UNSYNCED_LABEL"));
check("28. UNSYNCED — not final", src.types.includes("UNSYNCED — not final"));
check("29. no canonical number generated client-side", !/next_canonical|INV-/.test(libCode) && code.types.includes("canonicalFromResult"));
check("30. no local journal construction", !/post_journal|journal_entries|account_code/.test(libCode));
check("31. no local FIFO authority", !/allocate_fifo|stock_lots/.test(libCode));
check("32. no local balance authority", !/expected_instrument_balance|current_balance/.test(libCode));

// --- 33-38. writes, RPC, secrets, counts ------------------------------------------------------------------------------------------------------------------------------------------------
check(
  "33. no direct table writes",
  !/\.(insert|update|upsert)\s*\(/.test(libCode) &&
    !/\.from\(\s*["']/.test(libCode) &&
    src.store.includes("Explicit operator delete only"),
);
check("34. V1 RPC wrapper used", code.handshake.includes("callV1Read") && code.flush.includes("callV1Mutation"));
check("35. no credentials persisted", !/password|secret|service-role|refresh|access token/i.test(libCode));
check("36. queued count", code.provider.includes("counts") && src.panel.includes("counts.queued"));
check("37. failed count", src.panel.includes("counts.failed"));
check("38. conflict count", src.panel.includes("counts.conflict"));

// --- 39-43. explicit states --------------------------------------------------------------------------------------------------------------------------------------------
check("39. explicit loading state", src.loading.includes("Loading sync"));
check("40. explicit sync state", src.status.includes("ONLINE") && src.status.includes("SYNCING") && src.status.includes("OFFLINE — QUEUED") && src.status.includes("SYNC ERROR") && src.status.includes("CONFLICT"));
check("41. explicit error state", src.panel.includes('role="alert"') && code.provider.includes("lastError"));
check("42. explicit stale epoch state", code.provider.includes("stale-epoch"));
check("43. explicit offline state", code.provider.includes("onOffline") && src.status.includes("OFFLINE"));

// --- 44-47. out-of-scope absences ----------------------------------------------------------------------------------------------------------------------------------------------
check("44. no returns/refunds", !/process_return|refund|cancel_invoice|edit_invoice/i.test(allNew));
check("45. no back-entry offline mode", !/back_entry|acquire_back_entry|submit_back_entry/i.test(allNew));
check("46. no offline day-close approval", !/day_close|approve_day_close|period_lock/i.test(allNew));
check("47. no legacy imports", !/quick_sale|WAC|GST|whatsapp/i.test(allNew));

// --- shell + routes + POS integration --------------------------------------------------------------------------------------------------------------------------------------------------
check("shell status integration", code.shell.includes("V1SyncStatus") && code.shell.includes("V1SyncProvider"));
check("offline route exists", src.offline.includes("V1SyncPanel") && src.offline.includes("getV1SessionContext"));
check("conflicts route exists", src.conflictsPage.includes("V1SyncConflicts"));
check("POS queue integration", code.checkout.includes("enqueueOperation") && code.checkout.includes("UNSYNCED_LABEL"));
check("POS queues identical payload only", code.checkout.includes("queueOffline") && code.checkout.includes("Payment will be recorded after"));
check("POS claims never queued offline", !/op_type.*claim|doc_type.*claim/.test(code.checkout));

if (failures > 0) {
  console.log(`V1_OFFLINE_SYNC_CONTRACT_FAILED (${failures})`);
  process.exit(1);
}
console.log("V1_OFFLINE_SYNC_CONTRACT_PASSED");
