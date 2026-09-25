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
  getDefaultWatcherSources,
  PURPOSE_LABELS,
  type PortalWatcherSource,
  type PortalChangeRecord,
  type PortalSourcePurpose,
} from "@/lib/aeps/portal-watcher";
import type { CustomerRow, Master, Txn } from "./business-client";

// Normalization dictionary for common Indian banks
const BANK_ALIASES: Record<string, string> = {
  sbi: "state bank of india",
  "state bank": "state bank of india",
  "sbi bank": "state bank of india",
  pnb: "punjab national bank",
  "punjab national": "punjab national bank",
  bob: "bank of baroda",
  "baroda bank": "bank of baroda",
  boi: "bank of india",
  cbi: "central bank of india",
  ubi: "union bank of india",
  "union bank": "union bank of india",
  iob: "indian overseas bank",
  hdfc: "hdfc bank",
  icici: "icici bank",
  axis: "axis bank",
  kotak: "kotak mahindra bank",
  bandhan: "bandhan bank",
  canara: "canara bank",
  idbi: "idbi bank",
  uco: "uco bank",
  "indian bank": "indian bank",
};

export const TOP_INDIAN_BANKS = [
  { code: "SBI", label: "SBI", match: ["sbi", "state bank of india"] },
  { code: "PNB", label: "PNB", match: ["pnb", "punjab national bank"] },
  { code: "BOB", label: "BoB", match: ["bob", "bank of baroda"] },
  { code: "CANARA", label: "Canara", match: ["canara", "canara bank"] },
  { code: "UBI", label: "UBI", match: ["ubi", "union bank"] },
  { code: "HDFC", label: "HDFC", match: ["hdfc"] },
  { code: "ICICI", label: "ICICI", match: ["icici"] },
  { code: "AXIS", label: "Axis", match: ["axis"] },
  { code: "KOTAK", label: "Kotak", match: ["kotak"] },
  { code: "INDIAN", label: "Indian", match: ["indian bank"] },
];

export function normalizeBankName(raw: string): string {
  let s = (raw || "").toLowerCase().trim();
  s = s.replace(/[,.\\/#!$%^&*;:{}=\\-_~()]/g, " ");
  s = s.replace(/\b(ltd|limited|bank|the|india|branch)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (BANK_ALIASES[s]) return BANK_ALIASES[s];
  return s;
}

export function matchBank(inputName: string, bankList: Master[]): Master | null {
  if (!inputName || !inputName.trim()) return null;
  const normInput = normalizeBankName(inputName);
  if (!normInput) return null;

  for (const b of bankList) {
    if (!b.name) continue;
    const normB = normalizeBankName(b.name);
    if (normB === normInput) return b;
    if (normB.includes(normInput) || normInput.includes(normB)) {
      if (normInput.length >= 3 && normB.length >= 3) return b;
    }
  }

  for (const b of bankList) {
    if (b.code && b.code.toLowerCase().trim() === inputName.toLowerCase().trim()) {
      return b;
    }
  }

  return null;
}

/** Privacy-safe mobile masker: e.g. 9876543210 -> 98••••••10 */
export function maskMobile(mobile: string | null | undefined): string {
  if (!mobile) return "";
  const clean = mobile.replace(/\D/g, "");
  if (clean.length === 10) {
    return `${clean.slice(0, 2)}••••••${clean.slice(-2)}`;
  }
  return clean;
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
  const [rows, setRows] = useState<Txn[]>(initialTransactions);
  const [activeTab, setActiveTab] = useState<"workspace" | "watcher" | "ledger">("workspace");

  // Filtering & Search
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Form Mode & State
  const [entryMode, setEntryMode] = useState<"manual" | "ai">("manual");
  const [transactionType, setTransactionType] = useState("cash_out");
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

  // Drafts
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Multi-Source Portal Watcher State
  const [watcherSources, setWatcherSources] = useState<PortalWatcherSource[]>(() =>
    getDefaultWatcherSources(initialPortals)
  );
  const [changeRecords, setChangeRecords] = useState<PortalChangeRecord[]>([]);
  const [selectedWatcherPortalId, setSelectedWatcherPortalId] = useState(initialPortals[0]?.id || "");
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [collectingSourceId, setCollectingSourceId] = useState<string | null>(null);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourcePurpose, setNewSourcePurpose] = useState<PortalSourcePurpose>("commission");

  const cleanAadhaar = aadhaar.replace(/\D/g, "");
  const cleanMobile = mobile.replace(/\D/g, "");

  const isFormValid = Boolean(
    bankId &&
    portalId &&
    cleanAadhaar.length === 4 &&
    cleanMobile.length === 10 &&
    (transactionType === "cash_out" ? Number(amount) > 0 : true) &&
    Number(fee || 0) >= 0 &&
    Number(commission || 0) >= 0
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);

    return rows.filter((t) => {
      const method = t.transfer_method || "cash_out";
      const haystack = [
        t.transaction_number,
        t.customer_mobile,
        t.customers?.name,
        t.banks?.name,
        t.portals?.name,
        t.reference,
        t.remarks,
        t.aadhaar_last4,
      ].filter(Boolean).join(" ").toLowerCase();

      // Date filtering
      if (dateFilter !== "all" && t.transaction_date) {
        const raw = String(t.transaction_date || "").slice(0, 10);
        if (dateFilter === "today" && raw !== todayKey) return false;
        if (dateFilter === "yesterday") {
          const d = new Date(today);
          d.setDate(d.getDate() - 1);
          if (raw !== d.toISOString().slice(0, 10)) return false;
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

      return (typeFilter === "all" || method === typeFilter)
        && (statusFilter === "all" || t.status === statusFilter)
        && (!q || haystack.includes(q));
    });
  }, [rows, query, dateFilter, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: filtered.length,
    amount: filtered.reduce((n, t) => n + Number(t.amount || 0), 0),
    fees: filtered.reduce((n, t) => n + Number(t.service_fee || 0), 0),
    commission: filtered.reduce((n, t) => n + Number(t.portal_commission || 0), 0),
    recorded: filtered.filter((t) => t.status === "success" || t.status === "recorded").length,
    review: filtered.filter((t) => ["pending", "review", "processing"].includes(t.status)).length,
    cancelled: filtered.filter((t) => t.status === "cancelled").length,
    reversed: filtered.filter((t) => t.status === "reversed").length,
  }), [filtered]);

  const aepsFloat = Number(float?.current ?? float?.balance ?? 0);
  const receiptQuery = (mode: "basic" | "detailed") =>
    mode === "detailed" ? "?mode=detailed" : "";
  const receiptMode: "basic" | "detailed" = "basic";
  const receiptUrl = (id: string) => "/business/receipt/" + id + receiptQuery(receiptMode);
  const invoiceUrl = (id: string) => "/business/receipt/" + id + "/a4" + receiptQuery(receiptMode);

  // Customer matching candidates
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

  const selectedCustomer = initialCustomers.find((c) => c.id === customerId) || candidates[0] || null;

  // Auto-fill customer if unique match found
  useEffect(() => {
    if (cleanMobile.length === 10 && !customerId) {
      const exactMatch = initialCustomers.find((c) => String(c.phone || "").replace(/\D/g, "") === cleanMobile);
      if (exactMatch) {
        setCustomerId(exactMatch.id);
        setName(exactMatch.name);
      }
    }
  }, [cleanMobile, customerId, initialCustomers]);

  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = initialCustomers.find((c) => c.id === id);
    if (customer) {
      setName(customer.name);
      setMobile(String(customer.phone || "").replace(/\D/g, "").slice(0, 10));
    }
  };

  const handleNewCashOut = useCallback(() => {
    setCustomerId("");
    setMobile("");
    setName("");
    setAadhaar("");
    setTransactionType("cash_out");
    setAmount("");
    setFee("");
    setCommission("");
    setBankId("");
    setPortalId(initialPortals[0]?.id || "");
    setBankRef("");
    setPortalRef("");
    setReviewOpen(false);
    setWorkspaceOpen(true);
  }, [initialPortals]);

  const selectBankByCode = (code: string) => {
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return;
    const matched = matchBank(top.label, initialBanks) || matchBank(top.code, initialBanks) || matchBank(top.match[0], initialBanks);
    if (matched) {
      setBankId(matched.id);
    }
  };

  const isBankChipActive = (code: string) => {
    if (!bankId) return false;
    const currentBank = initialBanks.find((b) => b.id === bankId);
    if (!currentBank) return false;
    const top = TOP_INDIAN_BANKS.find((b) => b.code === code);
    if (!top) return false;
    const norm = normalizeBankName(currentBank.name);
    return top.match.some((m) => norm.includes(m) || m.includes(norm)) || (currentBank.code && currentBank.code.toUpperCase() === code);
  };

  const handleDenominationClick = (val: number) => {
    setAmount(String(val));
    if (!fee) {
      if (val >= 500 && val < 1000) setFee("5");
      else if (val >= 1000 && val < 2000) setFee("10");
      else if (val >= 2000 && val < 3000) setFee("15");
      else if (val >= 3000 && val < 5000) setFee("20");
      else if (val >= 5000 && val < 10000) setFee("30");
      else if (val >= 10000) setFee("50");
    }
    if (!commission) {
      if (val >= 500 && val < 1000) setCommission("2");
      else if (val >= 1000 && val < 2000) setCommission("4");
      else if (val >= 2000 && val < 3000) setCommission("6");
      else if (val >= 3000 && val < 5000) setCommission("9");
      else if (val >= 5000 && val < 10000) setCommission("12");
      else if (val >= 10000) setCommission("15");
    }
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
    setMobile(d.mobile);
    setName(d.name);
    setAadhaar(d.aadhaar);
    setTransactionType(d.transactionType);
    setAmount(d.amount);
    setFee(d.fee);
    setCommission(d.commission);
    setBankId(d.bankId);
    setPortalId(d.portalId);
    setBankRef(d.bankRef);
    setPortalRef(d.portalRef);
    showToast("info", `Loaded draft saved at ${d.savedAt}`);
  };

  // Scan & Source Extraction
  const handleApplyExtractedSource = (fields: ScanFields) => {
    if (fields.amount) setAmount(fields.amount);
    if (fields.reference) setBankRef(fields.reference);
    if (fields.aadhaar_last4) setAadhaar(fields.aadhaar_last4);
    if (fields.customer_mobile) setMobile(fields.customer_mobile);
    if (fields.service_fee) setFee(fields.service_fee);
    if (fields.portal_commission) setCommission(fields.portal_commission);

    if (fields.bank_name) {
      const matched = matchBank(fields.bank_name, initialBanks);
      if (matched) setBankId(matched.id);
    }
    if (fields.portal_name) {
      const p = initialPortals.find(
        (x) => x.name.toLowerCase().includes(fields.portal_name.toLowerCase()) || fields.portal_name.toLowerCase().includes(x.name.toLowerCase())
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

  // Multi-Source Watcher Actions
  const currentPortalSources = useMemo(() => {
    return watcherSources.filter((s) => s.portalId === selectedWatcherPortalId);
  }, [watcherSources, selectedWatcherPortalId]);

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
        showToast("info", `Change detected from ${source.portalName} (${PURPOSE_LABELS[source.purpose].label}). Review required.`);
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

  const handleToggleWatcher = (sourceId: string) => {
    setWatcherSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, isEnabled: !s.isEnabled } : s))
    );
  };

  const handleApproveChange = (recordId: string) => {
    const rec = changeRecords.find((r) => r.id === recordId);
    if (!rec) return;

    // Update the source's published active value
    setWatcherSources((prev) =>
      prev.map((s) => {
        if (s.id === rec.sourceId) {
          return {
            ...s,
            lastStatus: "success",
            lastMessage: "Operator approved new baseline.",
            currentPublishedValue: {
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

    showToast("success", `Approved change from ${rec.portalName}. Published value updated.`);
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

  const handleAddSource = () => {
    if (!newSourceUrl.trim()) return;
    const targetPortal = initialPortals.find((p) => p.id === selectedWatcherPortalId);
    if (!targetPortal) return;

    const now = new Date().toISOString();
    const newSrc: PortalWatcherSource = {
      id: `src-${selectedWatcherPortalId}-${Date.now()}`,
      portalId: selectedWatcherPortalId,
      portalName: targetPortal.name,
      url: newSourceUrl.trim(),
      purpose: newSourcePurpose,
      isEnabled: true,
      lastChecked: null,
      lastStatus: "idle",
      lastMessage: "Newly added watcher source.",
      currentPublishedValue: {
        summary: "Pending first collection.",
        updatedAt: now,
      },
      createdAt: now,
    };

    setWatcherSources((prev) => [...prev, newSrc]);
    setNewSourceUrl("");
    showToast("success", `Added new ${PURPOSE_LABELS[newSourcePurpose].label} source for ${targetPortal.name}.`);
  };

  const handleExport = () => {
    downloadCsv(
      "aeps-transactions.csv",
      ["Transaction", "Date", "Customer", "Mobile", "Type", "Aadhaar", "Amount", "Fee", "Commission", "Bank", "Portal", "Bank Ref", "Portal Ref", "Status"],
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

  const recordTransaction = async () => {
    if (busy || !isFormValid) return;
    setBusy(true);
    try {
      const payload: any = {
        p_service_type: "aeps",
        p_transaction_date: new Date().toISOString().slice(0, 10),
        p_transaction_timestamp: new Date().toISOString(),
        p_customer_id: customerId || selectedCustomer?.id || null,
        p_customer_mobile: cleanMobile,
        p_reference: bankRef || null,
        p_remarks: portalRef ? "Portal Ref: " + portalRef : null,
        p_status: "success",
        p_bank_id: bankId,
        p_portal_id: portalId,
        p_merchant_qr_id: null,
        p_aadhaar_last4: cleanAadhaar,
        p_transfer_method: transactionType,
        p_amount: Number(amount || 0),
        p_service_fee: Number(fee || 0),
        p_portal_commission: Number(commission || 0),
        p_fee_source: "customer_paid_extra",
        p_paid_from: "portal",
        p_customer_pay_method: "cash",
        p_pay_from_instrument_id: null,
        p_pay_from_method: "aeps_portal",
        p_receiver_name: null,
      };

      const result = await supabase.rpc("create_business_txn", payload);
      if (result.error) throw result.error;

      setRows((prev) => [result.data as Txn, ...prev]);
      showToast("success", "AEPS transaction recorded successfully.");
      handleNewCashOut();
      setReviewOpen(false);
    } catch (error: any) {
      showToast("error", error?.message || "Failed to record AEPS transaction.");
    } finally {
      setBusy(false);
    }
  };

  const portalName = initialPortals.find((p) => p.id === portalId)?.name || "—";
  const bankName = initialBanks.find((b) => b.id === bankId)?.name || "—";

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
    const cashOutCount = rows.filter((t) => !t.transfer_method || t.transfer_method === "cash_out" || t.transfer_method === "withdrawal").length;
    const balanceCount = rows.filter((t) => t.transfer_method === "balance_enquiry" || t.transfer_method === "enquiry").length;
    const statementCount = rows.filter((t) => t.transfer_method === "mini_statement" || t.transfer_method === "statement").length;
    const total = rows.length || 1;
    return {
      cashOutCount,
      balanceCount,
      statementCount,
      cashOutPct: Math.round((cashOutCount / total) * 100),
      balancePct: Math.round((balanceCount / total) * 100),
      statementPct: Math.round((statementCount / total) * 100),
    };
  }, [rows]);

  const pendingReviewCount = changeRecords.filter((r) => r.status === "pending").length;

  return (
    <div className="aeps-modern-light min-h-full bg-[#f6f9fd] text-slate-900 transition-colors">
      <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-4 lg:px-6 lg:pt-5 space-y-4">

        {/* HEADER */}
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Business Services / AEPS</div>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xl font-black text-white shadow-sm">
                AePS
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-950">AEPS Transactions</h1>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE WATCHER READY
                  </span>
                  {pendingReviewCount > 0 && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700 animate-bounce">
                      {pendingReviewCount} Watcher Change(s) Review Required
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">Monitor, review and record Aadhaar Enabled Payment System transactions</p>
              </div>
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
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black shadow-sm">{icon}</div>
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
                activeTab === "workspace"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>⚡</span> Counter Workspace (Full-Width)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("watcher")}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "watcher"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
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
                activeTab === "ledger"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
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
              <button type="button" onClick={() => setInsightsOpen(false)} className="text-xs text-violet-600 font-bold">Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3 text-xs pt-1">
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Audit Status</span>
                <p className="font-semibold text-slate-800">{stats.review > 0 ? `${stats.review} transaction(s) pending operator review.` : "All transactions reconciled successfully."}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Fee Integrity</span>
                <p className="font-semibold text-slate-800">{stats.fees > 0 ? `Total customer fees collected: ${inr(stats.fees)}.` : "Zero customer fees recorded in this dataset."}</p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-violet-100">
                <span className="font-bold text-slate-500 block mb-1">Operator Yield</span>
                <p className="font-semibold text-slate-800">{stats.amount > 0 ? `Net margin is ${((stats.commission / (stats.amount || 1)) * 100).toFixed(2)}% of volume.` : "No transaction volume loaded."}</p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: FULL-WIDTH OPERATOR TRANSACTION WORKSPACE                         */}
        {/* ========================================================================= */}
        {activeTab === "workspace" && workspaceOpen && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:p-6 shadow-md space-y-6">

            {/* WORKSPACE HEADER BAR WITH PRIMARY MODE SWITCH */}
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
                  High-speed desktop terminal organized into Customer, Transaction, and Pricing/Review
                </p>
              </div>

              {/* PRIMARY MODE SWITCH: MANUAL ENTRY vs AI AUTO-FILL */}
              <div className="flex items-center gap-2">
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
                          {activeSources.map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-slate-600">
                              <span className="font-medium">{PURPOSE_LABELS[s.purpose].label}:</span>
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
                  <span className="text-[10px] font-bold text-slate-400">KYC &amp; Contact</span>
                </div>

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
                  <p className="mt-1 text-[9px] text-slate-400">Resolved locally; portal never overrides name</p>
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
                  <p className="mt-1 text-[9px] text-slate-400">Stored for audit and verification only</p>
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
                          onClick={() => selectCustomer(c.id)}
                          className={`w-full rounded-xl p-2 text-left text-xs transition-all border ${
                            customerId === c.id
                              ? "bg-blue-50 border-blue-300 text-blue-900"
                              : "bg-white border-slate-200 hover:bg-slate-100 text-slate-800"
                          }`}
                        >
                          <div className="font-bold">{c.name}</div>
                          <div className="text-[10px] text-slate-500">{c.phone || "No phone"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ----------------------------------------------------------------- */}
              {/* COLUMN 2: TRANSACTION                                             */}
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

                {/* Transaction Type */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Transaction Type *
                  </label>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500"
                  >
                    <option value="cash_out">Cash Out (Biometric Withdrawal)</option>
                    <option value="balance_enquiry">Balance Enquiry</option>
                    <option value="mini_statement">Mini Statement</option>
                  </select>
                </div>

                {/* 1-Click Top Indian Bank Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-slate-700">Bank *</label>
                    <span className="text-[9px] text-blue-600 font-bold">1-Click Top Banks</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mb-2">
                    {TOP_INDIAN_BANKS.map((b) => {
                      const active = isBankChipActive(b.code);
                      return (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => selectBankByCode(b.code)}
                          className={`rounded-lg py-1.5 text-[9px] font-bold transition-all text-center border ${
                            active
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>

                  <select
                    value={bankId}
                    onChange={(e) => setBankId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500"
                  >
                    <option value="">Select bank...</option>
                    {initialBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Registered Portal Selection */}
                <div>
                  <label className="block text-[10px] font-black text-slate-700 mb-1">
                    Portal *
                  </label>
                  <select
                    value={portalId}
                    onChange={(e) => setPortalId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500"
                  >
                    <option value="">Select portal...</option>
                    {initialPortals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* References */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Bank Ref (RRN)</label>
                    <input
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder="Optional RRN"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-600 mb-0.5">Portal Ref</label>
                    <input
                      value={portalRef}
                      onChange={(e) => setPortalRef(e.target.value)}
                      placeholder="Optional Ref"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 font-mono"
                    />
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
                  <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[9px] font-black">
                    Live Calculation
                  </span>
                </div>

                {/* Amount (₹) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-700">Amount (₹) *</label>
                    <span className="text-[9px] text-slate-400 font-medium">Tactile Presets</span>
                  </div>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    disabled={transactionType !== "cash_out"}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-lg font-black font-mono text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors mb-2 disabled:opacity-50"
                  />
                  {transactionType === "cash_out" && (
                    <div className="grid grid-cols-6 gap-1">
                      {[500, 1000, 2000, 3000, 5000, 10000].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleDenominationClick(d)}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-emerald-600 hover:text-white hover:border-emerald-600 py-1.5 text-[9px] font-bold text-slate-700 transition-all text-center"
                        >
                          {d >= 1000 ? `${d / 1000}k` : d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Fee & Portal Commission Inputs */}
                <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[9px] font-black text-indigo-700 mb-0.5">Customer Fee (₹)</label>
                    <input
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-700 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-emerald-700 mb-0.5">Portal Commission (₹)</label>
                    <input
                      value={commission}
                      onChange={(e) => setCommission(e.target.value)}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-700 outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                {/* CLEAR REVIEW FIRST BEHAVIOR: LIVE SETTLEMENT PREVIEW CARD */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Live Settlement Impact:
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">
                      Yield: +{inr(Number(fee || 0) + Number(commission || 0))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block">Cash Disbursed</span>
                      <span className="font-bold text-slate-900 font-mono">{inr(Number(amount || 0))}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Float Increment</span>
                      <span className="font-bold text-emerald-700 font-mono">
                        +{inr(Number(amount || 0) + Number(commission || 0))}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 p-2 text-[10px] space-y-0.5 text-slate-600">
                    <div className="flex justify-between">
                      <span>Customer:</span>
                      <b className="text-slate-900">{name || selectedCustomer?.name || "Walk-in"}</b>
                    </div>
                    <div className="flex justify-between">
                      <span>Bank:</span>
                      <b className="text-slate-900">{bankName}</b>
                    </div>
                    <div className="flex justify-between">
                      <span>Portal:</span>
                      <b className="text-slate-900">{portalName}</b>
                    </div>
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
                const count = watcherSources.filter((s) => s.portalId === p.id).length;
                const active = selectedWatcherPortalId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedWatcherPortalId(p.id)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                      active
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${active ? "bg-white/20 text-white" : "bg-white text-slate-700"}`}>
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
                          <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold ${PURPOSE_LABELS[chg.purpose].badgeColor}`}>
                            {PURPOSE_LABELS[chg.purpose].label}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">{fmtTime(chg.extractedAt)}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono">
                          Source URL: <a href={chg.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{chg.sourceUrl}</a>
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
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            chg.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
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
                  Configured Sources for {initialPortals.find((p) => p.id === selectedWatcherPortalId)?.name || "Portal"}
                </h3>
                <span className="text-xs text-slate-400">Processed independently</span>
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
                {currentPortalSources.map((source) => {
                  const purposeMeta = PURPOSE_LABELS[source.purpose];
                  const isTesting = testingSourceId === source.id;
                  const isCollecting = collectingSourceId === source.id;

                  return (
                    <div key={source.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${purposeMeta.badgeColor}`}>
                            {purposeMeta.label}
                          </span>
                          <span className="font-mono text-xs font-bold text-slate-900 truncate max-w-[400px]">
                            {source.url}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                            source.isEnabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {source.isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-500 leading-snug">
                          {purposeMeta.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                          <span>
                            Last Checked: <b>{source.lastChecked ? fmtDate(source.lastChecked) + " " + fmtTime(source.lastChecked) : "Never"}</b>
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
                      <div className="flex items-center gap-2 self-end md:self-center">
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
                          onClick={() => handleToggleWatcher(source.id)}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                            source.isEnabled
                              ? "border-slate-200 text-slate-600 hover:bg-slate-100"
                              : "border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                        >
                          {source.isEnabled ? "Disable" : "Enable"}
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
                    <option value="commission">Commission</option>
                    <option value="fee">Fee</option>
                    <option value="aeps_rules">AEPS Rules</option>
                    <option value="provider_bank_info">Provider/Bank Information</option>
                    <option value="general_updates">General Updates</option>
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
        {/* VIEW 3: TRANSACTION LEDGER & ANALYTICS                                    */}
        {/* ========================================================================= */}
        <div className="space-y-4">

          {/* ANALYTICS SECTION */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Card 1: Transaction Trend */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Transaction Trend</h2>
                  <p className="text-[10px] text-slate-400">Recent AEPS activity</p>
                </div>
                <span className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold text-slate-500">Last 7 periods</span>
              </div>

              {trendData.hasActivity ? (
                <div className="flex h-28 items-end gap-2 pt-2">
                  {trendData.days.map((day) => {
                    const heightPct = Math.max(12, Math.round((day.count / trendData.maxCount) * 100));
                    return (
                      <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">{day.count}</span>
                        <div
                          className="w-full rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-all"
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="text-[9px] font-semibold text-slate-400 uppercase">{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-28 items-center justify-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-400 font-medium">
                  No AEPS activity yet in the last 7 days
                </div>
              )}
            </div>

            {/* Card 2: Transactions by Type */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm font-black text-slate-950">Transactions by Type</h2>
                  <p className="text-[10px] text-slate-400">Distribution across AEPS operations</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{rows.length} Total</span>
              </div>

              <div className="my-2 flex justify-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 p-2 shadow-inner">
                  <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-center shadow-sm">
                    <div>
                      <div className="text-sm font-black text-slate-950">{rows.length}</div>
                      <div className="text-[7px] text-slate-400 uppercase">Txns</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  ["Cash Out", typeDistribution.cashOutCount, "bg-blue-500", typeDistribution.cashOutPct],
                  ["Balance Enquiry", typeDistribution.balanceCount, "bg-emerald-500", typeDistribution.balancePct],
                  ["Mini Statement", typeDistribution.statementCount, "bg-amber-500", typeDistribution.statementPct],
                ].map(([label, count, bar, pct]) => (
                  <div key={String(label)}>
                    <div className="mb-0.5 flex justify-between text-[10px]">
                      <span className="font-semibold text-slate-600">{label}</span>
                      <b className="text-slate-900">{count} ({pct}%)</b>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Number(pct) || 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="this_month">This Month</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Types</option>
                <option value="cash_out">Cash Out</option>
                <option value="balance_enquiry">Balance Enquiry</option>
                <option value="mini_statement">Mini Statement</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="review">Review</option>
                <option value="cancelled">Cancelled</option>
                <option value="reversed">Reversed</option>
              </select>

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by customer, mobile, Aadhaar, bank or portal reference..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* AEPS TRANSACTION LEDGER TABLE */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-950">AEPS Transactions</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Showing {filtered.length} filtered records</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1300px] text-left text-[11px]">
                <thead className="bg-slate-50 font-black uppercase text-slate-400 tracking-wider text-[10px] border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Date &amp; Time</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Mobile</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Aadhaar</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-3 py-3">Customer Fee</th>
                    <th className="px-3 py-3">Portal Commission</th>
                    <th className="px-3 py-3">Bank</th>
                    <th className="px-3 py-3">Portal</th>
                    <th className="px-3 py-3">Bank Reference</th>
                    <th className="px-3 py-3">Portal Reference</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3.5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 font-mono font-bold text-blue-600">{t.transaction_number}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {fmtDate(t.transaction_date)} <span className="text-slate-400 text-[10px]">{fmtTime((t as any).transaction_timestamp)}</span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-950">{t.customers?.name || "—"}</td>
                      <td className="px-3 py-3 font-mono text-slate-500">{maskMobile(t.customer_mobile || t.customers?.phone) || "—"}</td>
                      <td className="px-3 py-3 capitalize">{t.transfer_method?.replace(/_/g, " ") || "Cash Out"}</td>
                      <td className="px-3 py-3 font-mono">•••• {t.aadhaar_last4 || "—"}</td>
                      <td className="px-3 py-3 font-bold text-slate-950">{inr(Number(t.amount || 0))}</td>
                      <td className="px-3 py-3 font-medium text-indigo-600">{inr(Number(t.service_fee || 0))}</td>
                      <td className="px-3 py-3 font-medium text-emerald-600">{inr(Number(t.portal_commission || 0))}</td>
                      <td className="px-3 py-3">{t.banks?.name || "—"}</td>
                      <td className="px-3 py-3">{t.portals?.name || "—"}</td>
                      <td className="px-3 py-3 font-mono text-slate-500">{t.reference || "—"}</td>
                      <td className="px-3 py-3 font-mono text-slate-500">{t.remarks?.replace(/^Portal Ref:\s*/i, "") || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === "success" || t.status === "recorded"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : ["pending", "review", "processing"].includes(t.status)
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : t.status === "cancelled"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-purple-50 text-purple-700 border border-purple-200"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <Link
                            href={receiptUrl(t.id)}
                            target="_blank"
                            className="font-bold text-[10px] px-2 py-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors"
                          >
                            80mm
                          </Link>
                          <Link
                            href={invoiceUrl(t.id)}
                            target="_blank"
                            className="font-bold text-[10px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                          >
                            A4
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={15} className="px-4 py-12 text-center text-xs text-slate-400">
                        No AEPS transactions match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* IMPORTANT NOTES FOOTER CARD */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <p className="font-black text-xs uppercase tracking-wider text-violet-900 flex items-center gap-2">
                <span>✦</span> AI Insights
              </p>
              <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                {stats.total} real AEPS records loaded · {inr(stats.commission)} portal commission · {stats.review} requiring review.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <p className="font-black text-xs uppercase tracking-wider text-amber-900 flex items-center gap-2">
                <span>ⓘ</span> Important Notes
              </p>
              <p className="mt-2 text-xs text-slate-700 leading-relaxed">
                Only Aadhaar last 4 is stored. Customer name is resolved from CafeERP data; the portal is never treated as a source of customer name.
              </p>
            </div>
          </div>
        </div>

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
                  <span className="font-bold text-slate-900 capitalize">{transactionType.replace(/_/g, " ")}</span>
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
                  <span className="text-[10px] font-bold text-slate-400 block">Customer Fee</span>
                  <span className="font-mono font-bold text-indigo-600">{inr(Number(fee || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">Portal Commission</span>
                  <span className="font-mono font-bold text-emerald-600">{inr(Number(commission || 0))}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block">References</span>
                  <span className="font-mono text-slate-600 text-[11px]">
                    RRN: {bankRef || "—"} | Portal: {portalRef || "—"}
                  </span>
                </div>
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
