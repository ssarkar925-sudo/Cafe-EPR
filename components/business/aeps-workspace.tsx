"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { createCustomerRecord } from "@/lib/customers";
import ScanFillModal from "@/components/scan-fill/scan-fill-modal";
import { extractForMode, type ScanFields } from "@/lib/scan/extract";
import {
  getDefaultAepsPricingRules,
  PURPOSE_LABELS,
  TOP_INDIAN_BANKS,
  normalizeBankName,
  matchBank,
  matchBankExactName,
  normalizeTransactionType,
  normalizeRuleTransactionType,
  formatRuleTransactionType,
  resolvePricingFromRules,
  getDynamicDenominations,
  crossVerifySourceObservations,
  type PortalWatcherSource,
  type PortalChangeRecord,
  type PortalSourcePurpose,
  type PortalCollectionRun,
  type PortalCollectionObservation,
  type VerifiedTransactionContext,
  type AepsPricingRule,
  type PortalAuditRecord,
  type AepsTxnType,
  validatePortalSourceUrl,
  VALID_PORTAL_PURPOSES,
} from "@/lib/aeps/portal-watcher";
import type { CustomerRow, Master, Txn } from "./business-client";

export { normalizeBankName, matchBank, TOP_INDIAN_BANKS };

/** Privacy-safe mobile masker: e.g. 9876543210 -> 98••••••10 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
  }
  return clean;
}

/** Get customer initials for avatar display e.g. "Amit Biswas" -> "AB" */
export function getCustomerInitials(fullName: string | null | undefined): string {
  if (!fullName) return "CU";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

interface DraftRecord {
  id: string;
  savedAt: string;
  customerId: string;
  mobile: string;
  name: string;
  aadhaar: string;
  transactionType: string;
  collectionMethod?: string;
  feeSource?: "cut_from_withdrawal" | "separate_cash" | "upi";
  amount: string;
  fee: string;
  commission: string;
  bankId: string;
  portalId: string;
  bankRef: string;
  portalRef: string;
}

export default function AepsWorkspace({
  initialTransactions,
  initialCustomers,
  initialBanks,
  initialPortals,
  float,
}: {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialBanks: Master[];
  initialPortals: Master[];
  paymentInstruments?: any[];
  float: any;
}) {
  const supabase = createClient();
  const { showToast } = useToast();

  // Local bank master state lets newly-created exact-match banks become
  // selectable immediately without a full page refresh.
  const [bankOptions, setBankOptions] = useState<Master[]>(initialBanks);
  useEffect(() => {
    setBankOptions(initialBanks);
  }, [initialBanks]);

  const [bankCreateOpen, setBankCreateOpen] = useState(false);
  const [bankCreateName, setBankCreateName] = useState("");
  const [bankCreateCode, setBankCreateCode] = useState("");
  const [bankCreateReason, setBankCreateReason] = useState("");
  const [bankCreateBusy, setBankCreateBusy] = useState(false);
  const [unmatchedBankName, setUnmatchedBankName] = useState<string | null>(null);
  const [rows, setRows] = useState<Txn[]>(initialTransactions);
  const [activeTab, setActiveTab] = useState<"workspace" | "watcher" | "ledger">("workspace");

  // Filtering & Search
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Form Mode & State
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [transactionType, setTransactionType] = useState<AepsTxnType>("cash_out");
  const [collectionMethod, setCollectionMethod] = useState<"aeps_portal" | "cash" | "bank" | "upi">("aeps_portal");
  const [feeSource, setFeeSource] = useState<"cut_from_withdrawal" | "separate_cash" | "upi">("cut_from_withdrawal");
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [sourceSectionOpen, setSourceSectionOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [pastedSourceText, setPastedSourceText] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form Fields
  const [customerId, setCustomerId] = useState("");
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [commission, setCommission] = useState("");
  const [bankId, setBankId] = useState("");
  const [portalId, setPortalId] = useState(initialPortals[0]?.id || "");
  const [bankRef, setBankRef] = useState("");
  const [portalRef, setPortalRef] = useState("");
  const [transactionRef, setTransactionRef] = useState("");

  // Universal Customer Search State
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [searchHasQueried, setSearchHasQueried] = useState(false);
  const [selectedCustomerRecord, setSelectedCustomerRecord] = useState<any | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Drafts
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Pricing Rules Engine State
  const [pricingRules, setPricingRules] = useState<AepsPricingRule[]>([]);
  const [pricingRulesLoaded, setPricingRulesLoaded] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [selectedRulesPortalId, setSelectedRulesPortalId] = useState(initialPortals[0]?.id || "");
  const [rulesTxnFilter, setRulesTxnFilter] = useState<string>("all");
  const [editingRule, setEditingRule] = useState<AepsPricingRule | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);

  // Multi-Source Portal Watcher State
  // Watcher sources are configuration data, not application defaults.
  // Start empty and hydrate exclusively from persisted database records.
  const [watcherSources, setWatcherSources] = useState<PortalWatcherSource[]>([]);
  const [changeRecords, setChangeRecords] = useState<PortalChangeRecord[]>([]);
  const [selectedWatcherPortalId, setSelectedWatcherPortalId] = useState(initialPortals[0]?.id || "");
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [collectingSourceId, setCollectingSourceId] = useState<string | null>(null);
  const [liveWatcherActive, setLiveWatcherActive] = useState(false);
  const [liveWatcherPortalId, setLiveWatcherPortalId] = useState<string | null>(null);
  const [liveWatcherLastEventAt, setLiveWatcherLastEventAt] = useState<string | null>(null);
  const [liveWatcherDetectedCount, setLiveWatcherDetectedCount] = useState(0);
  const [liveWatcherError, setLiveWatcherError] = useState<string | null>(null);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourcePurpose, setNewSourcePurpose] = useState<PortalSourcePurpose>("commission");

  // Edit Source Modal State
  const [editSourceModalOpen, setEditSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<PortalWatcherSource | null>(null);
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editSourcePurpose, setEditSourcePurpose] = useState<PortalSourcePurpose>("commission");
  const [editSourcePortalId, setEditSourcePortalId] = useState("");
  const [editSourceEnabled, setEditSourceEnabled] = useState(true);
  const [editSourceDescription, setEditSourceDescription] = useState("");
  const [editSourceError, setEditSourceError] = useState<string | null>(null);
  const [isSavingEditSource, setIsSavingEditSource] = useState(false);

  // Delete Source Confirmation Modal State
  const [deleteSourceModalOpen, setDeleteSourceModalOpen] = useState(false);
  const [deletingSource, setDeletingSource] = useState<PortalWatcherSource | null>(null);
  const [isDeletingSource, setIsDeletingSource] = useState(false);

  // Hydrate ONLY persisted watcher sources and the persisted latest collection runs.
  // No defaults or synthetic verification state are merged into runtime state.
  useEffect(() => {
    let isMounted = true;
    async function loadPersistedSources() {
      try {
        const [sourceRes, runRes, ruleRes] = await Promise.all([
          fetch("/api/ai/portal-watcher"),
          fetch("/api/ai/portal-watcher?action=get_runs"),
          fetch("/api/ai/portal-watcher?action=get_rules"),
        ]);
        const sourceData = await sourceRes.json().catch(() => null);
        const runData = await runRes.json().catch(() => null);
        const ruleData = await ruleRes.json().catch(() => null);

        if (!sourceRes.ok || !sourceData?.success || !Array.isArray(sourceData.sources)) {
          throw new Error(sourceData?.error || "Unable to load saved watcher sources.");
        }
        if (!runRes.ok || !runData?.success || !Array.isArray(runData.runs)) {
          throw new Error(runData?.error || "Unable to load saved watcher verification history.");
        }
        if (!ruleRes.ok || !ruleData?.success || !Array.isArray(ruleData.rules)) {
          throw new Error(ruleData?.error || "Unable to load saved AEPS pricing rules.");
        }

        if (isMounted) {
          setWatcherSources(sourceData.sources);
          const persistedRules = ruleData.rules as AepsPricingRule[];
          // Code defaults are a fallback only when the database truly has no
          // persisted AEPS rules. Existing production rules are never replaced.
          setPricingRules(
            persistedRules.length > 0 ? persistedRules : getDefaultAepsPricingRules(initialPortals)
          );
          setPricingRulesLoaded(true);
          const runs = runData.runs as PortalCollectionRun[];
          setCollectionRuns(runs);
          const selected = runs.find((run) => run.portalId === portalId) || null;
          if (selected) {
            setCurrentRun(selected);
            setLastVerifiedAt(selected.completedAt || selected.startedAt);
          } else {
            setCurrentRun(null);
            setLastVerifiedAt(null);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setWatcherSources([]);
          setCollectionRuns([]);
          setCurrentRun(null);
          setLastVerifiedAt(null);
          setPricingRules([]);
          setPricingRulesLoaded(false);
          showToast("error", err?.message || "Unable to load saved watcher state.");
        }
      }
    }

    loadPersistedSources();
    return () => {
      isMounted = false;
    };
  }, [portalId, showToast]);


  // Portal Collection Run State
  const [collectionRuns, setCollectionRuns] = useState<PortalCollectionRun[]>([]);
  const [currentRun, setCurrentRun] = useState<PortalCollectionRun | null>(null);
  const [isVerifyingPortal, setIsVerifyingPortal] = useState(false);
  const [verificationProgressStep, setVerificationProgressStep] = useState("");
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  // Operator Override Audit State
  const [auditLogs, setAuditLogs] = useState<PortalAuditRecord[]>([]);

  const cleanAadhaar = aadhaar.replace(/\D/g, "");
  const cleanMobile = mobile.replace(/\D/g, "");

  // Auto-resolve pricing from published rules whenever portal, bank, transactionType, amount, customer, or feeSource changes
  useEffect(() => {
    const numAmount = Number(amount);
    if (!pricingRulesLoaded || !portalId) return;
    if (portalId) {
      const resolved = resolvePricingFromRules(pricingRules, {
        portalId,
        bankId,
        transactionType,
        amount: numAmount > 0 ? numAmount : 0,
        customerId,
        feeSource,
      });
      setFee(String(resolved.fee));
      setCommission(String(resolved.commission));
    }
  }, [amount, portalId, bankId, transactionType, customerId, feeSource, pricingRules]);

  // Keep single transaction reference in sync with underlying bankRef & portalRef
  const handleTransactionRefChange = (val: string) => {
    setTransactionRef(val);
    const cleanVal = val.trim();
    if (/^\d{10,14}$/.test(cleanVal)) {
      setBankRef(cleanVal);
      setPortalRef("");
    } else {
      setPortalRef(cleanVal);
      if (/^\d{6,}$/.test(cleanVal)) {
        setBankRef(cleanVal);
      }
    }
  };

  // Native desktop watcher event bridge.
  // Browser builds deliberately do not pretend to have an authenticated watcher.
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.isElectron || typeof api.onAepsWatcherEvent !== "function") return;

    const unsubscribe = api.onAepsWatcherEvent((event: any) => {
      const eventPortalId = String(event?.portalId || "");
      if (!eventPortalId) return;

      if (event.type === "multi_started") {
        setLiveWatcherActive(true);
        setLiveWatcherPortalId(eventPortalId);
        setLiveWatcherError(null);
        setLiveWatcherLastEventAt(new Date().toISOString());
        showToast("success", `Live watcher started: ${event.startedSourceCount}/${event.sourceCount} source URLs are being watched.`);
        return;
      }

      if (event.type === "source_ready" || event.type === "source_started") {
        setLiveWatcherLastEventAt(new Date().toISOString());
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === String(event.sourceId)
              ? { ...s, lastStatus: "idle", lastMessage: "Live watcher connected." }
              : s
          )
        );
        return;
      }

      if (event.type === "source_heartbeat") {
        setLiveWatcherLastEventAt(event.checkedAt || new Date().toISOString());
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === String(event.sourceId)
              ? {
                  ...s,
                  lastChecked: event.checkedAt || new Date().toISOString(),
                  lastStatus: event.authRequired ? "warning" : "success",
                  lastMessage: event.authRequired
                    ? "Authentication required — sign in manually in the watcher window."
                    : `Live check complete. ${Number(event.found || 0)} transaction row(s) visible.`,
                }
              : s
          )
        );
        return;
      }

      if (event.type === "source_auth_required") {
        setLiveWatcherError("One or more portal sources require manual sign-in.");
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === String(event.sourceId)
              ? {
                  ...s,
                  lastStatus: "warning",
                  lastMessage: "Authentication required. Sign in manually in the watcher window.",
                }
              : s
          )
        );
        showToast("info", `${event.sourceUrl || "Portal source"} requires manual sign-in in the watcher window.`);
        return;
      }

      if (event.type === "source_error") {
        setLiveWatcherError(String(event.error || "A watcher source failed."));
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === String(event.sourceId)
              ? { ...s, lastStatus: "error", lastMessage: String(event.error || "Source error.") }
              : s
          )
        );
        return;
      }

      if (event.type === "source_success") {
        setLiveWatcherLastEventAt(event.checkedAt || new Date().toISOString());
        return;
      }

      if (event.type === "transaction") {
        const tx = event.transaction || {};
        const detectedPortal = eventPortalId;
        setLiveWatcherDetectedCount((n) => n + 1);
        setLiveWatcherLastEventAt(event.detectedAt || new Date().toISOString());

        // Only the currently selected portal may populate the active transaction.
        // Events from other portals remain watcher telemetry and never cross-pollute the form.
        if (detectedPortal !== portalId) {
          showToast("info", `New AEPS transaction detected in ${event.portalName || "another portal"}. Select that portal to review it.`);
          return;
        }

        const nextType = normalizeRuleTransactionType(tx.transactionType);
        if (nextType === "cash_out" || nextType === "payment_collection" || nextType === "balance_enquiry" || nextType === "mini_statement") {
          setTransactionType(nextType as AepsTxnType);
        }

        if (tx.amount != null && Number(tx.amount) > 0) {
          setAmount(String(tx.amount));
        }
        if (/^\d{10}$/.test(String(tx.customerMobile || ""))) {
          setMobile(String(tx.customerMobile));
        }
        if (/^\d{4}$/.test(String(tx.aadhaarLast4 || ""))) {
          setAadhaar(String(tx.aadhaarLast4));
        }

        const detectedBank = String(tx.bankName || "").trim();
        if (detectedBank) {
          const exact = matchBankExactName(detectedBank, bankOptions);
          if (exact) {
            setBankId(exact.id);
            setUnmatchedBankName(null);
          } else {
            setUnmatchedBankName(detectedBank);
          }
        }

        const ref = String(tx.externalReference || tx.externalTransactionId || tx.reference || "").trim();
        if (ref) {
          setTransactionRef(ref);
          if (/^\d{10,14}$/.test(ref)) {
            setBankRef(ref);
            setPortalRef("");
          } else {
            setPortalRef(ref);
          }
        }

        if (tx.fee != null && Number.isFinite(Number(tx.fee))) setFee(String(tx.fee));
        if (tx.commission != null && Number.isFinite(Number(tx.commission))) setCommission(String(tx.commission));

        setEntryMode("ai");
        setSourceSectionOpen(true);
        showToast(
          "success",
          `New AEPS transaction detected from ${event.portalName || "portal"} — details filled for operator review.`
        );
      }

      if (event.type === "stopped") {
        setLiveWatcherActive(false);
        setLiveWatcherPortalId(null);
        setLiveWatcherLastEventAt(new Date().toISOString());
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [bankOptions, portalId, showToast]);

  // Filtered Ledger Rows
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    return rows.filter((t) => {
      const raw = (t.transaction_date || "").slice(0, 10);
      const method = t.transfer_method || "cash_out";
      const haystack = [
        t.transaction_number,
        t.customer_mobile,
        t.customers?.phone,
        t.customers?.name,
        t.reference,
        t.remarks,
        t.aadhaar_last4,
        t.banks?.name,
        t.portals?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (dateFilter !== "all" && raw) {
        if (dateFilter === "today") {
          if (raw !== todayKey) return false;
        }
        if (dateFilter === "last7" || dateFilter === "7d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 6);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (dateFilter === "last30" || dateFilter === "30d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 29);
          if (raw < d.toISOString().slice(0, 10) || raw > todayKey) return false;
        }
        if (dateFilter === "this_month" || dateFilter === "month") {
          if (raw.slice(0, 7) !== todayKey.slice(0, 7)) return false;
        }
      }

      return (
        (typeFilter === "all" || method === typeFilter) &&
        (statusFilter === "all" || t.status === statusFilter) &&
        (!q || haystack.includes(q))
      );
    });
  }, [rows, query, dateFilter, typeFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: filtered.length,
      amount: filtered.reduce((n, t) => n + Number(t.amount || 0), 0),
      fees: filtered.reduce((n, t) => n + Number(t.service_fee || 0), 0),
      commission: filtered.reduce((n, t) => n + Number(t.portal_commission || 0), 0),
      recorded: filtered.filter((t) => t.status === "success" || t.status === "recorded").length,
      review: filtered.filter((t) => ["pending", "review", "processing"].includes(t.status)).length,
      cancelled: filtered.filter((t) => t.status === "cancelled").length,
      reversed: filtered.filter((t) => t.status === "reversed").length,
    }),
    [filtered]
  );

  const aepsFloat = Number(float?.current ?? float?.balance ?? 0);
  const [receiptMode] = useState<"basic" | "detailed">("basic");
  const receiptQuery = (mode: "basic" | "detailed") => (mode === "detailed" ? "?mode=detailed" : "");
  const receiptUrl = (id: string) => "/business/receipt/" + id + receiptQuery(receiptMode);
  const invoiceUrl = (id: string) => "/business/receipt/" + id + "/a4" + receiptQuery(receiptMode);
  const handlePrintTransaction = (t: Txn) => {
    const printWindow = window.open(receiptUrl(t.id), "_blank", "noopener,noreferrer");
    if (!printWindow) {
      showToast("error", "Popup blocked. Allow popups to print the receipt.");
      return;
    }
    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // Receipt page remains open for manual printing.
      }
    };
    try {
      printWindow.addEventListener("load", runPrint, { once: true });
    } catch {
      // Older browser fallback: leave receipt page open.
    }
  };

  const handleWhatsAppShare = (t: Txn) => {
    const feeSourceLabel =
      t.fee_source === "cut_from_withdrawal"
        ? "Cut from Withdrawal"
        : t.fee_source === "separate_cash"
        ? "Collect Separately"
        : t.fee_source === "upi"
        ? "Collect Separately in QR"
        : "—";
    const customerReceives =
      t.fee_source === "cut_from_withdrawal"
        ? Math.max(0, Number(t.amount || 0) - Number(t.service_fee || 0))
        : Number(t.amount || 0);
    const message = [
      "Cafe ERP — AEPS Transaction",
      `Transaction: ${t.transaction_number || t.id.slice(0, 8)}`,
      `Customer: ${t.customers?.name || "Customer"}`,
      `Type: ${t.transfer_method === "cash_out" ? "Cash Withdrawal" : String(t.transfer_method || "").replace(/_/g, " ")}`,
      `Bank: ${t.banks?.name || "—"}`,
      `Portal: ${t.portals?.name || "—"}`,
      `Amount: ₹${Number(t.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `Fee Collection: ${feeSourceLabel}`,
      `Customer Fee: ₹${Number(t.service_fee || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `Customer Receives: ₹${customerReceives.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `RRN / Reference: ${t.reference || "—"}`,
      `Status: ${String(t.status || "success").toUpperCase()}`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const handleCopyRrn = async (t: Txn) => {
    const ref = String(t.reference || "").trim();
    if (!ref) {
      showToast("info", "No RRN / reference is available for this transaction.");
      return;
    }
    try {
      await navigator.clipboard.writeText(ref);
      showToast("success", "RRN / reference copied.");
    } catch {
      showToast("error", "Could not copy the RRN / reference.");
    }
    setActionMenuTxn(null);
  };

  const handleOpenAudit = async (t: Txn) => {
    setActionMenuTxn(null);
    setAuditTxn(t);
    setAuditRows([]);
    setAuditBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_transaction_gl_audit", {
        p_transaction_ids: [t.id],
      });
      if (error) throw error;
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (error: any) {
      showToast("error", error?.message || "Unable to load transaction audit.");
    } finally {
      setAuditBusy(false);
    }
  };

  const handlePortalVerification = (t: Txn) => {
    setActionMenuTxn(null);
    setViewTxn(null);
    if ((t as any).portal_id) setSelectedWatcherPortalId((t as any).portal_id);
    setActiveTab("watcher");
    showToast("info", "Showing the configured verification sources for this transaction portal.");
  };

  const handleReverseTransaction = async () => {
    if (!reverseTxn || reverseBusy) return;
    const reason = reverseReason.trim();
    if (!reason) {
      showToast("error", "Enter a reversal reason.");
      return;
    }
    setReverseBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const { error } = await supabase.rpc("reverse_business_txn", {
        p_txn_id: reverseTxn.id,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;

      const { data: freshRead, error: readErr } = await supabase
        .from("transactions")
        .select(
          "*, customers(name, phone), banks:aeps_banks(name), portals:aeps_portals(name), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)"
        )
        .eq("id", reverseTxn.id)
        .single();

      if (readErr || !freshRead) {
        throw new Error("Reversal completed but the updated transaction could not be verified.");
      }

      setRows((prev) => prev.map((r) => (r.id === reverseTxn.id ? (freshRead as Txn) : r)));
      setReverseTxn(null);
      setReverseReason("");
      showToast("success", "Transaction reversed successfully.");
    } catch (error: any) {
      showToast("error", error?.message || "Failed to reverse transaction.");
    } finally {
      setReverseBusy(false);
    }
  };




  // Debounced Universal Customer Search (Authoritative CafeERP Directory)
  useEffect(() => {
    const raw = customerSearchQuery.trim();
    if (raw.length < 2) {
      searchAbortRef.current?.abort();
      setCustomerSearchResults([]);
      setIsSearchingCustomer(false);
      setCustomerSearchError(null);
      setSearchHasQueried(false);
      return;
    }

    setIsSearchingCustomer(true);
    setCustomerSearchError(null);

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(raw)}&limit=10`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || `Search failed (${res.status})`);
        }
        setCustomerSearchResults(Array.isArray(data?.results) ? data.results : []);
        setSearchHasQueried(true);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setCustomerSearchError("Customer search unavailable. Try again.");
        setCustomerSearchResults([]);
        setSearchHasQueried(true);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [customerSearchQuery]);

  const handleCustomerSearch = useCallback((rawQuery: string) => {
    setCustomerSearchQuery(rawQuery);
    if (rawQuery.trim().length < 2) {
      setCustomerSearchResults([]);
      setIsSearchingCustomer(false);
      setCustomerSearchError(null);
      setSearchHasQueried(false);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setSearchHasQueried(false);
    setCustomerSearchError(null);
  }, []);

  const handleSelectCustomer = (c: any) => {
    setCustomerId(c.id);
    setName(c.name || "");
    const cleanPhone = String(c.mobile || c.phone || "").replace(/\D/g, "").slice(0, 10);
    setMobile(cleanPhone);

    const aadh = c.aadhaarLast4 || c.aadhaar_last4;
    if (aadh) {
      setAadhaar(String(aadh).slice(-4));
    } else {
      const pastTxn = rows.find((t) => t.customer_id === c.id && t.aadhaar_last4);
      if (pastTxn?.aadhaar_last4) {
        setAadhaar(String(pastTxn.aadhaar_last4).slice(-4));
      }
    }

    setSelectedCustomerRecord({
      id: c.id,
      customerId: c.customerId || c.customerCode || c.code || c.id,
      customerCode: c.customerCode || c.code || null,
      name: c.name,
      mobile: cleanPhone,
      aadhaarLast4: aadh ? String(aadh).slice(-4) : undefined,
    });

    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setSearchHasQueried(false);
    setCustomerSearchError(null);
    showToast("success", `Customer ${c.name} selected and linked from CafeERP directory.`);
  };

  const handleUnlinkCustomer = useCallback(() => {
    setCustomerId("");
    setSelectedCustomerRecord(null);
    showToast("info", "Customer unlinked from transaction. Details remain editable.");
  }, [showToast]);

  // Customer matching candidates based on mobile / Aadhaar
  const candidates = useMemo(() => {
    return initialCustomers.filter((c) => {
      const phone = String(c.phone || "").replace(/\D/g, "");
      if (cleanMobile.length === 10 && phone === cleanMobile) return true;
      if (cleanAadhaar.length === 4) {
        return rows.some((t) => t.customer_id === c.id && String(t.aadhaar_last4 || "") === cleanAadhaar);
      }
      return false;
    });
  }, [initialCustomers, cleanMobile, cleanAadhaar, rows]);

  // Selected customer object (Authoritative CafeERP DB)
  const selectedCustomer = selectedCustomerRecord || initialCustomers.find((c) => c.id === customerId) || null;

  // Auto-fill customer if unique match found on mobile from CafeERP directory
  useEffect(() => {
    if (cleanMobile.length === 10 && !customerId) {
      let cancelled = false;
      const resolveCustomerByMobile = async () => {
        try {
          const res = await fetch(`/api/customers/search?q=${cleanMobile}&limit=5`);
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          if (cancelled) return;
          const results = Array.isArray(data?.results) ? data.results : [];
          const exactPhoneMatches = results.filter(
            (r: any) => String(r.mobile || r.phone || "").replace(/\D/g, "").slice(-10) === cleanMobile
          );
          if (exactPhoneMatches.length === 1) {
            const matched = exactPhoneMatches[0];
            setCustomerId(matched.id);
            if (!name) setName(matched.name || "");
            if (!aadhaar && (matched.aadhaarLast4 || matched.aadhaar_last4)) {
              setAadhaar(String(matched.aadhaarLast4 || matched.aadhaar_last4).slice(-4));
            }
            setSelectedCustomerRecord({
              id: matched.id,
              customerId: matched.customerId || matched.customerCode || matched.code || matched.id,
              customerCode: matched.customerCode || matched.code || null,
              name: matched.name,
              mobile: cleanMobile,
              aadhaarLast4: matched.aadhaarLast4 ? String(matched.aadhaarLast4).slice(-4) : undefined,
            });
          }
        } catch {
          // silently skip
        }
      };
      resolveCustomerByMobile();
      return () => {
        cancelled = true;
      };
    }
  }, [cleanMobile, customerId, name, aadhaar]);

  const handleNewCashOut = useCallback(() => {
    setCustomerId("");
    setSelectedCustomerRecord(null);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setSearchHasQueried(false);
    setCustomerSearchError(null);
    setMobile("");
    setName("");
    setAadhaar("");
    setTransactionType("cash_out");
    setCollectionMethod("aeps_portal");
    setFeeSource("cut_from_withdrawal");
    setAmount("");
    setFee("");
    setCommission("");
    setBankId("");
    setUnmatchedBankName(null);
    setPortalId(initialPortals[0]?.id || "");
    setBankRef("");
    setPortalRef("");
    setTransactionRef("");
    setReviewOpen(false);
    setWorkspaceOpen(true);
  }, [initialPortals]);

  const selectBankByCode = (code: string) => {
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return;
    const matched =
      bankOptions.find((b) => b.code?.toUpperCase() === top.code) ||
      matchBankExactName(top.label, bankOptions) ||
      matchBankExactName(top.match[0], bankOptions);
    if (matched) {
      if (bankId && bankId !== matched.id) {
        // Audit log operator change
        setAuditLogs((prev) => [
          {
            id: `audit-${Date.now()}`,
            user: "Operator",
            timestamp: new Date().toISOString(),
            field: "bank",
            oldValue: bankOptions.find((b) => b.id === bankId)?.name || "—",
            newValue: matched.name,
            reason: "Operator selected different bank chip",
          },
          ...prev,
        ]);
      }
      setBankId(matched.id);
    }
  };

  const openCreateBank = useCallback((prefillName = "", reason = "") => {
    setBankCreateName(prefillName.trim());
    setBankCreateCode("");
    setBankCreateReason(reason);
    setBankCreateOpen(true);
  }, []);

  const handleCreateBank = async () => {
    const cleanName = bankCreateName.trim().replace(/\s+/g, " ");
    const cleanCode = bankCreateCode.trim().toUpperCase() || null;
    if (!cleanName) {
      showToast("error", "Bank name is required.");
      return;
    }

    const existing = matchBankExactName(cleanName, bankOptions);
    if (existing) {
      setBankId(existing.id);
      setUnmatchedBankName(null);
      setBankCreateOpen(false);
      showToast("info", `Exact bank already exists: ${existing.name}.`);
      return;
    }

    setBankCreateBusy(true);
    try {
      const { data, error } = await supabase
        .from("aeps_banks")
        .insert({
          name: cleanName,
          code: cleanCode,
          is_active: true,
        })
        .select("id,name,code,is_active")
        .single();

      if (error) throw error;
      const created = data as Master;
      setBankOptions((prev) => [...prev.filter((b) => b.id !== created.id), created].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      ));
      setBankId(created.id);
      setUnmatchedBankName(null);
      setBankCreateOpen(false);
      showToast("success", `Bank created and selected: ${created.name}.`);
    } catch (err: any) {
      showToast("error", err?.message || "Unable to create bank.");
    } finally {
      setBankCreateBusy(false);
    }
  };

  const isBankChipActive = (code: string) => {
    if (!bankId) return false;
    const currentBank = bankOptions.find((b) => b.id === bankId);
    if (!currentBank) return false;
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return false;
    const norm = normalizeBankName(currentBank.name);
    return (
      top.match.some((m) => norm.includes(m) || m.includes(norm)) ||
      (currentBank.code && currentBank.code.toUpperCase() === code)
    );
  };

  // Dynamic denomination buttons generated from active rules
  const dynamicDenominations = useMemo(
    () => getDynamicDenominations(pricingRules, portalId, transactionType),
    [pricingRules, portalId, transactionType]
  );

  const handleDenominationClick = (val: number) => {
    setAmount(String(val));
    const pricing = resolvePricingFromRules(pricingRules, {
      portalId,
      bankId,
      transactionType,
      amount: val,
      customerId,
    });
    setFee(String(pricing.fee));
    setCommission(String(pricing.commission));
  };

  // Draft operations
  const handleSaveDraft = () => {
    const draft: DraftRecord = {
      id: "draft-" + Date.now(),
      savedAt: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      customerId,
      mobile,
      name,
      aadhaar,
      transactionType,
      collectionMethod,
      feeSource,
      amount,
      fee,
      commission,
      bankId,
      portalId,
      bankRef,
      portalRef,
    };
    setDrafts((prev) => [draft, ...prev.slice(0, 9)]);
    setDraftSavedAt(draft.savedAt);
    showToast("success", "Transaction draft saved successfully.");
  };

  const handleLoadDraft = (d: DraftRecord) => {
    setCustomerId(d.customerId);
    setSelectedCustomerRecord(
      d.customerId ? { id: d.customerId, name: d.name, mobile: d.mobile, customerId: d.customerId } : null
    );
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setSearchHasQueried(false);
    setCustomerSearchError(null);
    setMobile(d.mobile);
    setName(d.name);
    setAadhaar(d.aadhaar);
    setTransactionType((d.transactionType as AepsTxnType) || "cash_out");
    if (d.collectionMethod) setCollectionMethod(d.collectionMethod as any);
    if (d.feeSource) setFeeSource(d.feeSource);
    setAmount(d.amount);
    setFee(d.fee);
    setCommission(d.commission);
    setBankId(d.bankId);
    setPortalId(d.portalId);
    setBankRef(d.bankRef);
    setPortalRef(d.portalRef);
    setTransactionRef(d.bankRef || d.portalRef || "");
    showToast("info", `Loaded draft saved at ${d.savedAt}`);
  };

  // Scan & Source Extraction
  const handleApplyExtractedSource = (fields: ScanFields) => {
    if (fields.amount) setAmount(fields.amount);
    if (fields.reference) {
      handleTransactionRefChange(fields.reference);
    }
    if (fields.aadhaar_last4) setAadhaar(fields.aadhaar_last4);
    if (fields.customer_mobile) setMobile(fields.customer_mobile);
    if (fields.service_fee) setFee(fields.service_fee);
    if (fields.portal_commission) setCommission(fields.portal_commission);

    if (fields.bank_name) {
      const extractedBankName = String(fields.bank_name).trim();
      const matched = matchBankExactName(extractedBankName, bankOptions);
      if (matched) {
        setBankId(matched.id);
        setUnmatchedBankName(null);
      } else {
        setUnmatchedBankName(extractedBankName);
        showToast("info", `Bank "${extractedBankName}" was not found by exact name. Use Create Bank to add it.`);
      }
    }
    if (fields.portal_name) {
      const p = initialPortals.find(
        (x) =>
          x.name.toLowerCase().includes(fields.portal_name.toLowerCase()) ||
          fields.portal_name.toLowerCase().includes(x.name.toLowerCase())
      );
      if (p) setPortalId(p.id);
    }

    showToast("success", "Extracted fields applied to counter terminal.");
    setSourceSectionOpen(false);
  };

  const handleExtractFromPasted = () => {
    if (!pastedSourceText.trim()) return;
    const extracted = extractForMode(pastedSourceText, "aeps");
    handleApplyExtractedSource(extracted);
  };

  const collectBrowserObservations = async (
    targetPortal: { id: string; name: string },
    portalSources: PortalWatcherSource[]
  ) => {
    const api = (window as any).electronAPI;
    if (!api?.isElectron || typeof api.collectAepsWatcherSources !== "function") {
      return null;
    }

    const result = await api.collectAepsWatcherSources({
      portalId: targetPortal.id,
      portalName: targetPortal.name,
      sources: portalSources.map((s) => ({
        id: s.id,
        url: s.url || s.sourceUrl || "",
        purpose: s.purpose,
      })),
    });

    return Array.isArray(result?.observations)
      ? result.observations.map((o: any) => ({
          sourceId: o.sourceId,
          sourceUrl: o.sourceUrl,
          purpose: o.purpose,
          portalId: o.portalId,
          portalName: o.portalName,
          success: Boolean(o.success),
          authRequired: Boolean(o.authRequired),
          rendered: Boolean(o.rendered),
          httpStatus: Number(o.httpStatus || 0),
          latencyMs: Number(o.latencyMs || 0),
          content: String(o.content || ""),
          title: String(o.title || ""),
          error: o.error || null,
        }))
      : [];
  };

  // ---------------------------------------------------------------------------
  // CRITICAL REQUIREMENT: VERIFY CURRENT PORTAL DETAILS (CHECK ALL URLs TOGETHER)
  // ---------------------------------------------------------------------------
  const verifyCurrentPortalDetails = async (forceFresh = true) => {
    if (isVerifyingPortal) return;
    setIsVerifyingPortal(true);
    setVerificationProgressStep("Connecting to configured portal sources...");

    const targetPortal = initialPortals.find((p) => p.id === portalId) || initialPortals[0];
    const portalSources = watcherSources.filter((s) => s.portalId === targetPortal.id && s.isEnabled);

    try {
      setVerificationProgressStep(`1/${Math.max(portalSources.length, 1)} Checking Commission & Fee sources...`);
      await new Promise((r) => setTimeout(r, 150));

      setVerificationProgressStep(`2/${Math.max(portalSources.length, 1)} Checking AEPS Rules & NPCI Guidelines...`);
      await new Promise((r) => setTimeout(r, 150));

      setVerificationProgressStep(`3/${Math.max(portalSources.length, 1)} Checking Terminal & Bank Switch status...`);

      const browserObservations = await collectBrowserObservations(targetPortal, portalSources);
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collect_all",
          portalId: targetPortal.id,
          portalName: targetPortal.name,
          sources: portalSources,
          browserObservations,
          activeRules: pricingRules,
          bankList: bankOptions,
          forceFresh,
        }),
      });

      const data = await res.json();
      setVerificationProgressStep("Combining results & cross-verifying...");
      await new Promise((r) => setTimeout(r, 150));

      const now = new Date().toISOString();
      setLastVerifiedAt(now);

      if (data.success && data.collectionRun) {
        const run: PortalCollectionRun = data.collectionRun;
        setCurrentRun(run);
        setCollectionRuns((prev) => [run, ...prev]);

        if (data.pendingChanges && data.pendingChanges.length > 0) {
          setChangeRecords((prev) => [...data.pendingChanges, ...prev]);
        }

        // Auto-populate transaction form from verified context
        const ctx = run.verifiedContext;

        // Strict bank-name policy: unresolved source bank names are surfaced
        // for explicit creation instead of being mapped to a fuzzy match.
        const unresolvedBankObservation = run.observations.find(
          (o) =>
            !!o.normalizedData.bankName &&
            !o.normalizedData.bankId &&
            o.confidence !== "SOURCE_FAILED"
        );
        if (unresolvedBankObservation?.normalizedData.bankName) {
          const sourceBank = String(unresolvedBankObservation.normalizedData.bankName).trim();
          setUnmatchedBankName(sourceBank);
          showToast("info", `Bank "${sourceBank}" is not an exact Bank Master match. Create it if this is the correct official name.`);
        }

        if (ctx.transactionType.value) {
          setTransactionType(ctx.transactionType.value);
        }
        if (ctx.bank.value) {
          setBankId(ctx.bank.value.id);
        }
        if (ctx.reference.value) {
          handleTransactionRefChange(ctx.reference.value);
        }
        if (ctx.customerFee.value !== null && ctx.customerFee.value !== undefined) {
          setFee(String(ctx.customerFee.value));
        }
        if (ctx.commission.value !== null && ctx.commission.value !== undefined) {
          setCommission(String(ctx.commission.value));
        }

        showToast(
          run.verificationStatus === "VERIFIED" ? "success" : "info",
          run.verificationStatus === "VERIFIED"
            ? `All ${run.successfulSourceCount} sources verified for ${targetPortal.name}.`
            : run.verificationStatus === "PARTIAL"
            ? `Partial verification: ${run.successfulSourceCount} of ${run.sourceCount} sources available.`
            : `Verification complete with warnings for ${targetPortal.name}.`
        );
      } else {
        setCurrentRun(null);
        setLastVerifiedAt(null);
        throw new Error(data?.error || "Live watcher verification failed. No source baseline was applied.");
      }
    } catch (err: any) {
      showToast("error", err?.message || "Failed to verify portal sources.");
    } finally {
      setIsVerifyingPortal(false);
      setVerificationProgressStep("");
    }
  };

  const startLiveWatcher = async () => {
    if (liveWatcherActive || isVerifyingPortal) return;

    const api = (window as any).electronAPI;
    if (!api?.isElectron || typeof api.startAepsWatcherAll !== "function") {
      setLiveWatcherError("Live authenticated portal watching is available in the CafeERP Desktop app. Open the Windows desktop app to start the watcher.");
      showToast("error", "Open CafeERP Desktop to start the live authenticated watcher.");
      return;
    }

    const targetPortal = initialPortals.find((p) => p.id === portalId) || initialPortals[0];
    const portalSources = watcherSources.filter((s) => s.portalId === targetPortal.id && s.isEnabled && !s.isArchived);

    if (!targetPortal || portalSources.length === 0) {
      setLiveWatcherError(`No enabled watcher URLs are configured for ${targetPortal?.name || "this portal"}.`);
      showToast("error", `No enabled watcher URLs are configured for ${targetPortal?.name || "this portal"}.`);
      return;
    }

    setLiveWatcherError(null);
    setLiveWatcherDetectedCount(0);
    setLiveWatcherLastEventAt(new Date().toISOString());

    // Perform one immediate multi-source verification so the operator gets a
    // current baseline before continuous transaction monitoring begins.
    await verifyCurrentPortalDetails(true);

    try {
      const result = await api.startAepsWatcherAll({
        portalId: targetPortal.id,
        portalName: targetPortal.name,
        sources: portalSources.map((s) => ({
          id: s.id,
          url: s.url || s.sourceUrl || "",
          purpose: s.purpose,
        })),
        intervalSeconds: 30,
      });

      if (!result?.success) {
        throw new Error(result?.error || "Desktop live watcher failed to start.");
      }

      setLiveWatcherActive(true);
      setLiveWatcherPortalId(targetPortal.id);
      showToast("success", `Live watcher is monitoring ${result.startedSourceCount || portalSources.length} URL(s) for ${targetPortal.name} every 30 seconds.`);
    } catch (err: any) {
      setLiveWatcherActive(false);
      setLiveWatcherPortalId(null);
      setLiveWatcherError(err?.message || "Failed to start live watcher.");
      showToast("error", err?.message || "Failed to start live watcher.");
    }
  };

  const stopLiveWatcher = async () => {
    const api = (window as any).electronAPI;
    if (!api?.isElectron || typeof api.stopAepsWatcher !== "function") {
      setLiveWatcherActive(false);
      return;
    }
    try {
      const result = await api.stopAepsWatcher();
      if (!result?.success) throw new Error(result?.error || "Failed to stop live watcher.");
      setLiveWatcherActive(false);
      setLiveWatcherPortalId(null);
      setLiveWatcherLastEventAt(new Date().toISOString());
      showToast("info", "Live AEPS watcher stopped.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to stop live watcher.");
    }
  };

  // Verify every registered portal independently. Never mix portal data.
  const verifyAllPortalsLive = async () => {
    if (isVerifyingPortal || initialPortals.length === 0) return;
    setIsVerifyingPortal(true);
    setVerificationProgressStep("Starting live verification for all portals...");
    try {
      const results = await Promise.all(initialPortals.map(async (portal) => {
        const portalSources = watcherSources.filter((s) => s.portalId === portal.id && s.isEnabled && !s.isArchived);
        if (portalSources.length === 0) {
          return { portalId: portal.id, success: false, error: "No enabled watcher sources configured.", collectionRun: null, pendingChanges: [] };
        }
        const browserObservations = await collectBrowserObservations(portal, portalSources);
        const res = await fetch("/api/ai/portal-watcher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "collect_all",
            portalId: portal.id,
            portalName: portal.name,
            sources: portalSources,
            browserObservations,
            activeRules: pricingRules,
            bankList: bankOptions,
            forceFresh: true,
          }),
        });
        const data = await res.json().catch(() => null);
        return {
          portalId: portal.id,
          success: Boolean(res.ok && data?.success && data?.collectionRun),
          error: data?.error || (!res.ok ? "Portal verification failed." : null),
          collectionRun: data?.collectionRun || null,
          pendingChanges: Array.isArray(data?.pendingChanges) ? data.pendingChanges : [],
        };
      }));
      const successfulRuns = results.map((r) => r.collectionRun).filter(Boolean) as PortalCollectionRun[];
      if (successfulRuns.length > 0) {
        setCollectionRuns((prev) => [...successfulRuns, ...prev.filter((old) => !successfulRuns.some((run) => run.portalId === old.portalId))]);
        const selectedRun = successfulRuns.find((run) => run.portalId === portalId) || null;
        if (selectedRun) {
          setCurrentRun(selectedRun);
          setLastVerifiedAt(new Date().toISOString());
          const ctx = selectedRun.verifiedContext;
          if (ctx.transactionType.value) setTransactionType(ctx.transactionType.value);
          if (ctx.bank.value) setBankId(ctx.bank.value.id);
          if (ctx.reference.value) handleTransactionRefChange(ctx.reference.value);
          if (ctx.customerFee.value !== null && ctx.customerFee.value !== undefined) setFee(String(ctx.customerFee.value));
          if (ctx.commission.value !== null && ctx.commission.value !== undefined) setCommission(String(ctx.commission.value));
        }
      }
      const pending = results.flatMap((r) => r.pendingChanges);
      if (pending.length > 0) setChangeRecords((prev) => [...pending, ...prev]);
      const okCount = successfulRuns.length;
      const noSourceCount = results.filter((r) => !r.success && r.error === "No enabled watcher sources configured.").length;
      showToast(okCount === initialPortals.length ? "success" : "info", noSourceCount > 0 ? `${okCount}/${initialPortals.length} portals verified. Some portals have no enabled watcher sources.` : `${okCount}/${initialPortals.length} portals verified independently.`);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to verify all portals.");
    } finally {
      setIsVerifyingPortal(false);
      setVerificationProgressStep("");
    }
  };
  // Multi-Source Watcher Actions: exclude archived sources
  const currentPortalSources = useMemo(() => {
    return watcherSources.filter((s) => s.portalId === selectedWatcherPortalId && !s.isArchived);
  }, [watcherSources, selectedWatcherPortalId]);

  const portalWatcherSummaries = useMemo(() => {
    return initialPortals.map((portal) => {
      const sources = watcherSources.filter((s) => s.portalId === portal.id && !s.isArchived);
      const enabled = sources.filter((s) => s.isEnabled);
      const latestRun = [...collectionRuns]
        .filter((run) => run.portalId === portal.id)
        .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime())[0] || null;
      return {
        portal,
        sources,
        enabledCount: enabled.length,
        healthyCount: enabled.filter((s) => s.lastStatus === "success").length,
        errorCount: enabled.filter((s) => s.lastStatus === "error").length,
        latestRun,
      };
    });
  }, [initialPortals, watcherSources, collectionRuns]);

  const livePortalSources = useMemo(
    () => watcherSources.filter((s) => s.portalId === portalId && !s.isArchived),
    [watcherSources, portalId]
  );
  const liveWatcherRun = currentRun && currentRun.portalId === portalId ? currentRun : null;
  const liveEnabledCount = livePortalSources.filter((s) => s.isEnabled).length;


  const handleTestSource = async (source: PortalWatcherSource) => {
    setTestingSourceId(source.id);
    try {
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          url: source.url,
          purpose: source.purpose,
          portalId: source.portalId,
          portalName: source.portalName,
          currentPublished: source.currentPublishedValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to test source URL.");

      setWatcherSources((prev) =>
        prev.map((s) =>
          s.id === source.id
            ? {
                ...s,
                lastChecked: new Date().toISOString(),
                lastStatus: "success",
                lastMessage: data.message || "Test passed successfully.",
              }
            : s
        )
      );
      showToast("success", `[${PURPOSE_LABELS[source.purpose].label}] ${data.message}`);
    } catch (err: any) {
      setWatcherSources((prev) =>
        prev.map((s) =>
          s.id === source.id
            ? {
                ...s,
                lastChecked: new Date().toISOString(),
                lastStatus: "error",
                lastMessage: err.message,
              }
            : s
        )
      );
      showToast("error", err.message);
    } finally {
      setTestingSourceId(null);
    }
  };

  const handleCollectSource = async (source: PortalWatcherSource) => {
    setCollectingSourceId(source.id);
    try {
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "collect",
          url: source.url,
          purpose: source.purpose,
          portalId: source.portalId,
          portalName: source.portalName,
          currentPublished: source.currentPublishedValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to collect from source.");

      const now = new Date().toISOString();

      if (data.hasDifference) {
        // Difference detected: NEVER overwrite production automatically.
        // Queue for operator review.
        const changeRecord: PortalChangeRecord = {
          id: "chg-" + Date.now(),
          sourceId: source.id,
          portalId: source.portalId,
          portalName: source.portalName,
          sourceUrl: source.url,
          purpose: source.purpose,
          extractedAt: now,
          oldValue: data.oldValue,
          newValue: data.newValue,
          changeSummary: data.message,
          normalizedData: data.normalizedData,
          status: "pending",
        };

        setChangeRecords((prev) => [changeRecord, ...prev]);
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === source.id
              ? {
                  ...s,
                  lastChecked: now,
                  lastStatus: "warning",
                  lastMessage: "Change detected. Staged for operator review.",
                }
              : s
          )
        );
        showToast(
          "info",
          `Change detected from ${source.portalName} (${PURPOSE_LABELS[source.purpose].label}). Review required.`
        );
      } else {
        setWatcherSources((prev) =>
          prev.map((s) =>
            s.id === source.id
              ? {
                  ...s,
                  lastChecked: now,
                  lastStatus: "success",
                  lastMessage: "Verified. Matches currently published baseline.",
                }
              : s
          )
        );
        showToast("success", `${source.portalName} (${PURPOSE_LABELS[source.purpose].label}) is up to date.`);
      }
    } catch (err: any) {
      setWatcherSources((prev) =>
        prev.map((s) =>
          s.id === source.id
            ? {
                ...s,
                lastChecked: new Date().toISOString(),
                lastStatus: "error",
                lastMessage: err.message,
              }
            : s
        )
      );
      showToast("error", err.message);
    } finally {
      setCollectingSourceId(null);
    }
  };

  const handleToggleWatcher = async (sourceId: string) => {
    const target = watcherSources.find((s) => s.id === sourceId);
    if (!target) return;
    const nextState = !target.isEnabled;

    setWatcherSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, isEnabled: nextState } : s))
    );

    try {
      await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_source",
          sourceId,
          isEnabled: nextState,
        }),
      });
    } catch {}

    showToast("info", `Source ${nextState ? "enabled" : "disabled"}.`);
  };

  const handleOpenEditSource = (source: PortalWatcherSource) => {
    setEditingSource(source);
    setEditSourceUrl(source.url || source.sourceUrl || "");
    setEditSourcePurpose(source.purpose);
    setEditSourcePortalId(source.portalId);
    setEditSourceEnabled(source.isEnabled);
    setEditSourceDescription(source.description || "");
    setEditSourceError(null);
    setEditSourceModalOpen(true);
  };

  const handleSaveEditSource = async () => {
    if (!editingSource) return;
    const rawUrl = editSourceUrl.trim();
    if (!rawUrl) {
      setEditSourceError("Source URL is required.");
      return;
    }

    const urlValidation = validatePortalSourceUrl(rawUrl);
    if (!urlValidation.valid) {
      setEditSourceError(urlValidation.error || "Invalid URL.");
      return;
    }
    const normalizedUrl = urlValidation.normalizedUrl!;

    const targetPortal = initialPortals.find((p) => p.id === editSourcePortalId) || {
      id: editSourcePortalId,
      name: editingSource.portalName,
    };

    // Duplicate check: active sources on target portal, excluding the current editing source
    const isDuplicate = watcherSources.some(
      (s) =>
        !s.isArchived &&
        s.id !== editingSource.id &&
        s.portalId === editSourcePortalId &&
        s.url.trim().toLowerCase() === normalizedUrl.toLowerCase()
    );

    if (isDuplicate) {
      const dupMsg = "Source URL already configured for this portal.";
      setEditSourceError(dupMsg);
      showToast("error", dupMsg);
      return;
    }

    setIsSavingEditSource(true);
    setEditSourceError(null);

    const urlChanged = editingSource.url.trim().toLowerCase() !== normalizedUrl.toLowerCase();
    const now = new Date().toISOString();

    const updatedSource: PortalWatcherSource = {
      ...editingSource,
      portalId: editSourcePortalId,
      portalName: targetPortal.name,
      url: normalizedUrl,
      sourceUrl: normalizedUrl,
      purpose: editSourcePurpose,
      isEnabled: editSourceEnabled,
      description: editSourceDescription.trim() || null,
      updatedAt: now,
      // If URL changed, reset verification
      lastChecked: urlChanged ? null : editingSource.lastChecked,
      lastStatus: urlChanged ? "idle" : editingSource.lastStatus,
      lastMessage: urlChanged ? "URL modified — pending verification" : editingSource.lastMessage,
    };

    try {
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_source",
          sourceId: editingSource.id,
          portalId: editSourcePortalId,
          portalName: targetPortal.name,
          url: normalizedUrl,
          purpose: editSourcePurpose,
          isEnabled: editSourceEnabled,
          description: editSourceDescription.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.source) {
        throw new Error(data?.error || "Failed to save updated source.");
      }
      setWatcherSources((prev) =>
        prev.map((s) => (s.id === editingSource.id ? data.source : s))
      );
      showToast("success", "Source updated successfully.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to save updated source.");
    } finally {
      setIsSavingEditSource(false);
      setEditSourceModalOpen(false);
      setEditingSource(null);
    }
  };

  const handleOpenDeleteSource = (source: PortalWatcherSource) => {
    setDeletingSource(source);
    setDeleteSourceModalOpen(true);
  };

  const handleConfirmDeleteSource = async () => {
    if (!deletingSource) return;
    setIsDeletingSource(true);

    const sourceId = deletingSource.id;
    const now = new Date().toISOString();

    try {
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_source",
          sourceId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast("error", data.error || "Failed to delete source from server.");
      } else {
        setWatcherSources((prev) => prev.filter((s) => s.id !== sourceId));
        showToast("success", "Source URL deleted successfully.");
      }
    } catch (err: any) {
      showToast("error", err?.message || "Failed to delete source from server.");
    } finally {
      setIsDeletingSource(false);
      setDeleteSourceModalOpen(false);
      setDeletingSource(null);
    }
  };

  const handleApproveChange = async (recordId: string) => {
    const rec = changeRecords.find((r) => r.id === recordId);
    if (!rec) return;

    let persistedApprovedRule: AepsPricingRule | null = null;

    // Call server to persist approved change to database rules
    try {
      const response = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_change",
          changeId: recordId,
          portalId: rec.portalId,
          purpose: rec.purpose,
          transactionType: rec.normalizedData.transactionType || "cash_out",
          bankId: rec.normalizedData.bankId || null,
          newValue: rec.purpose === "commission" ? rec.normalizedData.commission : rec.normalizedData.fee,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Could not persist approved watcher change.");
      }
      persistedApprovedRule = data.rule ? (data.rule as AepsPricingRule) : null;
    } catch (err: any) {
      showToast("error", err?.message || "Could not approve watcher change.");
      return;
    }

    // Update published active value in watcher source
    setWatcherSources((prev) =>
      prev.map((s) => {
        if (s.id === rec.sourceId) {
          return {
            ...s,
            lastStatus: "success",
            lastMessage: "Operator approved new baseline.",
            currentPublishedValue: {
              ...s.currentPublishedValue,
              commission: rec.normalizedData.commission ?? s.currentPublishedValue.commission,
              fee: rec.normalizedData.fee ?? s.currentPublishedValue.fee,
              summary: rec.normalizedData.summary ?? s.currentPublishedValue.summary,
              updatedAt: new Date().toISOString(),
            },
          };
        }
        return s;
      })
    );

    // Replace only the exact persisted rule returned by the server.
    // Never rewrite every fee/commission rule for the portal.
    if (persistedApprovedRule) {
      setPricingRules((prev) => {
        const exists = prev.some((rule) => rule.id === persistedApprovedRule!.id);
        return exists
          ? prev.map((rule) => (rule.id === persistedApprovedRule!.id ? persistedApprovedRule! : rule))
          : [persistedApprovedRule!, ...prev];
      });
    }

    // Update active form inputs if current portal matches
    if (portalId === rec.portalId) {
      if (rec.purpose === "commission" && rec.normalizedData.commission != null) {
        setCommission(String(rec.normalizedData.commission));
      }
      if (rec.purpose === "fee" && rec.normalizedData.fee != null) {
        setFee(String(rec.normalizedData.fee));
      }
    }

    setChangeRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, status: "approved", reviewedAt: new Date().toISOString(), reviewedBy: "Operator" }
          : r
      )
    );

    showToast("success", `Approved change from ${rec.portalName}. Published value activated.`);
  };

  const handleRejectChange = (recordId: string) => {
    setChangeRecords((prev) =>
      prev.map((r) =>
        r.id === recordId
          ? { ...r, status: "rejected", reviewedAt: new Date().toISOString(), reviewedBy: "Operator" }
          : r
      )
    );
    showToast("info", "Proposed change rejected. Production values remain unchanged.");
  };

  const handleAddSource = async () => {
    const rawUrl = newSourceUrl.trim();
    if (!rawUrl) return;

    const targetPortal = initialPortals.find((p) => p.id === selectedWatcherPortalId);
    if (!targetPortal) return;

    const urlValidation = validatePortalSourceUrl(rawUrl);
    if (!urlValidation.valid) {
      showToast("error", urlValidation.error || "Invalid URL.");
      return;
    }

    const normalizedUrl = urlValidation.normalizedUrl!;

    const isDuplicate = watcherSources.some(
      (s) =>
        !s.isArchived &&
        s.portalId === selectedWatcherPortalId &&
        s.url.trim().toLowerCase() === normalizedUrl.toLowerCase()
    );

    if (isDuplicate) {
      showToast("error", "Source URL already configured for this portal.");
      return;
    }

    const newId = `src-${selectedWatcherPortalId}-${Date.now()}`;
    setNewSourceUrl("");

    try {
      const res = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_source",
          id: newId,
          portalId: selectedWatcherPortalId,
          portalName: targetPortal.name,
          url: normalizedUrl,
          purpose: newSourcePurpose,
          isEnabled: true,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data?.source) {
        throw new Error(data?.error || "Failed to persist source to server.");
      }

      // Add only the server-persisted representation. Never keep a local-only
      // source that can reappear after refresh.
      setWatcherSources((prev) => [...prev, data.source]);
      showToast(
        "success",
        `Added new ${PURPOSE_LABELS[newSourcePurpose].label} source for ${targetPortal.name}.`
      );
    } catch (err: any) {
      showToast("error", err?.message || "Failed to persist source to server.");
    }
  };
  // Rules Manager Actions
  const handleSaveRule = async (rule: AepsPricingRule) => {
    const cleanRule: AepsPricingRule = {
      ...rule,
      transactionType: (normalizeRuleTransactionType(rule.transactionType) as any) || "all",
    };
    try {
      const response = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_rule",
          rule: cleanRule,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.rule) {
        throw new Error(data?.error || "Failed to persist pricing rule.");
      }
      const persistedRule = data.rule as AepsPricingRule;
      setPricingRules((prev) => {
        const exists = prev.some((r) => r.id === persistedRule.id);
        if (exists) return prev.map((r) => (r.id === persistedRule.id ? persistedRule : r));
        return [persistedRule, ...prev];
      });
    } catch (err: any) {
      showToast("error", err?.message || "Failed to persist pricing rule.");
      return;
    }

    setIsAddingRule(false);
    setEditingRule(null);
    showToast("success", `Rule saved successfully.`);
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      const response = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_rule", ruleId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to archive pricing rule.");
      setPricingRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, isActive: false } : r)));
      showToast("info", "Rule archived / disabled.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to archive pricing rule.");
    }
  };

  const handleToggleRule = async (ruleId: string) => {
    const current = pricingRules.find((r) => r.id === ruleId);
    if (!current) return;
    const next = !current.isActive;
    try {
      const response = await fetch("/api/ai/portal-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_rule", ruleId, isActive: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to update pricing rule.");
      setPricingRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, isActive: next, updatedAt: new Date().toISOString() } : r)));
      showToast("success", next ? "Rule enabled." : "Rule disabled.");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to update pricing rule.");
    }
  };


  const handleExport = () => {
    downloadCsv(
      "aeps-transactions.csv",
      [
        "Transaction",
        "Date",
        "Customer",
        "Mobile",
        "Type",
        "Aadhaar",
        "Amount",
        "Fee",
        "Commission",
        "Bank",
        "Portal",
        "Bank Ref",
        "Portal Ref",
        "Status",
      ],
      filtered.map((t) => [
        t.transaction_number || "",
        t.transaction_date || "",
        t.customers?.name || "",
        t.customer_mobile || t.customers?.phone || "",
        t.transfer_method || "Cash Out",
        t.aadhaar_last4 || "",
        Number(t.amount || 0),
        Number(t.service_fee || 0),
        Number(t.portal_commission || 0),
        t.banks?.name || "",
        t.portals?.name || "",
        t.reference || "",
        t.remarks?.replace(/^Portal Ref:\s*/i, "") || "",
        t.status || "",
      ])
    );
    showToast("success", "AEPS transaction export created.");
  };

  // ---------------------------------------------------------------------------
  // APPROVE & SAVE WITH STRICT FINANCIAL PERSISTENCE CONFIRMATION
  // ---------------------------------------------------------------------------
  const idempotencyKeyRef = useRef<string | null>(null);

  const recordTransaction = async () => {
    if (busy || !isFormValid) return;
    setBusy(true);
    try {
      const isCollection = transactionType === "payment_collection";
      const isEnquiry = transactionType === "balance_enquiry" || transactionType === "mini_statement";
      const numAmount = isEnquiry ? 0 : Number(amount || 0);

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }

      const commonPayload: any = {
        p_transaction_date: new Date().toISOString().slice(0, 10),
        p_transaction_timestamp: new Date().toISOString(),
        p_customer_id: customerId || selectedCustomer?.id || null,
        p_customer_mobile: cleanMobile,
        p_reference: bankRef || null,
        p_remarks: portalRef ? "Portal Ref: " + portalRef : null,
        p_bank_id: bankId,
        p_portal_id: portalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: transactionType,
        p_sender_name: null,
        p_sender_mobile: null,
        p_beneficiary_name: null,
        p_beneficiary_mobile: null,
        p_beneficiary_bank: null,
        p_beneficiary_ifsc: null,
        p_beneficiary_account: null,
        p_upi_id: null,
        p_amount: numAmount,
        p_service_fee: Number(fee || 0),
        p_portal_commission: Number(commission || 0),
        p_fee_source: feeSource,
        p_paid_from: "portal",
        p_customer_pay_method: isCollection
          ? (collectionMethod || "aeps_portal")
          : (feeSource === "upi" ? "upi" : (feeSource === "separate_cash" ? "cash" : "portal")),
        p_pay_from_instrument_id: null,
        p_pay_from_method: isCollection ? "aeps_portal" : "cash",
        p_receiver_name: null,
        p_idempotency_key: idempotencyKeyRef.current,
      };

      let result: any;
      let insertedId: string | null = editingTxnId;

      if (editingTxnId) {
        // Use the canonical accounting-aware update RPC. It reverses the old
        // financial legs and reposts the edited transaction atomically.
        result = await supabase.rpc("update_business_txn", {
          p_txn_id: editingTxnId,
          ...commonPayload,
          p_portal_charge: 0,
        });
      } else {
        result = await supabase.rpc("create_business_txn", {
          p_service_type: "aeps",
          p_status: "success",
          p_portal_charge: 0,
          ...commonPayload,
        });
        insertedId = result.data?.id || null;
      }

      if (result.error) throw result.error;

      const returnedTxn = result.data as Txn;
      if (!insertedId) insertedId = returnedTxn?.id || null;
      if (!insertedId) throw new Error(editingTxnId ? "Transaction update succeeded but no transaction ID was returned." : "Transaction save succeeded but no transaction ID was returned.");

      // Strict persistence confirmation: always re-read the transaction.
      const { data: freshRead, error: readErr } = await supabase
        .from("transactions")
        .select(
          "*, customers(name, phone), banks:aeps_banks(name), portals:aeps_portals(name), merchant_qrs:upi_merchant_qrs(display_name, upi_id), profiles(full_name)"
        )
        .eq("id", insertedId)
        .single();

      if (readErr || !freshRead) {
        throw new Error("Transaction operation completed but persistence could not be verified.");
      }

      const confirmedTxn = freshRead as Txn;
      setRows((prev) =>
        editingTxnId
          ? prev.map((r) => (r.id === confirmedTxn.id ? confirmedTxn : r))
          : [confirmedTxn, ...prev.filter((r) => r.id !== confirmedTxn.id)]
      );

      showToast(
        "success",
        editingTxnId
          ? "AEPS transaction updated and verified in database ledger."
          : "AEPS transaction recorded & verified in database ledger."
      );

      setEditingTxnId(null);
      handleNewCashOut();
      setReviewOpen(false);
      idempotencyKeyRef.current = null;
    } catch (error: any) {
      showToast("error", error?.message || "Failed to save AEPS transaction.");
    } finally {
      setBusy(false);
    }
  };


  const portalName = initialPortals.find((p) => p.id === portalId)?.name || "—";
  const bankName = bankOptions.find((b) => b.id === bankId)?.name || "—";

  // Last 7 days trend calculations
  const trendData = useMemo(() => {
    const days: { dateStr: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { weekday: "short" });
      const count = rows.filter((t) => (t.transaction_date || "").slice(0, 10) === dateStr).length;
      days.push({ dateStr, label, count });
    }
    const maxCount = Math.max(...days.map((d) => d.count), 1);
    const hasActivity = days.some((d) => d.count > 0);
    return { days, maxCount, hasActivity };
  }, [rows]);

  // Transaction type distribution
  const typeDistribution = useMemo(() => {
    const cashOutCount = rows.filter(
      (t) => !t.transfer_method || t.transfer_method === "cash_out" || t.transfer_method === "withdrawal"
    ).length;
    const collectionCount = rows.filter(
      (t) => t.transfer_method === "payment_collection" || t.transfer_method === "collection"
    ).length;
    const balanceCount = rows.filter(
      (t) => t.transfer_method === "balance_enquiry" || t.transfer_method === "enquiry"
    ).length;
    const statementCount = rows.filter(
      (t) => t.transfer_method === "mini_statement" || t.transfer_method === "statement"
    ).length;
    const total = rows.length || 1;
    return {
      cashOutCount,
      collectionCount,
      balanceCount,
      statementCount,
      cashOutPct: Math.round((cashOutCount / total) * 100),
      collectionPct: Math.round((collectionCount / total) * 100),
      balancePct: Math.round((balanceCount / total) * 100),
      statementPct: Math.round((statementCount / total) * 100),
    };
  }, [rows]);

  // Ledger action state
  const [thermalTxn, setThermalTxn] = useState<Txn | null>(null);
  const [viewTxn, setViewTxn] = useState<Txn | null>(null);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [actionMenuTxn, setActionMenuTxn] = useState<Txn | null>(null);
  const [reverseTxn, setReverseTxn] = useState<Txn | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseBusy, setReverseBusy] = useState(false);
  const [auditTxn, setAuditTxn] = useState<Txn | null>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [auditBusy, setAuditBusy] = useState(false);
  useEffect(() => {
    if (!actionMenuTxn) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuTxn(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionMenuTxn]);

  const handleEditTransaction = (t: Txn) => {
    setViewTxn(null);
    setEditingTxnId(t.id);
    setActiveTab("workspace");
    setWorkspaceOpen(true);
    setReviewOpen(false);
    setCustomerId((t as any).customer_id || "");
    setSelectedCustomerRecord(
      (t as any).customer_id
        ? { id: (t as any).customer_id, name: t.customers?.name, mobile: t.customer_mobile || t.customers?.phone }
        : null
    );
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setSearchHasQueried(false);
    setCustomerSearchError(null);
    setMobile(t.customer_mobile || t.customers?.phone || "");
    setName(t.customers?.name || "");
    setAadhaar(t.aadhaar_last4 || "");
    setAmount(String(t.amount ?? ""));
    setFee(String(t.service_fee ?? ""));
    setCommission(String(t.portal_commission ?? ""));
    setBankId((t as any).bank_id || "");
    setPortalId((t as any).portal_id || "");
    setBankRef(t.reference || "");
    const portalRemark = String(t.remarks || "").replace(/^Portal Ref:\s*/i, "");
    setPortalRef(portalRemark);
    setTransactionRef(t.reference || portalRemark || "");
    setTransactionType(((t.transfer_method || "cash_out") as AepsTxnType));
    setFeeSource(
      (t.fee_source === "upi" || t.fee_source === "separate_cash" || t.fee_source === "cut_from_withdrawal")
        ? t.fee_source
        : "cut_from_withdrawal"
    );
    showToast("info", "Transaction loaded for editing. Save to update the existing transaction.");
  };

  const isFormValid = useMemo(() => {
    const numAmount = Number(amount);
    if (transactionType === "cash_out" || transactionType === "payment_collection") {
      return cleanMobile.length === 10 && cleanAadhaar.length === 4 && numAmount > 0 && !!bankId && !!portalId;
    }
    return cleanMobile.length === 10 && cleanAadhaar.length === 4 && !!bankId && !!portalId;
  }, [cleanMobile, cleanAadhaar, amount, transactionType, bankId, portalId]);

  const pendingReviewCount = changeRecords.filter((r) => r.status === "pending").length;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24 text-slate-900">
      <div className="mx-auto max-w-[1720px] px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* TOP COMMAND HEADER */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <span className="text-xl font-black">A</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                  AEPS Transactions
                </h1>
                <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-black text-blue-700">
                  LIVE WATCHER READY
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Aadhaar Enabled Payment System · Biometric Cash Out, Enquiry, &amp; Smart Portal Reconciliation
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("watcher")}
              className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "watcher"
                  ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>◷</span> Multi-Source Watcher
              {pendingReviewCount > 0 && (
                <span className="rounded-full bg-amber-500 text-white text-[9px] px-1.5 py-0.2 font-black">
                  {pendingReviewCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setRulesModalOpen(true)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
            >
              <span>⚙</span> Setup Rules
            </button>
            <button
              type="button"
              onClick={() => setInsightsOpen(!insightsOpen)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors flex items-center gap-1.5"
            >
              <span>✦</span> AI Insights
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("workspace");
                handleNewCashOut();
              }}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-black text-white shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              ＋ Record Transaction
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              ⇩ Export
            </button>
          </div>
        </header>

        {/* 5 PREMIUM KPI CARDS */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["▣", "Total Transactions", String(stats.total), "border-blue-100 bg-blue-50/60 text-blue-600"],
            ["₹", "Total Amount", inr(stats.amount), "border-emerald-100 bg-emerald-50/60 text-emerald-600"],
            ["%", "Total Fees", inr(stats.fees), "border-rose-100 bg-rose-50/60 text-rose-600"],
            ["◔", "Portal Commission", inr(stats.commission), "border-violet-100 bg-violet-50/60 text-violet-600"],
            ["▣", "AEPS Float", inr(aepsFloat), "border-amber-100 bg-amber-50/60 text-amber-600"],
          ].map(([icon, label, value, tone]) => (
            <div key={label} className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
              <div className="flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black shadow-sm">
                  {icon}
                </div>
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        {/* NAVIGATION / SUB-VIEW SWITCHER */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 rounded-2xl shadow-sm">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("workspace")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "workspace" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>⚡</span> Counter Workspace (Full-Width)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("watcher")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "watcher" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>◷</span> Multi-Source Portal Watcher
              {pendingReviewCount > 0 && (
                <span className="rounded-full bg-amber-400 text-slate-950 text-[9px] px-1.5 font-black">
                  {pendingReviewCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ledger")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "ledger" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>📋</span> Ledger &amp; Analytics ({filtered.length})
            </button>
          </div>

          {activeTab === "workspace" && (
            <button
              type="button"
              onClick={() => setWorkspaceOpen(!workspaceOpen)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800"
            >
              {workspaceOpen ? "▲ Minimize Terminal" : "▼ Expand Terminal"}
            </button>
          )}
        </div>

        {/* OPTIONAL AI INSIGHTS ACCORDION */}
        {insightsOpen && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-violet-900 flex items-center gap-2">
                <span>✦</span> AI Insights Engine
              </h3>
              <button
                type="button"
                onClick={() => setInsightsOpen(false)}
                className="text-xs text-violet-600 font-bold"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-xs pt-1">
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Audit Status</span>
                <p className="font-semibold text-slate-800">
                  {stats.review > 0
                    ? `${stats.review} transaction(s) pending operator review.`
                    : "All transactions reconciled successfully."}
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Fee Integrity</span>
                <p className="font-semibold text-slate-800">
                  {stats.fees > 0
                    ? `Total customer fees collected: ${inr(stats.fees)}.`
                    : "Zero customer fees recorded in this dataset."}
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Operator Yield</span>
                <p className="font-semibold text-slate-800">
                  {stats.amount > 0
                    ? `Net margin is ${((stats.commission / (stats.amount || 1)) * 100).toFixed(2)}% of volume.`
                    : "No transaction volume loaded."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: FULL-WIDTH OPERATOR TRANSACTION WORKSPACE                         */}
        {/* ========================================================================= */}
        {activeTab === "workspace" && workspaceOpen && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 shadow-md space-y-5">

            {/* WORKSPACE HEADER BAR WITH PRIMARY MODE SWITCH & REFRESH */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-blue-600" />
                  <h2 className="text-lg font-black text-slate-950">Record AEPS Transaction</h2>
                  <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-black text-blue-700">
                    Review First
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated intelligent terminal organized into Customer, Transaction, and Pricing/Review
                </p>
              </div>

              {/* PRIMARY CONTROLS: VERIFY ALL, MODE SWITCH, SETUP RULES */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => verifyCurrentPortalDetails(true)}
                  disabled={isVerifyingPortal}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <span className={isVerifyingPortal ? "animate-spin" : ""}>🔄</span>
                  {isVerifyingPortal ? (verificationProgressStep || "Verifying Sources…") : "Verify Current Details"}
                </button>

                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMode("manual");
                      setSourceSectionOpen(false);
                    }}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                      entryMode === "manual" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Manual Entry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEntryMode("ai");
                      setSourceSectionOpen(true);
                    }}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                      entryMode === "ai" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <span>✦</span> AI Auto-Fill
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSourceSectionOpen(!sourceSectionOpen)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                    sourceSectionOpen
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>📷</span> Scan / Source Data
                </button>

                <button
                  type="button"
                  onClick={() => setRulesModalOpen(true)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1"
                >
                  <span>⚙</span> Setup Rules
                </button>
              </div>
            </div>

            {/* LIVE WATCHER CARD — ALL REGISTERED PORTALS */}
            <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-950">Live Watcher — All Portals</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${liveWatcherActive ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                      {isVerifyingPortal ? "CHECKING…" : liveWatcherActive ? "LIVE WATCHING" : "IDLE"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">All registered portals are monitored independently. Portal results are never mixed.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {liveWatcherActive ? (
                    <button type="button" onClick={stopLiveWatcher} className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-rose-700">
                      Stop Live Watcher
                    </button>
                  ) : (
                    <button type="button" onClick={startLiveWatcher} disabled={isVerifyingPortal || liveEnabledCount === 0} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                      {isVerifyingPortal ? "Starting…" : "Start Live Watcher"}
                    </button>
                  )}
                  <button type="button" onClick={() => verifyCurrentPortalDetails(true)} disabled={isVerifyingPortal || liveEnabledCount === 0} className="rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
                    Verify Selected
                  </button>
                  <button type="button" onClick={verifyAllPortalsLive} disabled={isVerifyingPortal || initialPortals.length === 0} className="rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50 disabled:opacity-50">
                    Verify All
                  </button>
                  <button type="button" onClick={() => { setSelectedWatcherPortalId(portalId); setActiveTab("watcher"); }} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Open Watcher
                  </button>
                </div>
              <div className="border-t border-emerald-100 bg-white px-4 py-3 text-[10px] text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span><b className="text-slate-700">Mode:</b> {liveWatcherActive ? "Persistent desktop watcher" : "Manual verification"}</span>
                <span><b className="text-slate-700">Detected:</b> {liveWatcherDetectedCount}</span>
                <span><b className="text-slate-700">Last event:</b> {liveWatcherLastEventAt ? fmtTime(liveWatcherLastEventAt) : "—"}</span>
                {liveWatcherError && <span className="font-bold text-amber-700">{liveWatcherError}</span>}
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3">
                {portalWatcherSummaries.map(({ portal, sources, enabledCount, healthyCount, errorCount, latestRun }) => {
                  const selected = portal.id === portalId;
                  const status = latestRun?.verificationStatus || (enabledCount > 0 ? "NOT VERIFIED" : "NOT CONFIGURED");
                  return (
                    <button key={portal.id} type="button" onClick={() => { setPortalId(portal.id); setSelectedWatcherPortalId(portal.id); }} className={'rounded-2xl border p-4 text-left transition-all ' + (selected ? "border-blue-400 bg-blue-50/70 ring-2 ring-blue-100" : "border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-white")}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-black text-slate-950">{portal.name}</div>
                        <span className={'rounded-full px-2 py-0.5 text-[9px] font-black ' + (status === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : status === "PARTIAL" ? "bg-amber-100 text-amber-800" : status === "CONFLICT" ? "bg-orange-100 text-orange-800" : status === "FAILED" ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-600")}>{status}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white p-2"><div className="text-[9px] font-bold text-slate-400">Sources</div><div className="mt-0.5 text-sm font-black text-slate-900">{sources.length}</div></div>
                        <div className="rounded-xl bg-white p-2"><div className="text-[9px] font-bold text-slate-400">Healthy</div><div className="mt-0.5 text-sm font-black text-emerald-700">{healthyCount}/{enabledCount}</div></div>
                        <div className="rounded-xl bg-white p-2"><div className="text-[9px] font-bold text-slate-400">Failed</div><div className="mt-0.5 text-sm font-black text-rose-600">{errorCount}</div></div>
                      </div>
                      <div className="mt-3 text-[10px] text-slate-500">{latestRun ? "Last verified " + fmtTime(latestRun.completedAt || latestRun.startedAt) + " · " + latestRun.successfulSourceCount + "/" + latestRun.sourceCount + " sources" : enabledCount > 0 ? "Configured · not verified yet" : "No watcher URLs configured"}</div>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] text-slate-500">
                <b className="text-slate-700">Selected transaction portal:</b> {portalName || "—"}. Other portal results are monitoring data only and never change this transaction's pricing or bank selection.
              </div>
            </section>

            {/* AUTO-COLLECTED & VERIFIED SUMMARY BANNER */}
            <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/80 via-teal-50/60 to-blue-50/60 p-4 shadow-sm space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-black tracking-wide text-emerald-950 uppercase">
                    Auto-Collected &amp; Verified Context
                  </span>
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
                    {currentRun
                      ? currentRun.verificationStatus === "VERIFIED"
                        ? `${currentRun.successfulSourceCount} / ${currentRun.sourceCount} sources verified`
                        : `${currentRun.successfulSourceCount} / ${currentRun.sourceCount} Partial Verification`
                      : "Baseline Config Verified"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {lastVerifiedAt ? `Verified ${fmtTime(lastVerifiedAt)}` : "Verified from active published rules"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVerificationModalOpen(true)}
                    className="rounded-lg bg-white border border-emerald-300 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 transition-colors shadow-sm"
                  >
                    View Verification ↗
                  </button>
                </div>
              </div>

              {/* Verified Parameter Chips */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Type:{" "}
                  <span className="font-black capitalize">{transactionType.replace(/_/g, " ")}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Bank:{" "}
                  <span className="font-black">{bankName || "Auto-Selecting"}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Portal:{" "}
                  <span className="font-black">{portalName}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Customer Fee:{" "}
                  <span className="font-mono font-black">{inr(Number(fee || 0))}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Commission:{" "}
                  <span className="font-mono font-black">{inr(Number(commission || 0))}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 font-bold text-emerald-900 flex items-center gap-1.5 shadow-2xs">
                  <span className="text-emerald-600">✓</span> Limit:{" "}
                  <span className="font-mono font-black">₹10,000</span>
                </div>
              </div>
            </div>

            {/* DEDICATED SOURCE / WATCHER / AI DATA SECTION */}
            {sourceSectionOpen && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xs text-blue-900 uppercase tracking-wide">
                      ✦ Dedicated Source / Watcher / AI Data Section
                    </span>
                    <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-bold">
                      Scan &amp; Paste Ready
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSourceSectionOpen(false)}
                    className="text-xs text-blue-700 hover:underline font-bold"
                  >
                    Hide Section
                  </button>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <textarea
                      rows={3}
                      value={pastedSourceText}
                      onChange={(e) => setPastedSourceText(e.target.value)}
                      placeholder="Paste SMS alert, CSC DigiPay receipt text, Spice Money voucher, or bank transaction slip here..."
                      className="w-full rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExtractFromPasted}
                        disabled={!pastedSourceText.trim()}
                        className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5"
                      >
                        <span>⚡</span> Auto-Extract &amp; Fill Form
                      </button>
                      <button
                        type="button"
                        onClick={() => setScanModalOpen(true)}
                        className="rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                      >
                        <span>📷</span> Upload Screenshot / OCR Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => setPastedSourceText("")}
                        className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white p-3.5 border border-blue-100 text-xs space-y-2">
                    <span className="font-bold text-[11px] text-slate-700 block">
                      Active Portal Watcher Baseline ({portalName}):
                    </span>
                    {(() => {
                      const activeSources = watcherSources.filter((s) => s.portalId === portalId);
                      return activeSources.length > 0 ? (
                        <div className="space-y-1 text-[11px]">
                          {activeSources.slice(0, 4).map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-slate-600">
                              <span className="font-medium">{PURPOSE_LABELS[s.purpose]?.label || s.purpose}:</span>
                              <span className="font-bold text-slate-900">
                                {s.currentPublishedValue.commission != null
                                  ? `₹${s.currentPublishedValue.commission.toFixed(2)}`
                                  : s.currentPublishedValue.summary?.slice(0, 24) || "Active"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-[11px]">Standard rates active.</p>
                      );
                    })()}
                    <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                      Rates monitored independently by Portal Watcher.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* DRAFT NOTIFICATION BAR */}
            {drafts.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Saved Drafts:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {drafts.slice(0, 3).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleLoadDraft(d)}
                        className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {d.mobile || "Draft"} · ₹{d.amount || "0"} ({d.savedAt})
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">Click to resume draft</span>
              </div>
            )}

            {/* =================================================================== */}
            {/* THE THREE LOGICAL COLUMNS (Desktop: 3 cols, Medium: 2 cols, Mobile: 1 col) */}
            {/* =================================================================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

              {/* ----------------------------------------------------------------- */}
              {/* COLUMN 1: CUSTOMER & IDENTITY                                     */}
              {/* ----------------------------------------------------------------- */}
              <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 lg:p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white">
                      1
                    </span>
                    <h3 className="text-sm font-black text-slate-900">Customer &amp; Identity</h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">Authoritative CafeERP DB</span>
                </div>

                {/* UNIVERSAL CUSTOMER SEARCH (Name, Mobile, ID, Aadhaar) */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-black text-slate-700">
                      Universal Customer Search
                    </label>
                    <span className="text-[9px] font-semibold text-slate-400">
                      Name · Mobile · ID · Aadhaar
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      value={customerSearchQuery}
                      onChange={(e) => handleCustomerSearch(e.target.value)}
                      placeholder="Search customer by name, mobile, customer ID, or Aadhaar..."
                      className="w-full rounded-xl border border-blue-200 bg-white pl-8 pr-8 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all shadow-sm"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 select-none">
                      🔍
                    </span>
                    {customerSearchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full h-5 w-5 flex items-center justify-center transition-colors"
                        title="Clear search text"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Customer Search Dropdown / States */}
                  {(isSearchingCustomer || customerSearchError || (searchHasQueried && customerSearchQuery.trim().length >= 2)) && (
                    <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                      {/* Loading State */}
                      {isSearchingCustomer && (
                        <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                          <span className="font-medium">Searching customers...</span>
                        </div>
                      )}

                      {/* Error State */}
                      {!isSearchingCustomer && customerSearchError && (
                        <div className="p-3 text-xs text-rose-600 bg-rose-50 rounded-lg border border-rose-100 font-medium">
                          {customerSearchError}
                        </div>
                      )}

                      {/* No Results State */}
                      {!isSearchingCustomer && !customerSearchError && searchHasQueried && customerSearchResults.length === 0 && (
                        <div className="p-3 text-center text-xs text-slate-500 space-y-1">
                          <p className="font-bold text-slate-700">No matching customers found</p>
                          <p className="text-[11px] text-slate-400">
                            Try searching by mobile number or customer code
                          </p>
                        </div>
                      )}

                      {/* Results List */}
                      {!isSearchingCustomer && !customerSearchError && customerSearchResults.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100 mb-1">
                            <span>Matching Customers ({customerSearchResults.length})</span>
                            <span className="text-[9px] font-normal normal-case text-slate-400">Select to link</span>
                          </div>
                          <div className="space-y-1">
                            {customerSearchResults.map((c) => {
                              const initials = getCustomerInitials(c.name);
                              const custCode = c.customerCode || c.code || c.id?.slice(0, 8);
                              const dispMobile = c.mobile || c.phone;
                              const aadhaarLast4 = c.aadhaarLast4 || c.aadhaar_last4;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectCustomer(c)}
                                  className="w-full rounded-xl p-2.5 text-left text-xs hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all flex items-center justify-between group"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold text-xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                      {initials}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-bold text-slate-900 block truncate group-hover:text-blue-950">
                                        {c.name || "Unnamed Customer"}
                                      </span>
                                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
                                        {custCode && <span>Customer ID: {custCode}</span>}
                                        {custCode && dispMobile && <span>·</span>}
                                        {dispMobile && <span>Mobile: {dispMobile}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                    {aadhaarLast4 && (
                                      <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700 whitespace-nowrap">
                                        ••••{String(aadhaarLast4).slice(-4)}
                                      </span>
                                    )}
                                    <span className="text-slate-300 group-hover:text-blue-600 text-xs">→</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Linked Customer Indicator Card */}
                {customerId && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs transition-all shadow-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white">
                        ✓
                      </span>
                      <div className="min-w-0">
                        <span className="font-bold text-emerald-950 block truncate">
                          Linked Customer: {name || selectedCustomerRecord?.name || "Verified Customer"}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 block truncate">
                          Customer ID: {selectedCustomerRecord?.customerCode || selectedCustomerRecord?.customerId || customerId.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnlinkCustomer}
                      className="shrink-0 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950 transition-colors shadow-xs"
                      title="Unlink customer from transaction (form details remain editable)"
                    >
                      Unlink
                    </button>
                  </div>
                )}

                {/* Customer Mobile */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Customer Mobile Number *
                  </label>
                  <div className="relative">
                    <input
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      maxLength={10}
                      placeholder="Enter 10-digit mobile number"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono transition-colors"
                    />
                    {cleanMobile.length === 10 && (
                      <span className="absolute right-3 top-2.5 text-emerald-600 text-xs font-bold">
                        ✓ Valid
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-slate-400">Must be exactly 10 digits</p>
                </div>

                {/* Customer Name */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    value={name || selectedCustomer?.name || ""}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Auto-resolved from CafeERP customer directory"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500"
                  />
                  <p className="mt-1 text-[9px] text-slate-400">Authoritative CafeERP database; never from portal</p>
                </div>

                {/* Aadhaar Last 4 Digits */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Aadhaar Last 4 Digits *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-400 font-bold select-none">
                      •••• ••••
                    </span>
                    <input
                      value={aadhaar}
                      onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      placeholder="1234"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm font-bold text-blue-600 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 tracking-widest text-center"
                    />
                  </div>
                  <p className="mt-1 text-[9px] text-slate-400">Masked for privacy. Stored for audit and verification only</p>
                </div>

                {/* Matched Candidates List */}
                {candidates.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <span className="text-[10px] font-black uppercase text-slate-500 block">
                      Matched Customers ({candidates.length}):
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {candidates.slice(0, 4).map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => handleSelectCustomer(c)}
                          className={`w-full rounded-xl p-2 text-left text-xs transition-all border ${
                            customerId === c.id
                              ? "bg-blue-50 border-blue-300 text-blue-900"
                              : "bg-white border-slate-200 hover:bg-slate-100 text-slate-800"
                          }`}
                        >
                          <div className="font-bold">{c.name}</div>
                          <div className="text-[10px] text-slate-500">{maskMobile(c.phone) || "No phone"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* COLUMN 2: TRANSACTION DETAILS                                     */}
              {/* ----------------------------------------------------------------- */}
              <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 lg:p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
                      2
                    </span>
                    <h3 className="text-sm font-black text-slate-900">Transaction Details</h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">Method &amp; Provider</span>
                </div>

                {/* Transaction Type Buttons */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Transaction Type *
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "cash_out", label: "Cash Withdrawal" },
                      { id: "balance_enquiry", label: "Balance Enquiry" },
                      { id: "mini_statement", label: "Mini Statement" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const newType = item.id as AepsTxnType;
                          setTransactionType(newType);
                          if (newType === "balance_enquiry" || newType === "mini_statement") {
                            setAmount("0");
                          } else if (amount === "0") {
                            setAmount("");
                          }
                        }}
                        className={`rounded-xl py-2 px-1 text-center text-xs font-bold transition-all border ${
                          transactionType === item.id
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Direction & Collection Indicator */}
                {transactionType === "payment_collection" && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-indigo-950 flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                        Direction: IN (Customer → Shop/Business)
                      </span>
                      <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-bold text-[10px] text-indigo-800">
                        Aadhaar Pay
                      </span>
                    </div>
                    <p className="text-[11px] text-indigo-800">
                      Funds collected from customer bank into AEPS float. <strong>Zero physical cash is dispensed</strong>.
                    </p>
                    <div>
                      <label className="block text-[10px] font-black text-indigo-950 mb-1">
                        Collection Method
                      </label>
                      <select
                        value={collectionMethod}
                        onChange={(e) => setCollectionMethod(e.target.value as any)}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none"
                      >
                        <option value="aeps_portal">AEPS Portal Float (Direct Settlement)</option>
                        <option value="cash">Direct Cash Collection</option>
                        <option value="bank">Direct Bank Account Credit</option>
                        <option value="upi">Merchant UPI</option>
                      </select>
                    </div>
                  </div>
                )}

                {transactionType === "cash_out" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      Direction: Cash Withdrawal (Shop/Business → Customer)
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium">Physical cash dispensed from till</span>
                  </div>
                )}

                {(transactionType === "balance_enquiry" || transactionType === "mini_statement") && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 flex items-center justify-between">
                    <span className="font-bold">Informational Request (₹0 Principal)</span>
                    <span className="text-[10px] text-slate-500">Non-financial biometric enquiry</span>
                  </div>
                )}

                {/* 1-Click Top 10 Indian Bank Chips */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Top Indian Banks (1-Click Select)
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {TOP_INDIAN_BANKS.map((b) => {
                      const active = isBankChipActive(b.code);
                      return (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => selectBankByCode(b.code)}
                          className={`rounded-xl py-1.5 text-center text-[11px] font-bold transition-all border ${
                            active
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bank Select Dropdown */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Issuer Bank (Customer Account) *
                  </label>
                  <select
                    value={bankId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      if (newId === "__create_bank__") {
                        openCreateBank(
                          unmatchedBankName || "",
                          "Create a new bank master entry for an unmatched bank name."
                        );
                        return;
                      }
                      if (bankId && bankId !== newId) {
                        setAuditLogs((prev) => [
                          {
                            id: `audit-${Date.now()}`,
                            user: "Operator",
                            timestamp: new Date().toISOString(),
                            field: "bank",
                            oldValue: bankOptions.find((b) => b.id === bankId)?.name || "—",
                            newValue: bankOptions.find((b) => b.id === newId)?.name || "—",
                            reason: "Operator manual override",
                          },
                          ...prev,
                        ]);
                      }
                      setBankId(newId);
                      if (newId) setUnmatchedBankName(null);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Issuer Bank</option>
                    {bankOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                    <option value="__create_bank__">＋ Create New Bank</option>
                  </select>
                  <p className="mt-1 text-[9px] text-slate-400">Changing bank will NOT change portal</p>
                  {unmatchedBankName && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900">
                      <div className="font-bold">Bank not found in Bank Master</div>
                      <div className="mt-0.5 truncate font-mono">{unmatchedBankName}</div>
                      <button
                        type="button"
                        onClick={() =>
                          openCreateBank(
                            unmatchedBankName,
                            "Create the missing bank because the source name has no exact CafeERP Bank Master match."
                          )
                        }
                        className="mt-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-amber-700"
                      >
                        ＋ Create Bank
                      </button>
                    </div>
                  )}
                </div>

                {/* Registered Portal Selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Registered Portal Platform *
                  </label>
                  <select
                    value={portalId}
                    onChange={(e) => {
                      const newPortalId = e.target.value;
                      setPortalId(newPortalId);
                      // Changing portal recalculates pricing using new portal rules
                      const resolved = resolvePricingFromRules(pricingRules, newPortalId, Number(amount) || 2000, bankId, customerId);
                      setFee(String(resolved.fee));
                      setCommission(String(resolved.commission));
                      showToast("info", "Portal changed. Pricing rules recalculated.");
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
                  >
                    {initialPortals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[9px] text-slate-400">Changing portal recalculates pricing and rules</p>
                </div>

                {/* Unified Transaction Reference */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Transaction Reference [ RRN / Portal Reference ]
                  </label>
                  <input
                    value={transactionRef || bankRef || portalRef || ""}
                    onChange={(e) => handleTransactionRefChange(e.target.value)}
                    placeholder="Enter or auto-filled 12-digit RRN or portal reference code"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 font-mono"
                  />
                  <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>Bank RRN: {bankRef || "None"}</span>
                    <span>Portal Ref: {portalRef || "None"}</span>
                  </div>
                </div>
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* COLUMN 3: PRICING / REVIEW                                        */}
              {/* ----------------------------------------------------------------- */}
              <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 lg:p-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-xs font-black text-white">
                      3
                    </span>
                    <h3 className="text-sm font-black text-slate-900">Pricing / Review</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRulesModalOpen(true)}
                    className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <span>⚙</span> Setup Rules
                  </button>
                </div>

                {/* Amount (₹) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-700">Amount (₹) *</label>
                    <span className="text-[10px] font-bold text-slate-400">Max ₹10,000 / txn</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-base font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={transactionType === "balance_enquiry" || transactionType === "mini_statement"}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3.5 py-2 text-lg font-black text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 font-mono disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                {/* DYNAMIC DENOMINATION BUTTONS GENERATED FROM ACTIVE RULES */}
                {transactionType !== "balance_enquiry" && transactionType !== "mini_statement" && dynamicDenominations.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-700 mb-1">
                      Quick Denominations ({transactionType === "payment_collection" ? "Collection Slabs" : "Active Slabs"})
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {dynamicDenominations.map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleDenominationClick(val)}
                          className={`rounded-xl py-1.5 text-center text-xs font-bold transition-all border ${
                            amount === String(val)
                              ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                          }`}
                        >
                          ₹{val >= 1000 ? `${val / 1000}k` : val}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------------------- */}
                {/* CARD 1: FEE COLLECTION                                        */}
                {/* ------------------------------------------------------------- */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Fee Collection
                    </label>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                      Collection Mode
                    </span>
                  </div>
                  <select
                    value={feeSource}
                    onChange={(e) => setFeeSource(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="cut_from_withdrawal">Cut from Withdrawal</option>
                    <option value="separate_cash">Collect Separately (Cash)</option>
                    <option value="upi">Collect Separately in QR</option>
                  </select>
                  <div className="text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2 border border-slate-100">
                    {feeSource === "cut_from_withdrawal" && (
                      <span>
                        Deduct fee from customer payout. Customer receives{" "}
                        <strong className="text-slate-800 font-mono">
                          {inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))}
                        </strong>
                        .
                      </span>
                    )}
                    {feeSource === "separate_cash" && (
                      <span>
                        Customer receives full{" "}
                        <strong className="text-slate-800 font-mono">{inr(Number(amount || 0))}</strong>. Customer fee{" "}
                        <strong className="text-slate-800 font-mono">{inr(Number(fee || 0))}</strong> is collected separately in cash.
                      </span>
                    )}
                    {feeSource === "upi" && (
                      <span>
                        Customer receives full{" "}
                        <strong className="text-slate-800 font-mono">{inr(Number(amount || 0))}</strong> cash. Fee{" "}
                        <strong className="text-slate-800 font-mono">{inr(Number(fee || 0))}</strong> paid via Shop QR. Zero till cash increase.
                      </span>
                    )}
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* CARD 2: CUSTOMER FEE PAID                                     */}
                {/* ------------------------------------------------------------- */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Customer Fee Paid
                    </label>
                    <span className="text-[9px] font-medium text-slate-400">Auto from active rule</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={fee}
                      onChange={(e) => {
                        const newFee = e.target.value;
                        if (fee !== newFee) {
                          setAuditLogs((prev) => [
                            {
                              id: `audit-${Date.now()}`,
                              user: "Operator",
                              timestamp: new Date().toISOString(),
                              field: "fee",
                              oldValue: fee || "0",
                              newValue: newFee,
                              reason: "Operator manual override",
                            },
                            ...prev,
                          ]);
                        }
                        setFee(newFee);
                      }}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-xs font-mono font-bold text-indigo-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>Handling:</span>
                    <span className="font-semibold text-slate-700">
                      {feeSource === "cut_from_withdrawal"
                        ? "Deducted from cash payout"
                        : feeSource === "separate_cash"
                        ? "Paid separately in cash"
                        : "Paid via Shop QR (digital)"}
                    </span>
                  </div>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* CARD 3: PORTAL COMMISSION                                     */}
                {/* ------------------------------------------------------------- */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Portal Commission
                    </label>
                    <span className="text-[9px] font-medium text-slate-400">Auto from active rule</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={commission}
                      onChange={(e) => {
                        const newComm = e.target.value;
                        if (commission !== newComm) {
                          setAuditLogs((prev) => [
                            {
                              id: `audit-${Date.now()}`,
                              user: "Operator",
                              timestamp: new Date().toISOString(),
                              field: "commission",
                              oldValue: commission || "0",
                              newValue: newComm,
                              reason: "Operator manual override",
                            },
                            ...prev,
                          ]);
                        }
                        setCommission(newComm);
                      }}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-xs font-mono font-bold text-emerald-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="rounded-lg bg-emerald-50/80 border border-emerald-100 p-2 text-[10px] text-emerald-800 flex items-center justify-between">
                    <span className="font-medium">AEPS Balance Impact:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      +{inr(Number(commission || 0))}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-tight">
                    Increases AEPS float balance on successful settlement (Asset 1400).
                  </p>
                </div>

                {/* ------------------------------------------------------------- */}
                {/* CARD 4: AEPS BALANCE IMPACT / SETTLEMENT REVIEW               */}
                {/* ------------------------------------------------------------- */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs space-y-2">
                  <div className="flex items-center justify-between font-black text-slate-900 border-b border-emerald-200/60 pb-1.5">
                    <span className="uppercase text-[10px] tracking-wider text-emerald-950">
                      Settlement &amp; Balance Impact
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700">Live Breakdown</span>
                  </div>

                  {/* Customer Receives */}
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="text-[11px]">
                      {transactionType === "payment_collection"
                        ? "Customer Paid Total:"
                        : transactionType === "cash_out"
                        ? "Customer Receives:"
                        : "Customer Fee Paid:"}
                    </span>
                    <span className="font-mono text-sm font-black text-slate-950">
                      {transactionType === "cash_out"
                        ? inr(
                            feeSource === "cut_from_withdrawal"
                              ? Math.max(0, Number(amount || 0) - Number(fee || 0))
                              : Number(amount || 0)
                          )
                        : transactionType === "payment_collection"
                        ? inr(Number(amount || 0) + Number(fee || 0))
                        : inr(Number(fee || 0))}
                    </span>
                  </div>

                  {/* Cash Till Impact */}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-200/50">
                    <span className="text-slate-600">Cash Till Impact:</span>
                    <span
                      className={`font-mono font-bold ${
                        transactionType === "cash_out" ? "text-rose-600" : "text-slate-600"
                      }`}
                    >
                      {transactionType === "cash_out"
                        ? feeSource === "cut_from_withdrawal"
                          ? `-${inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))} (Net Out)`
                          : feeSource === "separate_cash"
                          ? `-${inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))} (Out ${inr(Number(amount || 0))}, In ${inr(Number(fee || 0))})`
                          : `-${inr(Number(amount || 0))} (Till Out; QR: +${inr(Number(fee || 0))})`
                        : "₹0.00"}
                    </span>
                  </div>

                  {/* AEPS Balance Impact */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">AEPS Balance Impact:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      +{inr(Number(commission || 0))} (Commission)
                    </span>
                  </div>

                  {/* Gross Float Credited */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Gross Float Credited:</span>
                    <span className="font-mono font-semibold text-emerald-800">
                      {transactionType === "balance_enquiry" || transactionType === "mini_statement"
                        ? `+${inr(Number(commission || 0))}`
                        : `+${inr(Number(amount || 0) + Number(commission || 0))}`}
                    </span>
                  </div>

                  {/* Net Margin (Fee + Commission) */}
                  <div className="flex items-center justify-between text-[11px] text-slate-700 pt-1 border-t border-emerald-200/50">
                    <span className="font-bold">Total Earnings (Margin):</span>
                    <span className="font-mono font-black text-emerald-700">
                      +{inr(Number(fee || 0) + Number(commission || 0))}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* =================================================================== */}
            {/* FIXED BOTTOM ACTION AREA                                            */}
            {/* =================================================================== */}
            <div className="sticky bottom-0 z-20 -mx-5 -mb-5 lg:-mx-6 lg:-mb-6 mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur shadow-lg rounded-b-2xl">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Final recording stays under operator review.</span>
                {draftSavedAt && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    Draft saved at {draftSavedAt}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleNewCashOut}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={!mobile && !aadhaar && !amount}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={!isFormValid || busy}
                  onClick={() => setReviewOpen(true)}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-blue-600/20 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
                >
                  {busy ? "Processing…" : "✓ Approve & Save"}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: MULTI-SOURCE PORTAL WATCHING ENGINE                               */}
        {/* ========================================================================= */}
        {activeTab === "watcher" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 shadow-sm space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-3 w-3 rounded-full bg-emerald-500" />
                  <h2 className="text-lg font-black text-slate-950">Multi-Source Portal Watcher</h2>
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700">
                    Independent Purpose Scraping
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Monitor independent source URLs under each registered portal for Commission, Fee, Rules, and Downtime updates
                </p>
              </div>

              <div className="flex items-center gap-2">
                {liveWatcherActive ? (
                  <button
                    type="button"
                    onClick={stopLiveWatcher}
                    className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-black text-white shadow-sm transition-all"
                  >
                    Stop Live Watcher
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startLiveWatcher}
                    disabled={isVerifyingPortal}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                  >
                    {isVerifyingPortal ? "Starting…" : "Start Live Watcher"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => verifyCurrentPortalDetails(true)}
                  disabled={isVerifyingPortal}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span className={isVerifyingPortal ? "animate-spin" : ""}>🔄</span>
                  {isVerifyingPortal ? "Verifying…" : "Collect & Verify All"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("workspace")}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  ← Back to Workspace
                </button>
              </div>
            </div>

            {/* PORTAL SELECTOR TABS */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
              {initialPortals.map((p) => {
                const count = watcherSources.filter((s) => s.portalId === p.id && !s.isArchived).length;
                const active = selectedWatcherPortalId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedWatcherPortalId(p.id)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                      active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        active ? "bg-white/20 text-white" : "bg-white text-slate-700"
                      }`}
                    >
                      {count} Sources
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CHANGE REVIEW / DIFFERENCE LOG SECTION */}
            {changeRecords.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">
                      Operator Review Queue: Detected Portal Rate Differences
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Production Invariant: Operator Approval Mandatory
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  The watcher never automatically overwrites production Fee or Commission values. Review proposed updates below. Only approved changes become the active published value.
                </p>

                <div className="space-y-2 pt-1">
                  {changeRecords.map((chg) => (
                    <div
                      key={chg.id}
                      className="rounded-xl border border-amber-200 bg-white p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{chg.portalName}</span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${
                              PURPOSE_LABELS[chg.purpose]?.badgeColor || "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {PURPOSE_LABELS[chg.purpose]?.label || chg.purpose}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">{fmtTime(chg.extractedAt)}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          Source URL:{" "}
                          <a
                            href={chg.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {chg.sourceUrl}
                          </a>
                        </div>
                        <div className="flex items-center gap-3 pt-1 text-[11px]">
                          <span className="text-slate-500">
                            Old Value: <b className="text-slate-800 font-mono">{chg.oldValue}</b>
                          </span>
                          <span className="text-blue-500 font-bold">→</span>
                          <span className="text-emerald-700">
                            Proposed New Value: <b className="text-emerald-800 font-mono">{chg.newValue}</b>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        {chg.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRejectChange(chg.id)}
                              className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveChange(chg.id)}
                              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-xs font-black text-white shadow-sm transition-all"
                            >
                              Approve &amp; Activate
                            </button>
                          </>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              chg.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {chg.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CONFIGURED SOURCE URLS LIST FOR SELECTED PORTAL */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">
                  Configured Sources for{" "}
                  {initialPortals.find((p) => p.id === selectedWatcherPortalId)?.name || "Portal"}
                </h3>
                <span className="text-xs text-slate-400">Processed independently</span>
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                {currentPortalSources.map((source) => {
                  const purposeMeta = PURPOSE_LABELS[source.purpose] || {
                    label: source.purpose,
                    badgeColor: "bg-slate-100 text-slate-700",
                    description: "Portal monitoring source",
                  };
                  const isTesting = testingSourceId === source.id;
                  const isCollecting = collectingSourceId === source.id;

                  return (
                    <div
                      key={source.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${purposeMeta.badgeColor}`}>
                            {purposeMeta.label}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 truncate max-w-[400px]">
                            {source.url}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                              source.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {source.isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 leading-snug">{purposeMeta.description}</p>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                          <span>
                            Last Checked:{" "}
                            <b>
                              {source.lastChecked
                                ? fmtDate(source.lastChecked) + " " + fmtTime(source.lastChecked)
                                : "Never"}
                            </b>
                          </span>
                          <span>·</span>
                          <span>
                            Active Published Value:{" "}
                            <b className="text-slate-900 font-mono">
                              {source.currentPublishedValue.commission != null
                                ? `Commission ₹${source.currentPublishedValue.commission.toFixed(2)}`
                                : source.currentPublishedValue.fee != null
                                ? `Fee ₹${source.currentPublishedValue.fee.toFixed(2)}`
                                : source.currentPublishedValue.summary || "Baseline configured"}
                            </b>
                          </span>
                          {source.lastMessage && (
                            <>
                              <span>·</span>
                              <span className="text-slate-600 italic truncate max-w-[280px]">
                                {source.lastMessage}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* SOURCE ACTIONS */}
                      <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => handleTestSource(source)}
                          disabled={isTesting || isCollecting}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          {isTesting ? "Testing…" : "Test URL"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCollectSource(source)}
                          disabled={!source.isEnabled || isTesting || isCollecting}
                          className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                        >
                          {isCollecting ? "Collecting…" : "Collect Now"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSource(source)}
                          disabled={isTesting || isCollecting}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        >
                          Edit URL
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleWatcher(source.id)}
                          disabled={isTesting || isCollecting}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                            source.isEnabled
                              ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                              : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                        >
                          {source.isEnabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteSource(source)}
                          disabled={isTesting || isCollecting}
                          className="rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 hover:border-rose-300 transition-colors disabled:opacity-50"
                        >
                          Delete URL
                        </button>
                      </div>
                    </div>
                  );
                })}

                {currentPortalSources.length === 0 && (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No source URLs configured for this portal yet.
                  </div>
                )}
              </div>
            </div>

            {/* ADD NEW SOURCE URL FORM */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                ＋ Add Independent Source URL
              </h4>
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-7">
                  <input
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://portal.example.com/rates or https://..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div className="sm:col-span-3">
                  <select
                    value={newSourcePurpose}
                    onChange={(e) => setNewSourcePurpose(e.target.value as PortalSourcePurpose)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                  >
                    {Object.entries(PURPOSE_LABELS).map(([k, meta]) => (
                      <option key={k} value={k}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddSource}
                    disabled={!newSourceUrl.trim()}
                    className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2 text-xs font-black text-white shadow-sm disabled:opacity-50 transition-all"
                  >
                    Add Source
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: LEDGER & ANALYTICS                                                */}
        {/* ========================================================================= */}
        {activeTab === "ledger" && (
          <div className="space-y-6 animate-fadeIn">
            {/* 7-DAY TREND VISUALIZATION */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Transaction Trend (7-Day Velocity)
                  </h3>
                  <span className="text-[11px] font-bold text-slate-400">Daily Volumes</span>
                </div>

                <div className="h-40 flex items-end justify-between gap-3 pt-4 px-2">
                  {trendData.days.map((d) => {
                    const heightPct = Math.round((d.count / trendData.maxCount) * 100);
                    return (
                      <div key={d.dateStr} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                        <span className="text-[10px] font-bold text-slate-500 font-mono">{d.count}</span>
                        <div
                          style={{ height: `${Math.max(heightPct, 6)}%` }}
                          className="w-full rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-all"
                        />
                        <span className="text-[10px] font-bold text-slate-500">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TRANSACTION TYPE PIE / BARS */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Transactions by Type</h3>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <div className="flex justify-between text-xs mb-1 font-bold">
                      <span className="text-slate-700">Cash Out</span>
                      <span className="text-blue-600 font-mono">
                        {typeDistribution.cashOutPct}% ({typeDistribution.cashOutCount})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div style={{ width: `${typeDistribution.cashOutPct}%` }} className="h-full bg-blue-600" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-bold">
                      <span className="text-slate-700">Payment Collection</span>
                      <span className="text-violet-600 font-mono">
                        {typeDistribution.collectionPct}% ({typeDistribution.collectionCount})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div style={{ width: `${typeDistribution.collectionPct}%` }} className="h-full bg-violet-600" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-bold">
                      <span className="text-slate-700">Balance Enquiry</span>
                      <span className="text-indigo-600 font-mono">
                        {typeDistribution.balancePct}% ({typeDistribution.balanceCount})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div style={{ width: `${typeDistribution.balancePct}%` }} className="h-full bg-indigo-500" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 font-bold">
                      <span className="text-slate-700">Mini Statement</span>
                      <span className="text-emerald-600 font-mono">
                        {typeDistribution.statementPct}% ({typeDistribution.statementCount})
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div style={{ width: `${typeDistribution.statementPct}%` }} className="h-full bg-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* LEDGER FILTER BAR */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by customer, mobile, RRN..."
                    className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
                </div>

                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 bg-white"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="last7">Last 7 Days</option>
                  <option value="last30">Last 30 Days</option>
                  <option value="this_month">This Month</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 bg-white"
                >
                  <option value="all">All Methods</option>
                  <option value="cash_out">Cash Out</option>
                  <option value="payment_collection">Payment Collection</option>
                  <option value="balance_enquiry">Balance Enquiry</option>
                  <option value="mini_statement">Mini Statement</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="success">Success / Recorded</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* LEDGER TABLE */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[1300px] text-left text-[11px]">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3.5 py-3">Txn #</th>
                      <th className="px-3 py-3">Date &amp; Time</th>
                      <th className="px-3 py-3">Customer</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Aadhaar</th>
                      <th className="px-3 py-3 text-right">Amount</th>
                      <th className="px-3 py-3 text-right">Fee</th>
                      <th className="px-3 py-3 text-right">Comm</th>
                      <th className="px-3 py-3">Bank</th>
                      <th className="px-3 py-3">Portal</th>
                      <th className="px-3 py-3">RRN / Reference</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3.5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filtered.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3.5 py-2.5 font-mono font-bold text-blue-600">
                          {t.transaction_number || t.id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                          {fmtDate(t.transaction_date)} {fmtTime(t.transaction_timestamp)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-slate-900">{t.customers?.name || "Walk-in Customer"}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {maskMobile(t.customer_mobile || t.customers?.phone)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold capitalize text-slate-700">
                            {t.transfer_method === "cash_out" || !t.transfer_method
                              ? "Cash Withdrawal"
                              : t.transfer_method.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-700">
                          {t.aadhaar_last4 ? `•••• ${t.aadhaar_last4}` : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-black text-slate-950">
                          {inr(Number(t.amount || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-rose-600">
                          {inr(Number(t.service_fee || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-600">
                          {inr(Number(t.portal_commission || 0))}
                        </td>
                        <td className="px-3 py-2.5 text-slate-800">{t.banks?.name || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-800">{t.portals?.name || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-600">
                          <div>RRN: {t.reference || "—"}</div>
                          {t.remarks && <div className="text-slate-400">{t.remarks}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                              t.status === "success" || t.status === "recorded"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {t.status || "success"}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                          <div className="relative flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditTransaction(t)}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                              title="Edit transaction"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewTxn(t)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                              title="View transaction"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePrintTransaction(t)}
                              className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
                              title="Print receipt"
                            >
                              Print
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWhatsAppShare(t)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Share transaction on WhatsApp"
                            >
                              WhatsApp
                            </button>
                            <button
                              type="button"
                              onClick={() => setActionMenuTxn(t)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-black text-slate-700 hover:bg-slate-50"
                              aria-label="More transaction actions"
                              aria-expanded={actionMenuTxn?.id === t.id}
                              title="More actions"
                            >
                              ⋮
                            </button>

                          </div>
                        </td>
                      </tr>
                    ))}

                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-xs text-slate-400">
                          No transactions found matching criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTION ACTIONS POPUP */}
        {actionMenuTxn && (
          <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Transaction actions"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setActionMenuTxn(null);
            }}
          >
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transaction Actions</div>
                  <div className="mt-1 font-mono text-sm font-black text-slate-950">
                    {actionMenuTxn.transaction_number || actionMenuTxn.id.slice(0, 8)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {actionMenuTxn.customers?.name || "Walk-in Customer"} · {inr(Number(actionMenuTxn.amount || 0))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionMenuTxn(null)}
                  className="rounded-lg px-2 py-1 text-lg font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close transaction actions"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 p-4">
                <button
                  type="button"
                  onClick={() => {
                    handleCopyRrn(actionMenuTxn);
                    setActionMenuTxn(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="text-lg">📋</div>
                  <div className="mt-1 text-xs font-black text-slate-900">Copy RRN</div>
                  <div className="text-[10px] text-slate-500">Copy transaction reference</div>
                </button>

                <a
                  href={invoiceUrl(actionMenuTxn.id)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setActionMenuTxn(null)}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-left hover:bg-indigo-100"
                >
                  <div className="text-lg">📄</div>
                  <div className="mt-1 text-xs font-black text-indigo-900">Save as PDF</div>
                  <div className="text-[10px] text-indigo-700">A4 printable receipt</div>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setViewTxn(actionMenuTxn);
                    setActionMenuTxn(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="text-lg">👁</div>
                  <div className="mt-1 text-xs font-black text-slate-900">View Details</div>
                  <div className="text-[10px] text-slate-500">Full transaction information</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleEditTransaction(actionMenuTxn);
                    setActionMenuTxn(null);
                  }}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left hover:bg-blue-100"
                >
                  <div className="text-lg">✏️</div>
                  <div className="mt-1 text-xs font-black text-blue-900">Edit Transaction</div>
                  <div className="text-[10px] text-blue-700">Open in AEPS workspace</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handlePrintTransaction(actionMenuTxn);
                    setActionMenuTxn(null);
                  }}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-left hover:bg-indigo-100"
                >
                  <div className="text-lg">🖨️</div>
                  <div className="mt-1 text-xs font-black text-indigo-900">Print</div>
                  <div className="text-[10px] text-indigo-700">Open print dialog</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleWhatsAppShare(actionMenuTxn);
                    setActionMenuTxn(null);
                  }}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-left hover:bg-emerald-100"
                >
                  <div className="text-lg">💬</div>
                  <div className="mt-1 text-xs font-black text-emerald-900">WhatsApp</div>
                  <div className="text-[10px] text-emerald-700">Share transaction summary</div>
                </button>

                {actionMenuTxn.status === "success" && (
                  <button
                    type="button"
                    onClick={() => {
                      setReverseTxn(actionMenuTxn);
                      setReverseReason("");
                      setActionMenuTxn(null);
                    }}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-left hover:bg-rose-100"
                  >
                    <div className="text-lg">↩️</div>
                    <div className="mt-1 text-xs font-black text-rose-900">Reverse Transaction</div>
                    <div className="text-[10px] text-rose-700">Requires a reason</div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenAudit(actionMenuTxn)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:bg-slate-50"
                >
                  <div className="text-lg">🧾</div>
                  <div className="mt-1 text-xs font-black text-slate-900">Audit / Ledger</div>
                  <div className="text-[10px] text-slate-500">Posted journal entries</div>
                </button>

                <button
                  type="button"
                  onClick={() => handlePortalVerification(actionMenuTxn)}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-left hover:bg-amber-100"
                >
                  <div className="text-lg">🔎</div>
                  <div className="mt-1 text-xs font-black text-amber-900">Verification</div>
                  <div className="text-[10px] text-amber-700">Portal/source verification</div>
                </button>

                {(actionMenuTxn as any).customer_id && (
                  <Link
                    href={"/customers/" + String((actionMenuTxn as any).customer_id)}
                    onClick={() => setActionMenuTxn(null)}
                    className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-left hover:bg-violet-100"
                  >
                    <div className="text-lg">👤</div>
                    <div className="mt-1 text-xs font-black text-violet-900">Open Customer</div>
                    <div className="text-[10px] text-violet-700">Customer profile</div>
                  </Link>
                )}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[10px] text-slate-500">
                Actions are performed against the persisted transaction record.
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTION REVERSE CONFIRMATION MODAL */}
        {reverseTxn && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-rose-700">Reverse Transaction</h3>
                  <p className="text-xs text-slate-500">{reverseTxn.transaction_number || reverseTxn.id.slice(0, 8)}</p>
                </div>
                <button type="button" onClick={() => !reverseBusy && setReverseTxn(null)} className="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] text-rose-900">
                <b>This does not delete the transaction.</b> It reverses the stored financial legs and marks the original transaction as reversed.
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                <div><span className="block text-[10px] font-bold text-slate-400">Customer</span><span className="font-bold">{reverseTxn.customers?.name || "Walk-in"}</span></div>
                <div><span className="block text-[10px] font-bold text-slate-400">Amount</span><span className="font-mono font-black">{inr(Number(reverseTxn.amount || 0))}</span></div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-black text-slate-700">Reversal Reason *</label>
                <textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Wrong customer / incorrect amount / duplicate transaction" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-rose-400" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setReverseTxn(null)} disabled={reverseBusy} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={handleReverseTransaction} disabled={reverseBusy || !reverseReason.trim()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50">
                  {reverseBusy ? "Reversing…" : "Reverse Transaction"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTION AUDIT / GL MODAL */}
        {auditTxn && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">Transaction Audit / Ledger</h3>
                  <p className="text-xs text-slate-500 font-mono">{auditTxn.transaction_number || auditTxn.id}</p>
                </div>
                <button type="button" onClick={() => setAuditTxn(null)} className="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>
              </div>
              {auditBusy ? (
                <div className="py-12 text-center text-xs font-bold text-slate-500">Loading ledger entries…</div>
              ) : auditRows.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">No posted journal lines were found for this transaction.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Entry</th>
                        <th className="px-3 py-2.5">Account</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5 text-right">Debit</th>
                        <th className="px-3 py-2.5 text-right">Credit</th>
                        <th className="px-3 py-2.5">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditRows.map((row, idx) => (
                        <tr key={(row.source_id || auditTxn.id) + "-" + (row.entry_number || idx) + "-" + idx}>
                          <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{row.entry_number || "—"}</td>
                          <td className="px-3 py-2.5"><div className="font-bold">{row.account_code || "—"}</div><div className="text-[10px] text-slate-500">{row.account_name || "—"}</div></td>
                          <td className="px-3 py-2.5 capitalize">{String(row.account_type || "—").replace(/_/g, " ")}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-rose-600">{inr(Number(row.debit || 0))}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{inr(Number(row.credit || 0))}</td>
                          <td className="px-3 py-2.5 text-slate-600">{row.line_description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={() => setAuditTxn(null)} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* TRANSACTION VIEW MODAL */}
        {viewTxn && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">AEPS Transaction Details</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {viewTxn.transaction_number || viewTxn.id.slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewTxn(null)}
                  className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs border border-slate-200">
                {[
                  ["Customer", viewTxn.customers?.name || "Walk-in Customer"],
                  ["Mobile", maskMobile(viewTxn.customer_mobile || viewTxn.customers?.phone)],
                  ["Transaction Type", viewTxn.transfer_method === "cash_out" ? "Cash Withdrawal" : String(viewTxn.transfer_method || "—").replace(/_/g, " ")],
                  ["Bank", viewTxn.banks?.name || "—"],
                  ["Portal", viewTxn.portals?.name || "—"],
                  ["Amount", inr(Number(viewTxn.amount || 0))],
                  ["Customer Fee", inr(Number(viewTxn.service_fee || 0))],
                  ["Portal Commission", inr(Number(viewTxn.portal_commission || 0))],
                  ["Fee Collection", viewTxn.fee_source === "cut_from_withdrawal" ? "Cut from Withdrawal" : viewTxn.fee_source === "separate_cash" ? "Collect Separately" : viewTxn.fee_source === "upi" ? "Collect Separately in QR" : "—"],
                  ["RRN / Reference", viewTxn.reference || "—"],
                  ["Status", String(viewTxn.status || "success").toUpperCase()],
                  ["Date & Time", `${fmtDate(viewTxn.transaction_date)} ${fmtTime(viewTxn.transaction_timestamp)}`],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span className="text-[10px] font-bold text-slate-400 block">{label}</span>
                    <span className="font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleEditTransaction(viewTxn)}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintTransaction(viewTxn)}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100"
                >
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => handleWhatsAppShare(viewTxn)}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setViewTxn(null)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 1: SOURCE VERIFICATION DETAILS MODAL (REQUIREMENT 22)                */}
        {/* ========================================================================= */}
        {verificationModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  <div>
                    <h3 className="text-base font-black text-slate-950">Portal Source Verification Provenance</h3>
                    <p className="text-xs text-slate-500">
                      Collection Run #{currentRun?.id || `run-${portalId.slice(0, 8)}`} · {portalName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setVerificationModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Status Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">Status</span>
                  <span className="font-black text-emerald-700">
                    {currentRun?.verificationStatus || "VERIFIED"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">Sources Checked</span>
                  <span className="font-mono font-bold text-slate-900">
                    {currentRun?.sourceCount ?? watcherSources.filter((s) => s.portalId === portalId).length}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">Successful</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {currentRun?.successfulSourceCount ?? watcherSources.filter((s) => s.portalId === portalId).length}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">Conflicts</span>
                  <span className="font-mono font-bold text-slate-900">{currentRun?.conflictCount || 0}</span>
                </div>
              </div>

              {/* Sources List */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Configured Participating Sources:
                </span>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden text-xs">
                  {watcherSources
                    .filter((s) => s.portalId === portalId)
                    .map((s) => (
                      <div key={s.id} className="p-3 flex items-start justify-between gap-3 bg-white">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${
                                PURPOSE_LABELS[s.purpose]?.badgeColor || "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {PURPOSE_LABELS[s.purpose]?.label || s.purpose}
                            </span>
                            <span className="font-mono text-slate-800 text-[11px] truncate max-w-[340px]">
                              {s.url}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">{s.lastMessage || "Baseline verified"}</p>
                        </div>
                        <span className="text-emerald-600 font-bold text-xs shrink-0">✓ HTTP 200</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Financial Protection Notice */}
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-900 leading-relaxed">
                <b>Financial Invariant:</b> Raw watcher data never directly alters active pricing or balance ledgers without operator review and approval.
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setVerificationModalOpen(false)}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2 text-xs font-black text-white shadow-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 2: SETUP RULES MANAGER MODAL (REQUIREMENT 16)                        */}
        {/* ========================================================================= */}
        {rulesModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-indigo-600" />
                  <div>
                    <h3 className="text-base font-black text-slate-950">AEPS Pricing &amp; Commission Rules Manager</h3>
                    <p className="text-xs text-slate-500">Configure customer fee and portal payout slabs per portal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRulesModalOpen(false);
                    setIsAddingRule(false);
                    setEditingRule(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Portal & Filter Selectors for Rules */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {initialPortals.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedRulesPortalId(p.id)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          selectedRulesPortalId === p.id
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Filter:</span>
                    <select
                      value={rulesTxnFilter}
                      onChange={(e) => setRulesTxnFilter(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="all">All Types</option>
                      <option value="cash_out">Cash Withdrawal</option>
                      <option value="balance_enquiry">Balance Enquiry</option>
                      <option value="mini_statement">Mini Statement</option>
                    </select>
                  </div>
                </div>

                {!isAddingRule && !editingRule && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingRule(true);
                      setEditingRule({
                        id: `rule-${selectedRulesPortalId}-${Date.now()}`,
                        serviceType: "aeps",
                        ruleType: "fee",
                        transactionType: "all",
                        portalId: selectedRulesPortalId,
                        minAmount: 100,
                        maxAmount: 5000,
                        value: 15,
                        priority: 10,
                        isActive: true,
                        effectiveFrom: new Date().toISOString().slice(0, 10),
                      });
                    }}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-black text-white shadow-sm transition-all"
                  >
                    ＋ Add New Rule
                  </button>
                )}
              </div>

              {/* Form: Add or Edit Rule */}
              {(isAddingRule || editingRule) && editingRule && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                    {isAddingRule ? "Add Pricing Rule" : "Edit Pricing Rule"}
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Rule Type</label>
                      <select
                        value={editingRule.ruleType}
                        onChange={(e) => setEditingRule({ ...editingRule, ruleType: e.target.value as "fee" | "commission" })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold"
                      >
                        <option value="fee">Customer Fee</option>
                        <option value="commission">Portal Commission</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Transaction Type</label>
                      <select
                        value={normalizeRuleTransactionType(editingRule.transactionType) || "all"}
                        onChange={(e) => setEditingRule({ ...editingRule, transactionType: e.target.value as any })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold"
                      >
                        <option value="all">All Types</option>
                        <option value="cash_out">Cash Withdrawal</option>
                        <option value="balance_enquiry">Balance Enquiry</option>
                        <option value="mini_statement">Mini Statement</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Min Amount (₹)</label>
                      <input
                        type="number"
                        value={editingRule.minAmount}
                        onChange={(e) => setEditingRule({ ...editingRule, minAmount: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Max Amount (₹)</label>
                      <input
                        type="number"
                        value={editingRule.maxAmount ?? ""}
                        onChange={(e) => setEditingRule({ ...editingRule, maxAmount: e.target.value ? Number(e.target.value) : null })}
                        placeholder="Unlimited (null)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Value (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingRule.value}
                        onChange={(e) => setEditingRule({ ...editingRule, value: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono font-black text-indigo-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Priority</label>
                      <input
                        type="number"
                        value={editingRule.priority}
                        onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-700 mb-1">Bank Applicability</label>
                      <select
                        value={editingRule.bankId || "all"}
                        onChange={(e) => setEditingRule({ ...editingRule, bankId: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold"
                      >
                        <option value="all">All Banks</option>
                        {bankOptions.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingRule(false);
                        setEditingRule(null);
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveRule(editingRule)}
                      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 text-xs font-black text-white shadow-sm"
                    >
                      Save Rule
                    </button>
                  </div>
                </div>
              )}

              {/* Rules Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Method</th>
                      <th className="px-3 py-2.5">Amount Slab</th>
                      <th className="px-3 py-2.5">Value (₹)</th>
                      <th className="px-3 py-2.5">Bank</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pricingRules
                      .filter((r) => {
                        if (r.portalId && r.portalId !== selectedRulesPortalId) return false;
                        if (r.transactionType === "payment_collection") return false;
                        if (rulesTxnFilter !== "all") {
                          const norm = normalizeRuleTransactionType(r.transactionType);
                          if (norm !== "all" && norm !== rulesTxnFilter) return false;
                        }
                        return true;
                      })
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                                r.ruleType === "fee" ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {r.ruleType}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {formatRuleTransactionType(r.transactionType)}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900">
                            ₹{r.minAmount} – {r.maxAmount ? `₹${r.maxAmount}` : "Unlimited"}
                          </td>
                          <td className="px-3 py-2 font-mono font-black text-slate-950">₹{r.value}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.bankId && r.bankId !== "all"
                              ? bankOptions.find((b) => b.id === r.bankId)?.name || "Bank"
                              : "All Banks"}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleToggleRule(r.id)}
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                r.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {r.isActive ? "Active" : "Disabled"}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const dup: AepsPricingRule = {
                                    ...r,
                                    id: `rule-${r.portalId || "gen"}-${Date.now()}`,
                                    transactionType: (normalizeRuleTransactionType(r.transactionType) as any) || "all",
                                    priority: (r.priority || 0) + 1,
                                  };
                                  setPricingRules((prev) => [dup, ...prev]);
                                  showToast("success", "Rule duplicated.");
                                }}
                                className="text-emerald-600 hover:underline font-bold"
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRule({
                                    ...r,
                                    transactionType: (normalizeRuleTransactionType(r.transactionType) as any) || "all",
                                  });
                                  setIsAddingRule(false);
                                }}
                                className="text-blue-600 hover:underline font-bold"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(r.id)}
                                className="text-rose-600 hover:underline font-bold"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* BANK MASTER — CREATE MISSING EXACT-MATCH BANK */}
        {bankCreateOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-950">Create Bank</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Add the bank to the CafeERP master so future exact matches can resolve automatically.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBankCreateOpen(false)}
                  disabled={bankCreateBusy}
                  className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {bankCreateReason && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
                  <b>Why this is shown:</b> {bankCreateReason}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">Bank Name *</label>
                  <input
                    autoFocus
                    value={bankCreateName}
                    onChange={(e) => setBankCreateName(e.target.value)}
                    placeholder="Enter exact bank name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-[9px] text-slate-400">Use the official bank name exactly as it should appear in the master.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">Bank Code (optional)</label>
                  <input
                    value={bankCreateCode}
                    onChange={(e) => setBankCreateCode(e.target.value)}
                    placeholder="Optional code, e.g. HDFC"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBankCreateOpen(false)}
                  disabled={bankCreateBusy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateBank}
                  disabled={bankCreateBusy || !bankCreateName.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bankCreateBusy ? "Creating..." : "Create Bank"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* REVIEW-BEFORE-RECORD MODAL DIALOG */}
        {reviewOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  <h3 className="text-base font-black text-slate-950">Review AEPS Transaction</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Customer</span>
                  <span className="font-bold text-slate-900">{name || selectedCustomer?.name || "Walk-in Customer"}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Mobile</span>
                  <span className="font-mono font-bold text-slate-900">{cleanMobile}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Aadhaar Last 4</span>
                  <span className="font-mono font-bold text-blue-600">•••• {cleanAadhaar}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Transaction Type</span>
                  <span className="font-bold text-slate-900 capitalize">
                    {transactionType === "cash_out" ? "Cash Withdrawal" : transactionType.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Bank</span>
                  <span className="font-semibold text-slate-800">{bankName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Portal</span>
                  <span className="font-semibold text-slate-800">{portalName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Amount</span>
                  <span className="font-mono font-black text-sm text-slate-900">{inr(Number(amount || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Fee Collection Mode</span>
                  <span className="font-bold text-slate-900">
                    {feeSource === "cut_from_withdrawal"
                      ? "Cut from Withdrawal"
                      : feeSource === "separate_cash"
                      ? "Collect Separately (Cash)"
                      : "Collect Separately in QR"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Customer Fee Paid</span>
                  <span className="font-mono font-bold text-indigo-600">{inr(Number(fee || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Customer Receives</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {inr(
                      feeSource === "cut_from_withdrawal"
                        ? Math.max(0, Number(amount || 0) - Number(fee || 0))
                        : Number(amount || 0)
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Portal Commission</span>
                  <span className="font-mono font-bold text-emerald-600">+{inr(Number(commission || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">AEPS Balance Impact</span>
                  <span className="font-mono font-bold text-emerald-700">
                    +{inr(Number(commission || 0))} (Commission)
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Cash Till Impact</span>
                  <span
                    className={`font-mono font-bold ${
                      transactionType === "cash_out" ? "text-rose-600" : "text-slate-600"
                    }`}
                  >
                    {transactionType === "cash_out"
                      ? feeSource === "cut_from_withdrawal"
                        ? `-${inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))} (Net Out)`
                        : feeSource === "separate_cash"
                        ? `-${inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))} (Out ${inr(Number(amount || 0))}, In ${inr(Number(fee || 0))})`
                        : `-${inr(Number(amount || 0))} (Till Out; QR: +${inr(Number(fee || 0))})`
                      : "₹0.00"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 block">References</span>
                  <span className="font-mono text-slate-600 text-[11px]">
                    RRN: {bankRef || "—"} | Portal: {portalRef || "—"}
                  </span>
                </div>

                {transactionType === "payment_collection" && (
                  <div className="col-span-2 rounded-lg bg-indigo-50 border border-indigo-200 p-2.5 text-xs text-indigo-900 flex items-center justify-between">
                    <div>
                      <span className="font-black block">Direction: IN (Customer → Shop/Business)</span>
                      <span className="text-[10px] text-indigo-700">Method: {collectionMethod.toUpperCase()} · Zero physical cash dispensed</span>
                    </div>
                    <span className="rounded bg-indigo-200 text-indigo-800 font-bold px-2 py-0.5 text-[10px]">
                      Aadhaar Pay
                    </span>
                  </div>
                )}
                {transactionType === "cash_out" && (
                  <div className="col-span-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 flex items-center justify-between">
                    <div>
                      <span className="font-black block">Direction: Cash Withdrawal (Shop/Business → Customer)</span>
                      <span className="text-[10px] text-amber-700">
                        {feeSource === "cut_from_withdrawal"
                          ? `Dispense ${inr(Math.max(0, Number(amount || 0) - Number(fee || 0)))} net physical cash from till`
                          : feeSource === "separate_cash"
                          ? `Dispense ${inr(Number(amount || 0))} physical cash; collect ${inr(Number(fee || 0))} fee in cash`
                          : `Dispense ${inr(Number(amount || 0))} physical cash; fee ${inr(Number(fee || 0))} received via QR (zero till increase)`}
                      </span>
                    </div>
                    <span className="rounded bg-amber-200 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                      Cash Withdrawal
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={recordTransaction}
                  disabled={!isFormValid || busy}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {busy ? "Processing…" : "Approve & Record"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 4: EDIT SOURCE URL MODAL                                            */}
        {/* ========================================================================= */}
        {editSourceModalOpen && editingSource && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-blue-600" />
                  <div>
                    <h3 className="text-base font-black text-slate-950">Edit Portal Source URL</h3>
                    <p className="text-xs text-slate-500">Update configuration for source ID: <code className="font-mono text-[11px] font-bold text-slate-700">{editingSource.id}</code></p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditSourceModalOpen(false);
                    setEditingSource(null);
                    setEditSourceError(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {editSourceError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  {editSourceError}
                </div>
              )}

              <div className="space-y-3.5 text-xs">
                {/* Portal Selection */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">
                    Portal
                  </label>
                  <select
                    value={editSourcePortalId}
                    onChange={(e) => setEditSourcePortalId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800"
                  >
                    {initialPortals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source Purpose */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">
                    Source Purpose
                  </label>
                  <select
                    value={editSourcePurpose}
                    onChange={(e) => setEditSourcePurpose(e.target.value as PortalSourcePurpose)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800"
                  >
                    {VALID_PORTAL_PURPOSES.map((purp) => (
                      <option key={purp} value={purp}>
                        {PURPOSE_LABELS[purp]?.label || purp}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {PURPOSE_LABELS[editSourcePurpose]?.description}
                  </p>
                </div>

                {/* Source URL */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">
                    Source URL
                  </label>
                  <input
                    type="url"
                    value={editSourceUrl}
                    onChange={(e) => {
                      setEditSourceUrl(e.target.value);
                      if (editSourceError) setEditSourceError(null);
                    }}
                    placeholder="https://portal.example.com/rates"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Only public http:// and https:// URLs allowed. Changing URL resets verification status to require fresh collection.
                  </p>
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <div>
                    <span className="font-bold text-slate-800 block text-xs">Monitoring Status</span>
                    <span className="text-[10px] text-slate-500">
                      Enable automated multi-URL watcher polling and data collection
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editSourceEnabled}
                      onChange={(e) => setEditSourceEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* Description / Notes */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1">
                    Description / Operational Notes <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={editSourceDescription}
                    onChange={(e) => setEditSourceDescription(e.target.value)}
                    placeholder="e.g. Primary payout notice page from distributor portal"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditSourceModalOpen(false);
                    setEditingSource(null);
                    setEditSourceError(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditSource}
                  disabled={isSavingEditSource}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isSavingEditSource ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL 5: DELETE / ARCHIVE SOURCE CONFIRMATION MODAL                       */}
        {/* ========================================================================= */}
        {deleteSourceModalOpen && deletingSource && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 text-slate-900 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 text-lg font-black">
                  ⚠
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-950">Delete Portal Source URL</h3>
                  <p className="text-xs text-slate-500">Archive this monitoring source from active collections</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Portal:</span>
                  <span className="font-black text-slate-800">{deletingSource.portalName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Purpose:</span>
                  <span className="font-bold text-indigo-700">{PURPOSE_LABELS[deletingSource.purpose]?.label || deletingSource.purpose}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block mb-0.5">Source URL:</span>
                  <p className="font-mono text-[11px] text-slate-700 break-all bg-white p-2 rounded-lg border border-slate-200">
                    {deletingSource.url}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900 leading-relaxed">
                <strong>Archive Safeguard:</strong> This URL will be soft-deleted and immediately excluded from future watcher collections. Historical observations, rate history, and audit records will remain intact.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteSourceModalOpen(false);
                    setDeletingSource(null);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSource}
                  disabled={isDeletingSource}
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 px-5 py-2 text-xs font-black text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isDeletingSource ? "Deleting…" : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCAN / FILL MODAL */}
        <ScanFillModal
          open={scanModalOpen}
          mode="aeps"
          title="Scan &amp; Auto-Fill AEPS Transaction"
          onClose={() => setScanModalOpen(false)}
          onApply={handleApplyExtractedSource}
        />

      </div>
    </div>
  );
}
