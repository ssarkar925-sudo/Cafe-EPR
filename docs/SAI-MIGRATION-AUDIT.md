# SAI Migration & Dependency Audit

Repository: ssarkar925-sudo/Cafe-EPR
Base: main
Audit branch: feature/sai-migration-audit
Date: 2026-09-28

## Executive decision

SAI will NOT replace CafeERP's deterministic business engines. SAI becomes the intelligence/orchestration layer above them.

Architecture:

EXTERNAL SOURCES / USER / DEVICES
→ COLLECT / EVIDENCE
→ SAI COGNITION
→ PLAN / POLICY / COMMAND
→ CAFEERP DOMAIN ENGINE
→ DATABASE
→ VERIFICATION
→ SAI MEMORY / LEARNING

Financial/accounting truth remains in CafeERP domain RPCs, database constraints/RLS, reconciliation, and financial-integrity engines.

## Migration statuses

- KEEP: deterministic infrastructure or business authority; retain behavior and expose a typed SAI capability.
- REFACTOR: useful logic stays, but ownership/API moves under /lib/sai.
- REPLACE: old AI brain/runtime is replaced by SAI core.
- RETIRE: old UI/API surface should disappear after compatibility migration.
- ISOLATE: powerful engineering/repair capability stays separate from normal SAI autonomy.
- COMPATIBILITY: keep temporarily as a thin adapter while callers migrate.

## lib/ai classification

### REPLACE — old AI brain
- lib/ai/agent-runtime.ts — replace with SAI session/cognition/plan/command runtime.
- lib/ai/agent-policy.ts — replace with SAI policy/autonomy engine. Preserve approval concepts, but redesign around capability/risk/budget.
- lib/ai/approval-gate.ts — replace with SAI command authorization/idempotency/approval layer.
- lib/ai/command-center.ts — replace with SAI command/mission control.
- lib/ai/advisor-engine.ts — refactor into SAI cognition/insight capabilities.
- lib/ai/multi-provider-engine.ts — refactor into SAI model router/provider adapter. Models are a cognition dependency, not the agent itself.

### REFACTOR — valuable intelligence becomes SAI capability
- lib/ai/customer-intelligence.ts — SAI customer capability.
- lib/ai/customer-matcher.ts — SAI identity/matching capability.
- lib/ai/data-collector.ts — SAI universal intake/extraction layer.
- lib/ai/transaction-import.ts — SAI external-transaction intake/reconciliation staging.
- lib/ai/business-monitor.ts — SAI event/attention engine.
- lib/ai/audit-ai.ts — SAI audit/explanation capability.
- lib/ai/diagnostic.ts — SAI observability/self-diagnostic capability.
- lib/ai/phone-collector.ts — SAI device collector adapter.
- lib/ai/vault.ts — SAI evidence/document capability.
- lib/ai/portal-workflows.ts — SAI procedural skill/workflow layer.

### KEEP AS DOMAIN / SAFETY AUTHORITY, expose through SAI
- lib/ai/financial-integrity.ts — deterministic verification authority.
- lib/ai/reconciliation-engine.ts — deterministic reconciliation authority.
- lib/ai/reconciliation.ts — reconciliation primitives/authority.
- lib/ai/periodic-closing.ts — day-close/periodic-close domain logic.
- lib/ai/accountant.ts — accounting analysis/domain support; remove AI-brain coupling where present.
- lib/ai/inventory-auditor.ts — inventory audit authority.
- lib/ai/ingestion-auth.ts — ingestion security boundary.
- lib/ai/ingestion-dedupe.ts — evidence dedupe.
- lib/ai/ingestion-extraction.ts — evidence extraction.
- lib/ai/ingestion-normalizer.ts — evidence normalization.
- lib/ai/ingestion-processor.ts — ingestion pipeline orchestration; later move under SAI intake.
- lib/ai/ingestion-types.ts — canonical evidence types; migrate to SAI evidence types.
- lib/ai/ingestion-validation.ts — intake validation.
- lib/ai/browser-worker.ts — read-only browser safety boundary; migrate under SAI watchers.
- lib/ai/secret-guard.ts — mandatory global security primitive; migrate to SAI security/evidence boundary.
- lib/ai/portal-adapters/* — retain provider-specific read-only adapters; SAI watcher registry owns them.

### ISOLATE — Engineering Control Plane
- lib/ai/code-repair.ts — keep separate from normal business autonomy; SAI may request diagnosis/repair but code mutation remains separately authorized.
- lib/ai/autonomous-bug-investigator.ts — engineering investigation capability.
- lib/ai/self-healing.ts — engineering/system recovery capability.

## API classification

### REPLACE / new SAI canonical APIs
- /api/ai/agent → /api/sai/chat + /api/sai/run
- /api/ai/advisor → /api/sai/chat or /api/sai/insights
- /api/ai/command-center → /api/sai/missions + /api/sai/tasks + /api/sai/status
- /api/ai/memory → /api/sai/memory
- /api/ai/learning → /api/sai/learning
- /api/ai/monitor → /api/sai/events + attention
- /api/ai/provider-config → /api/sai/models/config
- /api/ai/provider-test → /api/sai/models/test
- /api/ai/translate → native SAI multilingual cognition; retain only as a utility if still needed
- /api/ai/quick-sale → SAI POS capability
- /api/ai/transaction-import → /api/sai/intake/transactions
- /api/ai/extract → /api/sai/vision/extract
- /api/ai/whatsapp → SAI communication capability
- /api/ai/self-heal → isolated engineering/system recovery endpoint
- /api/ai/code-repair → isolated engineering control-plane endpoint
- /api/ai/audit-run → SAI audit mission over deterministic audit engine
- /api/ai/audit-explain → SAI audit explanation
- /api/ai/audit-resolve → SAI audit resolution workflow

### REFACTOR / KEEP FUNCTIONALITY
- /api/ai/portal-watcher → /api/sai/watchers; preserve existing multi-source watcher behavior.
- /api/ai/ingestion/* → /api/sai/intake/*; preserve evidence-first, no-direct-financial-write invariant.

### COMPATIBILITY
Keep old /api/ai routes temporarily as thin adapters to SAI during migration. Do not maintain two independent AI brains.

## Component classification

### RETIRE / REPLACE UI
- components/ai/cafe-ai-agent.tsx
- components/ai/ai-agent-launcher.tsx
- components/ai/ai-control-center.tsx
- components/ai/ai-command-center.tsx
- components/ai/ai-mission-control-studio.tsx
- components/ai/accountant-advisor-panel.tsx

These become one SAI experience surface plus SAI Control Room.

### REFACTOR INTO SAI UI
- components/ai/ai-business-watcher.tsx → SAI attention/watchers.
- components/ai/ai-ingestion-panel.tsx → SAI Intake/Evidence.
- components/ai/ai-learning-control-center.tsx → SAI Learning.
- components/ai/ai-memory-panel.tsx → SAI Memory.
- components/ai/financial-integrity-dashboard.tsx → SAI verification/audit view, still backed by deterministic engine.
- components/ai/phone-collector-panel.tsx → SAI device/collector management.
- components/ai/ai-whatsapp-bridge.tsx → SAI communication capability.
- components/ai/audit-ops-strip.tsx → SAI attention/verification strip.

### ISOLATE
- components/ai/ai-code-repair-guardian.tsx → Engineering Control Room, not normal SAI chat.

## Existing business systems SAI must consume, not duplicate

1. POS/sales and canonical sale creation.
2. Customer/Khata and customer search/creation.
3. Catalog/products/services.
4. Inventory/stock movements.
5. Purchases/suppliers.
6. AEPS transaction engine.
7. DMT transaction engine.
8. UPI transaction engine.
9. Recharge/BBPS/Google Play service engines.
10. Cash/bank/wallet/AEPS/DMT/UPI pools.
11. Settlements.
12. Journal/general ledger/chart of accounts.
13. P&L/trial balance.
14. GST/tax preparation.
15. Reconciliation.
16. Day close.
17. Audit and financial-integrity checks.
18. Staff/roles/security/RLS.
19. WhatsApp.
20. Desktop printing and watcher infrastructure.
21. Android collectors.

## Critical conflicts found

### 1. Two AI identities
The existing policy already calls the old runtime "SAI". This is a naming collision, not a real SAI architecture. The migration must replace the runtime, not merely rename it.

### 2. AI writes are approval-centric but not command-centric
Existing approval flow separates claim/write/mark-executed. SAI needs one idempotent command lifecycle:
planned → validated → authorized → executing → executed → verified.

### 3. Provider configuration is duplicated
Existing provider configuration exists in AI config surfaces and provider tables/settings. SAI should have one canonical model-router configuration source.

### 4. Memory is not yet a complete SAI memory system
Existing memory should be migrated to typed memories with provenance, confidence, scope, version, effective dates, and approval state.

### 5. Learned workflows can become active too easily
Learning must become:
candidate → evaluate → test → approve/promote → active → measure.

### 6. Current heuristic and model agent paths diverge
SAI should have one cognition contract and deterministic fallback behavior, not two different agents with different tool semantics.

### 7. Financial state must be verified after every consequential command
No "tool returned success" is sufficient. SAI must reread real CafeERP state.

### 8. External collection is not accounting
Portal/SMS/mobile/document observations must remain evidence/observation objects until matched, validated, authorized, executed, and verified.

## POS migration target

POS is a first-class SAI capability.

POS events already originate inside CafeERP, so no external collector is required.

Target flow:

POS event
→ SAI observes
→ update world state
→ classify significance
→ verify invoice/stock/payment/ledger
→ notify or investigate when necessary.

For SAI-initiated POS work:

User intent
→ identify customer/catalog
→ build typed sale plan
→ validate stock/GST/payment
→ policy
→ idempotent canonical sale command
→ verify invoice + stock + payment + ledger
→ record trace/learning.

Temporary POS items must be supported without automatically creating permanent catalog masters.

## External transaction target

DigiPay/AEPS, DMT, UPI and other collectors:

SOURCE
→ THIN COLLECTOR
→ SECURE EVIDENCE
→ EXTRACT
→ NORMALIZE
→ CLASSIFY
→ CUSTOMER MATCH
→ DEDUPE
→ RECONCILE
→ ASK ONLY FOR MISSING DATA
→ SAVE CONFIRMATION
→ COMMAND
→ VERIFY
→ LEARN

The collector never becomes the financial authority.

## Device responsibility

### Browser
Primary ERP UI and SAI experience.

### Windows/Electron
Native printing, notifications, controlled browser/portal collection.

### Android
Thin collectors: notification/accessibility/share/screenshot/document capture where explicitly permitted; offline queue; secure upload.

### Server
SAI brain, world model, memory, planning, policy, command orchestration, verification, learning.

### Database/domain layer
Financial/business truth.

## SAI canonical capability domains

- pos
- customers
- catalog
- inventory
- procurement
- aeps
- dmt
- upi
- recharge
- bbps
- digital_vouchers
- finance
- pools
- settlements
- reconciliation
- reports
- tax
- audit
- whatsapp
- portal_watchers
- external_intake
- vision
- voice
- device_collectors
- security
- engineering

## Migration rule

Do NOT delete existing AI files in this audit phase.

First create SAI interfaces and adapters, migrate callers, run verification, then retire old routes/components.

The first implementation phase after this audit should be:
1. SAI type contracts
2. capability registry
3. world-state/event model
4. command + idempotency model
5. policy/approval engine
6. verification contract
7. POS capability
8. compatibility adapter for the old /api/ai/agent route

No financial schema or canonical business RPC should be replaced by an LLM-driven implementation.
