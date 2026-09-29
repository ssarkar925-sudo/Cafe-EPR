import { createClient } from "@/lib/supabase/server";
import { createSaiEvidence } from "@/lib/sai/core/evidence";
import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult } from "@/lib/sai/core/types";

type Actor = { userId: string; businessId: string };
type Row = Record<string, any>;
const MAX_ROWS = 100;
const AUTHORITY_NOTE = "Read-only observation through CafeERP back-office policies. SAI does not post, edit, reverse, or settle financial records.";

function limitOf(input: Record<string, unknown>, fallback = 30): number {
  const n = Number(input.limit ?? fallback);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(n))) : fallback;
}
function dateOf(value: unknown, fallback: string): string {
  const candidate = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}
function roundMoney(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}
function evidenceId(topic: string): string {
  return `sai:finance:${topic}:${crypto.randomUUID()}`;
}
async function recordEvidence(actor: Actor, topic: string, sourceRef: string, data: Record<string, unknown>) {
  const id = evidenceId(topic);
  await createSaiEvidence({
    evidenceId: id,
    actor,
    sourceType: `cafeerp.finance.${topic}`,
    sourceRef,
    data: { ...data, observedAt: new Date().toISOString(), authorityNote: AUTHORITY_NOTE },
    confidence: 1,
  });
  return id;
}
function fail(topic: string, error: { message: string }): SaiCapabilityResult {
  return { ok: false, error: `SAI_FINANCE_${topic.toUpperCase()}_READ_FAILED:${error.message}` };
}

async function observeCash(actor: Actor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = dateOf(input.from, today);
  const to = dateOf(input.to, today);
  const limit = limitOf(input);
  const [entries, customers] = await Promise.all([
    supabase.from("cash_entries")
      .select("id,entry_date,method,direction,amount,description,ref_type,ref_id,created_at")
      .eq("method", "cash").gte("entry_date", from).lte("entry_date", to)
      .order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit),
    supabase.from("customers").select("id,name,phone,balance").gt("balance", 0)
      .order("balance", { ascending: false }).limit(limit),
  ]);
  if (entries.error) return fail("CASH", entries.error);
  if (customers.error) return fail("CASH_DUES", customers.error);
  const rows = (entries.data ?? []) as Row[];
  const dues = (customers.data ?? []) as Row[];
  const totalIn = rows.filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalOut = rows.filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const output = {
    observed: true, period: { from, to },
    movements: { count: rows.length, cashIn: roundMoney(totalIn), cashOut: roundMoney(totalOut), netMovement: roundMoney(totalIn - totalOut) },
    entries: rows.map((r) => ({ id: r.id, date: r.entry_date, direction: r.direction, amount: roundMoney(r.amount), description: r.description, referenceType: r.ref_type, referenceId: r.ref_id })),
    outstandingCustomerDues: {
      customerCount: dues.length,
      amountInReturnedRows: roundMoney(dues.reduce((s, r) => s + Number(r.balance ?? 0), 0)),
      customers: dues.map((r) => ({ customerId: r.id, name: r.name, phoneLast4: String(r.phone ?? "").replace(/\D/g, "").slice(-4) || null, balance: roundMoney(r.balance) })),
      limited: dues.length === limit,
    },
    source: "cash_entries and customers.balance",
    authorityNote: AUTHORITY_NOTE,
  };
  const id = await recordEvidence(actor, "cash", `cash_entries:${from}..${to}`, output);
  return { ok: true, output, evidenceIds: [id] };
}

async function observeFloat(actor: Actor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payment_instruments")
    .select("id,name,type,is_active,opening_balance,current_balance,created_at")
    .eq("is_active", true).order("type").order("name").limit(limitOf(input));
  if (error) return fail("FLOAT", error);
  const instruments = (data ?? []) as Row[];
  const threshold = Math.max(0, Number(input.threshold ?? 1000) || 0);
  const output = {
    observed: true,
    instruments: instruments.map((r) => ({
      instrumentId: r.id, name: r.name, type: r.type,
      openingBalance: roundMoney(r.opening_balance), currentBalance: roundMoney(r.current_balance),
      movementSinceOpening: roundMoney(Number(r.current_balance ?? 0) - Number(r.opening_balance ?? 0)),
      attention: Number(r.current_balance ?? 0) <= threshold ? "low_float" : null,
    })),
    lowFloatThreshold: threshold,
    lowFloatCount: instruments.filter((r) => Number(r.current_balance ?? 0) <= threshold).length,
    source: "payment_instruments.current_balance (CafeERP canonical instrument balance)",
    authorityNote: AUTHORITY_NOTE,
  };
  const id = await recordEvidence(actor, "float", "payment_instruments:is_active=true", output);
  return { ok: true, output, evidenceIds: [id] };
}

async function observeSettlements(actor: Actor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = dateOf(input.from, today);
  const to = dateOf(input.to, today);
  const { data, error } = await supabase.from("settlements")
    .select("id,settlement_number,settlement_type,settlement_date,from_pool,to_pool,direction,amount,reference,remarks,status,reversed_at,created_at")
    .gte("settlement_date", from).lte("settlement_date", to)
    .order("settlement_date", { ascending: false }).order("created_at", { ascending: false }).limit(limitOf(input));
  if (error) return fail("SETTLEMENTS", error);
  const rows = (data ?? []) as Row[];
  const output = {
    observed: true, period: { from, to },
    summary: {
      count: rows.length,
      successfulCount: rows.filter((r) => r.status === "success").length,
      reversedCount: rows.filter((r) => r.status === "reversed").length,
      amount: roundMoney(rows.filter((r) => r.status === "success").reduce((s, r) => s + Number(r.amount ?? 0), 0)),
    },
    settlements: rows.map((r) => ({
      id: r.id, number: r.settlement_number, type: r.settlement_type, date: r.settlement_date,
      fromPool: r.from_pool, toPool: r.to_pool, direction: r.direction, amount: roundMoney(r.amount),
      reference: r.reference, status: r.status, reversedAt: r.reversed_at, remarks: r.remarks,
    })),
    statusSemantics: "The authoritative settlements schema uses success/reversed states; it does not define a pending state.",
    source: "settlements",
    authorityNote: AUTHORITY_NOTE,
  };
  const id = await recordEvidence(actor, "settlements", `settlements:${from}..${to}`, output);
  return { ok: true, output, evidenceIds: [id] };
}

async function observeReconciliation(actor: Actor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = dateOf(input.from, new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const to = dateOf(input.to, today);
  const limit = limitOf(input, 100);
  const [transactions, journals] = await Promise.all([
    supabase.from("transactions")
      .select("id,transaction_number,service_type,status,transaction_date,transaction_timestamp,amount,service_fee,portal_charge,portal_commission")
      .in("status", ["success", "successful", "completed", "posted"])
      .gte("transaction_date", from).lte("transaction_date", to)
      .order("transaction_date", { ascending: false }).limit(limit),
    supabase.from("accounting_transaction_register")
      .select("id,entry_number,entry_date,source_type,source_id,description,status,total_debit,total_credit,line_count")
      .eq("status", "posted").gte("entry_date", from).lte("entry_date", to)
      .order("entry_date", { ascending: false }).limit(limit),
  ]);
  if (transactions.error) return fail("RECONCILIATION_TRANSACTIONS", transactions.error);
  if (journals.error) return fail("RECONCILIATION_JOURNALS", journals.error);
  const txRows = (transactions.data ?? []) as Row[];
  const journalRows = (journals.data ?? []) as Row[];
  const serviceJournals = journalRows.filter((r) => r.source_type === "service_transaction");
  const sourceCounts = new Map<string, number>();
  for (const row of serviceJournals) {
    const key = String(row.source_id ?? "");
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const missingAccounting = txRows.filter((t) => !sourceCounts.has(String(t.id))).map((t) => ({
    transactionId: t.id, transactionNumber: t.transaction_number, serviceType: t.service_type,
    status: t.status, date: t.transaction_timestamp || t.transaction_date, amount: roundMoney(t.amount),
  }));
  const duplicateAccounting = [...sourceCounts.entries()].filter(([, count]) => count > 1).map(([sourceId, count]) => ({
    sourceId, entryCount: count,
    entries: serviceJournals.filter((r) => String(r.source_id) === sourceId).map((r) => ({ entryId: r.id, entryNumber: r.entry_number })),
  }));
  const unbalancedEntries = journalRows.filter((r) => Math.abs(Number(r.total_debit ?? 0) - Number(r.total_credit ?? 0)) >= 0.01).map((r) => ({
    entryId: r.id, entryNumber: r.entry_number, date: r.entry_date, sourceType: r.source_type,
    sourceId: r.source_id, debit: roundMoney(r.total_debit), credit: roundMoney(r.total_credit),
    variance: roundMoney(Number(r.total_debit ?? 0) - Number(r.total_credit ?? 0)),
  }));
  const output = {
    observed: true, period: { from, to },
    counts: { successfulServiceTransactions: txRows.length, postedAccountingEntries: journalRows.length, missingAccountingEntries: missingAccounting.length, duplicateAccountingSources: duplicateAccounting.length, unbalancedEntries: unbalancedEntries.length },
    findings: { missingAccounting, duplicateAccounting, unbalancedEntries },
    coverage: { transactionsLimited: txRows.length === limit, accountingEntriesLimited: journalRows.length === limit },
    source: "transactions joined by source_id to accounting_transaction_register (posted general ledger)",
    authorityNote: AUTHORITY_NOTE,
  };
  const id = await recordEvidence(actor, "reconciliation", `transactions+accounting_transaction_register:${from}..${to}`, output);
  return { ok: true, output, evidenceIds: [id] };
}

async function observeAttention(actor: Actor, input: Record<string, unknown>): Promise<SaiCapabilityResult> {
  const supabase = await createClient();
  const threshold = Math.max(0, Number(input.threshold ?? 1000) || 0);
  const [cash, instruments, settlements, dues, failedTx, missingAccounting] = await Promise.all([
    supabase.from("cash_entries").select("direction,amount").eq("method", "cash"),
    supabase.from("payment_instruments").select("id,name,type,current_balance").eq("is_active", true).lte("current_balance", threshold).limit(50),
    supabase.from("settlements").select("id,settlement_number,settlement_date,amount,status,remarks").eq("status", "reversed").order("settlement_date", { ascending: false }).limit(25),
    supabase.from("customers").select("id,name,balance").gt("balance", 0).order("balance", { ascending: false }).limit(25),
    supabase.from("transactions").select("id,transaction_number,service_type,status,transaction_date,amount").in("status", ["failed", "pending", "processing"]).order("transaction_date", { ascending: false }).limit(50),
    supabase.from("transactions").select("id,transaction_number,service_type,status,transaction_date").in("status", ["success", "successful", "completed", "posted"]).order("transaction_date", { ascending: false }).limit(100),
  ]);
  for (const [key, result] of Object.entries({ cash, instruments, settlements, dues, failedTx, missingAccounting })) {
    if (result.error) return fail(`ATTENTION_${key.toUpperCase()}`, result.error);
  }
  const cashRows = (cash.data ?? []) as Row[];
  const cashBalance = cashRows.reduce((sum, r) => sum + (r.direction === "in" ? 1 : -1) * Number(r.amount ?? 0), 0);
  const attention: Array<Record<string, unknown>> = [];
  if (cashBalance <= threshold) attention.push({ type: "low_cash", severity: cashBalance < 0 ? "critical" : "warning", amount: roundMoney(cashBalance), detail: "Derived from the canonical cash-entry trail." });
  for (const r of instruments.data ?? []) attention.push({ type: "low_float", severity: Number(r.current_balance ?? 0) <= 0 ? "critical" : "warning", instrumentId: r.id, name: r.name, balance: roundMoney(r.current_balance) });
  for (const r of settlements.data ?? []) attention.push({ type: "reversed_settlement", severity: "warning", settlementId: r.id, number: r.settlement_number, amount: roundMoney(r.amount), date: r.settlement_date, detail: r.remarks });
  for (const r of dues.data ?? []) attention.push({ type: "customer_due", severity: "info", customerId: r.id, name: r.name, balance: roundMoney(r.balance) });
  for (const r of failedTx.data ?? []) attention.push({ type: "service_transaction_attention", severity: "warning", transactionId: r.id, transactionNumber: r.transaction_number, serviceType: r.service_type, status: r.status, amount: roundMoney(r.amount) });
  const journalResult = await supabase.from("accounting_transaction_register")
    .select("source_id").eq("status", "posted").eq("source_type", "service_transaction").limit(500);
  if (journalResult.error) return fail("ATTENTION_ACCOUNTING", journalResult.error);
  const postedIds = new Set((journalResult.data ?? []).map((r: Row) => String(r.source_id)));
  for (const r of missingAccounting.data ?? []) if (!postedIds.has(String(r.id))) {
    attention.push({ type: "missing_accounting_entry", severity: "warning", transactionId: r.id, transactionNumber: r.transaction_number, serviceType: r.service_type, date: r.transaction_date });
  }
  const output = {
    observed: true, attentionCount: attention.length, attention,
    thresholds: { lowCashOrFloat: threshold },
    coverage: { recentTransactions: (missingAccounting.data ?? []).length, transactionWindowLimited: (missingAccounting.data ?? []).length === 100 },
    source: "cash_entries, payment_instruments, settlements, customers, transactions, accounting_transaction_register",
    authorityNote: AUTHORITY_NOTE,
  };
  const id = await recordEvidence(actor, "attention", "finance-operational-attention", output);
  return { ok: true, output, evidenceIds: [id] };
}

export function registerFinanceIntelligenceCapabilities(): void {
  const defs = [
    { id: "finance.observe_cash", description: "Observe cash book movements, derived cash balance movement, and customer dues.", fn: observeCash },
    { id: "finance.observe_float", description: "Observe authoritative bank, wallet, AEPS, DMT, and UPI instrument balances.", fn: observeFloat },
    { id: "finance.observe_settlements", description: "Observe settlement status and movement between financial pools.", fn: observeSettlements },
    { id: "finance.reconcile", description: "Find missing or duplicate service accounting entries and unbalanced posted journal entries.", fn: observeReconciliation },
    { id: "finance.observe_attention", description: "Summarize low cash/float, customer dues, reversed settlements, failed transactions, and missing accounting entries.", fn: observeAttention },
  ] as const;
  for (const def of defs) {
    try {
      registerSaiCapability({
        id: def.id, description: def.description, domain: "finance", kind: "observe",
        risk: "read", requiresApproval: false, mutates: false, verificationRequired: false,
        execute: async (input, ctx) => def.fn(ctx.command.actor, input),
      });
    } catch {
      // Idempotent module initialization.
    }
  }
}
registerFinanceIntelligenceCapabilities();
