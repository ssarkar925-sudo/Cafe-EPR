# V1 Offline Architecture Mapping (G9 Protocol)

Status: **DESIGN ONLY — maps the future application architecture to the
already-approved G9 protocol. No IndexedDB/Dexie implementation, no queue
worker, no sync automation in this phase.**

Basis: `v1-transaction-sync-spec.md` (§1 lifecycle, §2 offline, §3
conflicts, §7 recovery), owner decisions D1 (record-only offline cash),
D3 (24h provisional reservations), D4 (retry caps), D7 (provisional
watermark), D8 (server-authoritative timestamps), and the G0–G13 gated
baseline (`V1SyncReasonCode`, `V1InvoiceStatus` in
`lib/v1/v1-contracts.ts`; `sync_flush`, `sync_acknowledge`,
`resolve_conflict`, `sync_handshake` in `lib/v1/v1-rpc.ts`).

---

## 1. Queue record (normative shape)

Every offline mutation is stored in a persistent device-local outbox
(survives app restart) as exactly this record. (`V1QueueState` is a
design-only name for the specified state column below.)

```typescript
interface V1SyncQueueRecord {
  client_uuid: string;      // UUIDv7, time-ordered, per business intent occurrence
  idempotency_key: string;  // UUIDv7, per business intent; DB-unique per tenant
  device_id: string;        // Registered server device id (never the local client UUID)
  epoch: number;            // Device epoch from the last sync_handshake
  seq: number;              // Monotonic per-device outbox sequence (1, 2, 3, …)
  op_type: string;          // One of V1_MUTATION_RPCS (e.g. create_sale, record_claim)
  payload: unknown;         // The RPC params JSON — IMMUTABLE once queued
  state: "queued" | "sent" | "acked" | "failed" | "conflict";
}
```

Rules:

1. **Persistent local storage is required.** The outbox MUST survive app
   restart; sync resumes from the per-device watermark (last acknowledged
   `seq`). Storage technology is an implementation choice (deferred); the
   durability requirement is not.
2. **Device identity:** `device_id` is the server-minted id from
   `consume_enrollment_token` (see `lib/v1/v1-device.ts`: `serverDeviceId`
   vs the install-local `clientUuid`). Queued payloads never carry long-lived
   secrets.
3. **Epoch handling:** every record carries the epoch current at queue time.
   A record flushed under a superseded epoch is rejected `STALE_EPOCH`; the
   device re-handshakes (and re-enrolls if the server so directs) and
   re-queues under the fresh epoch — never edits the stored payload.
4. **Monotonic sequence:** `seq` is assigned once, never reused, never
   reordered. Gaps are meaningful (see `GAP` below).
5. **Payload immutability:** corrections are new versions under the same key
   family, never edits to a queued record.

---

## 2. Sync handshake (`sync_handshake`, read RPC)

Before every flush, and on every reconnect and epoch doubt, the client calls
`sync_handshake` to establish: (a) the device is known and `active` (unknown
or revoked devices are rejected — no anonymous sync); (b) the current
`device_epoch`; (c) the server `last_watermark` (highest `seq` acknowledged
for this device). Flush starts at `watermark + 1`.

---

## 3. Sync flush ordering (`sync_flush` + `sync_acknowledge`)

1. Flush in strict `seq` order, starting at `watermark + 1`.
2. **Stop-on-first-failure:** the first record that fails with a semantic
   rejection halts the flush. Later records wait, in order, until the failed
   record is corrected-and-resubmitted, discarded (reason-coded, audited), or
   escalated via the exception queue.
3. Each accepted record is confirmed with `sync_acknowledge`; the watermark
   advances only on acknowledgement. Unacked records keep the UNSYNCED
   watermark everywhere (screen, badge, reprint).
4. A batch continues past **transient** failures (network/timeout/lock) per
   the retry policy (§5); semantic rejections stop the batch per (2).

---

## 4. Reason codes and conflict handling

Reason codes are exactly `V1SyncReasonCode` (spelling as gated, including
the historical `UNKNOWN_INSTRUMENT` form):

| Code | Meaning | Client behavior |
|---|---|---|
| `DUPLICATE` | Server already holds `idempotency_key` | Replay: adopt the stored result, mark `acked`. Never re-executes |
| `GAP` | `seq` discontinuity vs watermark | Halt; resync from the watermark; never skip |
| `STALE_EPOCH` | Epoch superseded | Halt; `sync_handshake`; re-enroll if directed; re-queue under fresh epoch |
| `AUTH_EXPIRED` | Session expired | Pause queue (no anonymous sync); refresh session; resume |
| `FORBIDDEN` / `NOT_FOUND` | Revoked device / unknown reference | Halt; revoked devices require re-enrollment, never silent retry |
| `INSUFFICIENT_STOCK` | Server-side FIFO allocation failed at sync time | `failed` + exception queue; correct-and-resubmit / discard / escalate |
| `LIMIT_EXCEEDED` | Khata limit breached at validation | Same as above; no partial credit |
| `TOTAL_MISMATCH` | Server recompute differs beyond ₹0.01 | Same as above; device estimate discarded |
| `EXPIRED_LOT` | Allocation touched an expired lot | Same as above; hard block, never warn-and-sell |
| `UNKNOWN_INSTRUMENT` | Claimed method/instrument not an active master | Same as above; offline payments are claims, not facts |
| `VALIDATION` | Structural/master failure incl. `STALE_MASTERS` class | Same as above |
| `ERROR` | Transient server-side error | Retry per §5 |

Conflict semantics (from the approved protocol):

- Same `idempotency_key` → return original (`replay`), mark `acked`.
- Same `client_uuid`, different key → reject as ambiguous, audit both.
- Concurrent stock: allocation happens atomically **at sync time** on the
  server (`SELECT … FOR UPDATE` serialization); oversell routes the line to
  the exception queue; V1 fulfils all-or-nothing per document (D2).
- Offline payments are claims matched against active masters at sync;
  unknown instruments and over-collection fail the record.
- Every conflict writes an immutable `sync_conflicts` record — never
  silently dropped. Resolution goes through `resolve_conflict`
  (correct-and-resubmit under the same key family, discard with reason, or
  escalate); every disposition is audited with actor + timestamp.
- **Canonical-number replacement:** on acknowledgement the server's
  canonical number replaces the provisional number in the outbox record, the
  UI, and any reprint. Provisional numbers are never reused as canonicals.

---

## 5. Retry policy (D4, normative)

- Transient classes (network/timeout/lock contention): exponential backoff,
  base 30s ×2, 15-minute cap, **48-hour maximum record age**; older records
  age out to the exception queue for operator disposition.
- Semantic rejections (`INSUFFICIENT_STOCK`, `LIMIT_EXCEEDED`,
  `TOTAL_MISMATCH`, `EXPIRED_LOT`, `UNKNOWN_INSTRUMENT`, `VALIDATION`):
  **never auto-retried.** Operator action required.
- Revoked/expired-auth handling: pause, never bypass; queued payloads wait
  unmodified until the session/device is valid again.

---

## 6. Server-authoritative boundary (normative)

| Concern | Client (offline) | Server (sync) |
|---|---|---|
| Cart subtotal | Estimate, presentation only | Recomputed; mismatch → `TOTAL_MISMATCH` |
| Inventory quantity | Cached snapshot (timestamped) | `stock_lots.qty_remaining`, hard allocation |
| FIFO allocation | Never computed locally | Oldest `received_at` open, unexpired lot first |
| Payment recognition | Claim recorded (`recorded`) | Admin-gated `recognize_claim`; journals post only on recognition (F1) |
| Credit limit | Cached hint | Enforced at validation; over-limit → reject |
| Canonical number | Never minted locally | Assigned at `server_validated` from server sequence |
| Timestamp | Device time, informational | `invoice_date`/`created_at` from server (D8) |
| Journal posting | Never; no journal language before `posted` | Atomic with the `server_validated → posted` transition |
| Provisional reservation | 24h TTL hold, `reserved_qty` display (D3) | Confirmed at sync or auto-released |

---

## 7. Provisional watermark requirement (D7, normative)

Any record in `offline_created` or `queued` state — and any screen, badge,
or printed receipt derived from it — MUST carry `UNSYNCED — NOT FINAL`
until `sync_acknowledge` succeeds. Device/browser loss destroys unflushed
drafts; the outbox "N unsynced" indicator is the mandated disclosure, and
the future UI must never imply durability it does not have.
