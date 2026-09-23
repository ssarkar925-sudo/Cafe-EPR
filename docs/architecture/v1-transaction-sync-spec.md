# V1 Transaction & Synchronization Specification
ERP: CyberCafe & Digital Services ERP · Status: **DESIGN ONLY — no code, no migrations, no DB changes**
Basis: Approved A2 decisions. Legend: **[LOCKED]** = owner-decided · **[★ PROPOSAL]** = recommended default awaiting approval · **[? OPEN]** = requires owner/phase input.

## 1. Transaction lifecycle
States: `draft → offline_created → queued → server_validated → posted`, plus terminal/exception states `failed`, `reversed`, `cancelled`.
- `draft`: device-local only, never synced, never numbered. May be edited or discarded on device.
- `offline_created`: validated against cached masters (prices, stock snapshot with timestamp), assigned `client_uuid` + `idempotency_key`, written to outbox. Immutable payload from here on (corrections = new version, same key family — see §3).
- `queued`: awaiting connectivity; ordered per device by outbox sequence.
- `server_validated`: server accepted structure, identity, masters, limits, and totals; provisional number replaced by canonical number; **no journals yet**.
- `posted`: journals written atomically with state transition (single transaction). Terminal-success.
- `failed`: validation or posting rejected; reason code stored; payload preserved; routable to exception queue (§7). Never auto-retried without operator action except transient errors (§2).
- `reversed`: only from `posted`, via mirror reversal entry linked to original (cancel-and-recreate doctrine **[LOCKED]** — posted documents are never edited; corrections = reverse + reissue).
- `cancelled`: only from pre-`posted` states (draft/offline_created/queued/failed); reason-coded; audited.
- Allowed transitions are enforced server-side by a state machine (CHECK constraint on `(old_state, new_state)` pairs); clients may only request `draft→offline_created→queued→cancelled`.

## 2. Offline transactions
- **Identity:** `client_uuid` UUIDv7 (time-ordered) generated on device **[★ PROPOSAL]**; `idempotency_key` UUIDv7 per business intent; DB uniques on `(tenant_id, idempotency_key)` and `(tenant_id, client_uuid)`.
- **Local queue/outbox:** append-only outbox table on device (sequence, payload hash, attempts, next_retry_at, state). Inbox = server acknowledgements + conflict notices, applied in order.
- **Retry:** exponential backoff with jitter (base 30s, ×2, cap 15 min, max 48h age) **[★ PROPOSAL]**; only idempotent-safe operations retry automatically; non-idempotent rejections go to `failed`.
- **Network interruption:** outbox survives app restart (persistent storage); sync resumes from last acknowledged sequence (watermark per device).
- **Duplicate prevention:** unique keys above + server dedupe window (replayed key returns stored result, never re-executes).
- **Authentication expiry:** device must refresh session before flushing; expired token pauses queue (no anonymous sync); queued payloads never carry long-lived secrets.
- **Device registration:** `devices(device_id, tenant_id, user_id, registered_at, last_seen, queue_watermark, status)`; unknown/revoked devices are rejected at handshake; one user may own several devices; device loss = revoke + re-register (§7).

## 3. Conflict resolution (server is the single source of financial truth)
- **Duplicate transactions:** same `idempotency_key` → return original result (`replay`); same `client_uuid` different key → reject as ambiguous, audit both.
- **Concurrent stock consumption:** allocation happens atomically **at sync time** on the server, never from the device's stale snapshot. Oversell → line rejected to exception queue; remainder of document processes only if fully satisfiable **[★ PROPOSAL: all-or-nothing per document]**.
- **FIFO batch conflicts:** server allocates oldest-receipt open lots; two concurrent syncs serialize on lot rows (`SELECT … FOR UPDATE`); loser re-runs allocation or fails cleanly.
- **Invoice numbering:** canonical numbers assigned **only** at `server_validated` from a server sequence; device shows provisional numbers watermarked "UNSYNCED — not final" **[★ PROPOSAL]**.
- **Payment conflicts:** offline-recorded payments are claims, not facts; server matches claimed methods/instruments against active masters; unknown instrument or over-collection → `failed` + exception.
- **Financial posting conflicts:** posting occurs only in the `server_validated→posted` atomic step; any invariant breach aborts the whole document (nothing partially posts).
- **Server validation failures:** typed reason codes (`STALE_MASTERS`, `INSUFFICIENT_STOCK`, `LIMIT_EXCEEDED`, `TOTAL_MISMATCH`, `UNKNOWN_INSTRUMENT`, `EXPIRED_LOT`, `DUPLICATE_KEY`, `AUTH_EXPIRED`); payload + reason persisted; operator disposition required except transient classes.
- **Conflict audit records:** every conflict writes an immutable `sync_conflicts` record (device, document, reason, server snapshot refs, disposition, actor). Conflicts are never silently dropped.

## 4. FIFO inventory (batches + expiry **[LOCKED]**)
- **Purchase lots:** `stock_lots(lot_id, tenant_id, product_id, purchase_id, qty_received, qty_remaining, unit_cost, received_at, expiry_date, status)`; status ∈ {open, exhausted, quarantined, expired}. Expiry mandatory at intake **[? OPEN: default shelf life per category if supplier gives none]**.
- **Allocation:** oldest `received_at` open, unexpired lot first; skip expired lots absolutely (hard block, never warn-and-sell).
- **Partial allocation:** consume across successive lots; costing uses each lot's `unit_cost` (true FIFO COGS).
- **Insufficient stock:** reject the document line (no negative inventory, no backorders in v1) **[★ PROPOSAL]**.
- **Offline reservations:** provisional holds with TTL (24h **[★ PROPOSAL]**), visible as `reserved_qty` distinct from `qty_remaining`; confirmed at sync or auto-released; reservations never reduce postable stock for other devices beyond the TTL window.
- **Returns/restocking:** restock to the original lot when traceable, else oldest open lot of the product; expiry re-checked at restock.
- **Damaged/expired:** move to `quarantined` with reason + actor (Manager+Admin only, per A2 §9-proposal), valued at zero on quarantine via Inventory Adjustment journal; destruction/disposal is a separate reason-coded step.

## 5. Financial safety
- **Journal invariants:** every posted batch balances (Σdebit = Σcredit within ₹0.01 **[LOCKED]** half-up); posted entries immutable; corrections only via mirror reversals; `(source_type, source_id)` unique against double-posting.
- **Offline posting limitation:** devices NEVER post journals; journals exist only after server validation + atomic posting. Offline financial figures are estimates.
- **Idempotent posting:** `(tenant_id, idempotency_key)` gate before any write; replay returns stored result.
- **Reversal rules:** posted-only, full-document mirror entries, reason-coded, linked both ways, admin-approved (A2 §3: all returns/refunds admin-approved).
- **Discount approval:** any discount requires Admin approval **[LOCKED]**; approval record (approver, timestamp, scope) bound to the document; POS must support admin override at sale time.
- **Refund approval:** admin approval required **[LOCKED]**; default khata credit; cash refunds are approval-gated disbursements, never silent payouts.
- **Khata/credit limits:** limits enforced server-side at validation; over-limit sale → reject (no partial credit) **[★ PROPOSAL]**; dues tracked per customer with aging.

## 6. Security
- **Tenant isolation:** `tenant_id` on every row; RLS deny-by-default, explicit per-role policies; cross-tenant probes are a mandatory test class (§8).
- **RLS implications:** clients hold least-privilege grants; all financial mutation via RPC (no direct table writes from app roles); service-role paths are reason-coded jobs, never user proxies.
- **Role validation:** Admin / Manager / Staff / Restricted Cashier (cashier: sales + collections only; no reports, settings, corrections, adjustments).
- **Admin approval verification:** approvals bind approver identity (JWT sub) + timestamp + scope hash; approver must differ from requester (separation of duties) **[★ PROPOSAL]**; approvals expire after 15 min **[★ PROPOSAL]**.
- **Audit:** append-only `audit_logs` (actor, action, entity, before/after, device, idempotency key); no updates/deletes by any app role.
- **No client trust:** server recomputes all totals from lines/lots/tax state; mismatch beyond ₹0.01 → reject (`TOTAL_MISMATCH`); GST dormant in v1 (seams only).

## 7. Recovery
- **Failed sync:** item-level `failed` state with reason; batch continues past failures (atomic per document, not per batch) **[★ PROPOSAL]**.
- **Partial failures:** each document carries its own state; watermark advances only past acknowledged items; never mark unsent items sent.
- **Retry handling:** transient (network/timeout/lock) auto-retries per §2; semantic rejections never auto-retry.
- **Manual reconciliation:** exception-queue screen (filter by reason/device/age); actions: correct-and-resubmit (new version), discard (→cancelled), escalate; every action audited with actor.
- **Device/browser loss:** server is source of truth; unflushed device-local drafts are LOST and this must be disclosed in UX (outbox flush indicator + "N unsynced" badge **[★ PROPOSAL]**); re-register device, resume from server watermark.
- **Backup/restore:** RPO 24h / RTO 4h **[LOCKED]**; restores replay from server state — devices re-sync from watermark post-restore; idempotency keys make replay safe.

## 8. Testing requirements (all CI-blocking, exit-code-0 evidence)
- **Unit:** state-machine transitions (legal/illegal), FIFO allocator (multi-lot, partial, expiry skip), totals recomputation, rounding half-up cases, approval binding/expiry.
- **Integration:** full sale→sync→validate→post→journal-balance; return→restock→refund; day-close variance ₹1 rule; opening-balance lock.
- **Offline/online transitions:** kill network mid-queue; restart app with pending outbox; expired-auth flush; device revoke mid-queue.
- **Duplicate submission:** same key twice (one effect); same payload new key (rejected or new doc per policy); replay after posted.
- **Concurrent FIFO:** two devices racing the last unit (exactly one wins; loser gets INSUFFICIENT_STOCK + audit).
- **Financial invariants:** balanced journals, immutable posted, mirror reversals, khata-limit enforcement, no NULL instruments.
- **Cross-tenant security:** tenant-B token reading/writing tenant-A rows (deny); function ACL matrix per overload (PUBLIC/anon/auth/sr).

## 9. Open design risks (unresolved — do not treat as decided)
1. **Offline cash acceptance:** may a cashier take cash offline? ★ PROPOSAL: yes, record-only, recognized only after server validation + next-day reconciliation; unvalidated cash is the operator's liability window. Needs owner sign-off (fraud surface).
2. **All-or-nothing documents:** ★ proposed (§3); alternative is partial fulfilment with backorders — needs owner call (ledger simplicity vs sales flexibility).
3. **Reservation TTL (24h), retry caps, approval expiry (15 min), near-expiry warning days (? OPEN: propose 30/7-day bands)** — all tunable, all need values.
4. **Provisional numbering UX:** unsynced watermark approach needs design review (customer-facing confusion risk).
5. **Clock skew:** server time authoritative; device timestamps informational only (proposed).
6. **Back-entry workflow** (pre-2026-01-01) interplay with FIFO lots and opening balances — undefined; needs a dedicated mini-spec.
7. **Record-only services** (AEPS/DMT/UPI/Recharge/BBPS): exact recorded fields per service undefined — needs per-service field lists.
8. **GST-dormant seams:** which tables/flags ship in V1 baseline vs later — to be fixed in schema review, or dormant code rots.

## 10. Owner Decisions Required Before V1 Schema
Nothing below is decided. Each item states operational impact and a safe
★ PROPOSAL. Owner approval stays pending for all eleven.

1. **Offline cash acceptance policy.** Impact: cash taken offline is invisible to the server until sync; theft/loss disputes and day-close gaps fall on the operator. ★ PROPOSAL: allow offline cash as record-only claims, recognized only after server validation; unvalidated cash is an explicit operator-liability window with next-day reconciliation.
2. **All-or-nothing vs partial fulfilment.** Impact: strict mode rejects whole documents on any short line (simpler ledger, lost sales); partial mode needs backorder/lot-split schema. ★ PROPOSAL: all-or-nothing per document in v1.
3. **Reservation TTL.** Impact: longer holds protect sales but starve other devices; shorter holds free stock but lose sales. ★ PROPOSAL: 24h provisional holds, auto-released, visible as `reserved_qty`.
4. **Sync retry limits.** Impact: unbounded retry wastes bandwidth and delays dead-lettering; too-aggressive caps strand valid sales. ★ PROPOSAL: exponential backoff base 30s ×2, 15-min cap, 48h max age; semantic rejections never auto-retry.
5. **Approval expiry.** Impact: stale approvals executed late bypass current intent. ★ PROPOSAL: admin approvals expire after 15 min and bind approver + timestamp + scope hash.
6. **Near-expiry warning period.** Impact: too early drowns staff in noise; too late wastes stock. ★ PROPOSAL: 30-day watch band + 7-day action band per lot.
7. **Provisional invoice-numbering UX.** Impact: customers shown numbers that later change causes disputes. ★ PROPOSAL: provisional numbers watermarked "UNSYNCED — not final"; canonical numbers only post-validation.
8. **Server-authoritative time.** Impact: device clocks skew; ordering and expiry depend on trustworthy timestamps. ★ PROPOSAL: server time authoritative for all business timestamps; device time informational only.
9. **Historical back-entry mini-spec.** Impact: pre-2026-01-01 transactions need lot-aware backfill rules interacting with opening balances and FIFO lots. ★ PROPOSAL: dedicated mini-spec required; no back-entry schema until it exists.
10. **Record-only field lists (AEPS, DMT, UPI, Recharge, BBPS).** Impact: unknown fields = missing columns = sync rejections or data loss at intake. ★ PROPOSAL: owner confirms per-service field lists (transaction ref, amounts, fee, counterparty identifiers, timestamps); baseline ships exactly those columns, nothing speculative.
11. **GST dormant seam list.** Impact: shipping too much dormant tax schema rots; shipping too little forces retrofit. ★ PROPOSAL: V1 ships HSN/rate masters with effective dating + supply-type/B2B flags only; computation and filing stay out.

## 11. Schema Blockers (must resolve before schema design)
- **#2 fulfilment mode** — decides line-level status columns and whether backorder structures exist.
- **#10 service field lists** — decides `service_transactions` columns per type.
- **#11 GST seams** — decides which tax tables/columns ship in V1.
- **#9 back-entry spec** — decides opening/lot backfill structures and date handling.
- **#1 cash policy (partial)** — decides payment claim-state columns (recorded vs recognized).
- Non-blocking (shippable on ★ defaults, tunable later): #3 TTL, #4 retry caps, #5 approval expiry, #6 warning bands, #7 provisional UX, #8 server time.
- All A2 locked decisions are preserved unchanged; no proposal above is approved.
