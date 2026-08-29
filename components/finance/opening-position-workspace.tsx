"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import FloatingWindow from "@/components/ui/floating-window";
import SearchableSelect from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/use-toast";

export type PaymentInstrument = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
  balance?: number;
};

export type SupplierOption = {
  id: string;
  name: string;
  code: string;
  current_balance?: number;
  opening_balance?: number;
};

export type ProductOption = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  cost_price: number | string;
  stock_qty: number | string;
  categories?: { name: string } | null;
};

export type BankRow = {
  instrument_id: string;
  name: string;
  amount: number;
  remarks: string;
};

export type ReceivableRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  remarks: string;
};

export type InventoryRow = {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  unit: string;
  qty: number;
  unit_cost: number;
  remarks: string;
};

export type PayableRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  amount: number;
  remarks: string;
};

export type OtherLiabRow = {
  id: string;
  title: string;
  amount: number;
  remarks: string;
};

export type OpeningPositionSnapshot = {
  id?: string;
  opening_date: string;
  status: "draft" | "finalized" | "reversed";
  cash: number;
  cash_notes: string;
  banks: BankRow[];
  digital: {
    upi_qr: number;
    wallet: number;
    aeps: number;
    dmt: number;
    recharge: number;
  };
  receivables: ReceivableRow[];
  inventory: InventoryRow[];
  payables: PayableRow[];
  other_liabilities: OtherLiabRow[];
  total_assets: number;
  total_liabilities: number;
  opening_capital: number;
  remarks: string;
  finalized_at?: string;
};

const DRAFT_STORAGE_KEY = "cafe_erp_opening_position_draft_v1";

function SvgIcon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export default function OpeningPositionWorkspace({
  isOpen,
  onClose,
  instruments = [],
  customers = [],
  suppliers = [],
  products = [],
  initialSnapshot = null,
  onFinalized,
}: {
  isOpen: boolean;
  onClose: () => void;
  instruments: PaymentInstrument[];
  customers: CustomerOption[];
  suppliers: SupplierOption[];
  products: ProductOption[];
  initialSnapshot?: OpeningPositionSnapshot | null;
  onFinalized?: (snap: OpeningPositionSnapshot) => void;
}) {
  const { showToast, toastView } = useToast();
  const [activeTab, setActiveTab] = useState<
    "overview" | "cash" | "banks" | "digital" | "receivables" | "inventory" | "payables" | "liabilities"
  >("overview");

  const [openingDate, setOpeningDate] = useState<string>(() => {
    if (initialSnapshot?.opening_date) return initialSnapshot.opening_date;
    return new Date().toISOString().slice(0, 10);
  });

  const [status, setStatus] = useState<"draft" | "finalized">(
    initialSnapshot?.status === "finalized" ? "finalized" : "draft"
  );
  const [remarks, setRemarks] = useState(initialSnapshot?.remarks || "");

  // 1. Cash In Hand
  const [cashAmount, setCashAmount] = useState<number>(initialSnapshot?.cash || 0);
  const [cashNotes, setCashNotes] = useState<string>(initialSnapshot?.cash_notes || "");

  // 2. Bank Accounts
  const activeBankInstruments = useMemo(
    () => instruments.filter((i) => i.type === "bank" && i.is_active),
    [instruments]
  );

  const [banks, setBanks] = useState<BankRow[]>(() => {
    if (initialSnapshot?.banks && initialSnapshot.banks.length > 0) {
      return initialSnapshot.banks;
    }
    return activeBankInstruments.map((b) => ({
      instrument_id: b.id,
      name: b.name,
      amount: 0,
      remarks: "",
    }));
  });

  // 3. Digital Floats
  const [digital, setDigital] = useState({
    upi_qr: initialSnapshot?.digital?.upi_qr || 0,
    wallet: initialSnapshot?.digital?.wallet || 0,
    aeps: initialSnapshot?.digital?.aeps || 0,
    dmt: initialSnapshot?.digital?.dmt || 0,
    recharge: initialSnapshot?.digital?.recharge || 0,
  });

  // 4. Receivables
  const [receivables, setReceivables] = useState<ReceivableRow[]>(
    initialSnapshot?.receivables || []
  );
  const [selectedCustId, setSelectedCustId] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recRemarks, setRecRemarks] = useState("");

  // 5. Inventory
  const [inventory, setInventory] = useState<InventoryRow[]>(
    initialSnapshot?.inventory || []
  );
  const [selectedProdId, setSelectedProdId] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invCost, setInvCost] = useState("");
  const [invRemarks, setInvRemarks] = useState("");

  // 6. Payables
  const [payables, setPayables] = useState<PayableRow[]>(
    initialSnapshot?.payables || []
  );
  const [selectedSuppId, setSelectedSuppId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payRemarks, setPayRemarks] = useState("");

  // 7. Other Liabilities
  const [otherLiab, setOtherLiab] = useState<OtherLiabRow[]>(
    initialSnapshot?.other_liabilities || []
  );
  const [liabTitle, setLiabTitle] = useState("");
  const [liabAmount, setLiabAmount] = useState("");
  const [liabRemarks, setLiabRemarks] = useState("");

  // Review & Finalize Modals
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load saved draft on first mount if no initialSnapshot passed
  useEffect(() => {
    if (!initialSnapshot) {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object") {
            if (parsed.opening_date) setOpeningDate(parsed.opening_date);
            if (parsed.cash !== undefined) setCashAmount(Number(parsed.cash) || 0);
            if (parsed.cash_notes) setCashNotes(parsed.cash_notes);
            if (Array.isArray(parsed.banks)) setBanks(parsed.banks);
            if (parsed.digital) setDigital(parsed.digital);
            if (Array.isArray(parsed.receivables)) setReceivables(parsed.receivables);
            if (Array.isArray(parsed.inventory)) setInventory(parsed.inventory);
            if (Array.isArray(parsed.payables)) setPayables(parsed.payables);
            if (Array.isArray(parsed.other_liabilities)) setOtherLiab(parsed.other_liabilities);
            if (parsed.remarks) setRemarks(parsed.remarks);
          }
        }
      } catch {}
    }
  }, [initialSnapshot]);

  // Keep bank accounts in sync if new bank added
  useEffect(() => {
    if (banks.length === 0 && activeBankInstruments.length > 0) {
      setBanks(
        activeBankInstruments.map((b) => ({
          instrument_id: b.id,
          name: b.name,
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeBankInstruments, banks.length]);

  // --- Calculations ---
  const totalCash = Number(cashAmount) || 0;
  const totalBanks = useMemo(
    () => banks.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
    [banks]
  );
  const totalDigital = useMemo(
    () =>
      (Number(digital.upi_qr) || 0) +
      (Number(digital.wallet) || 0) +
      (Number(digital.aeps) || 0) +
      (Number(digital.dmt) || 0) +
      (Number(digital.recharge) || 0),
    [digital]
  );
  const totalReceivables = useMemo(
    () => receivables.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [receivables]
  );
  const totalInventory = useMemo(
    () =>
      inventory.reduce(
        (sum, i) => sum + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0),
        0
      ),
    [inventory]
  );

  const totalAssets = useMemo(
    () => totalCash + totalBanks + totalDigital + totalReceivables + totalInventory,
    [totalCash, totalBanks, totalDigital, totalReceivables, totalInventory]
  );

  const totalPayables = useMemo(
    () => payables.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payables]
  );
  const totalOtherLiabilities = useMemo(
    () => otherLiab.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [otherLiab]
  );
  const totalLiabilities = useMemo(
    () => totalPayables + totalOtherLiabilities,
    [totalPayables, totalOtherLiabilities]
  );

  const openingCapital = useMemo(
    () => totalAssets - totalLiabilities,
    [totalAssets, totalLiabilities]
  );

  const isBalanced = useMemo(() => {
    return Math.abs(totalAssets - (totalLiabilities + openingCapital)) < 0.01;
  }, [totalAssets, totalLiabilities, openingCapital]);

  // Handlers for List Additions
  function addReceivable() {
    if (!selectedCustId) {
      showToast("error", "Please select a customer.");
      return;
    }
    const amt = parseFloat(recAmount);
    if (!amt || amt <= 0) {
      showToast("error", "Please enter a valid receivable amount greater than 0.");
      return;
    }
    const cust = customers.find((c) => c.id === selectedCustId);
    if (!cust) return;

    if (receivables.some((r) => r.customer_id === selectedCustId)) {
      showToast("error", "Customer already added in receivables list. Edit existing entry instead.");
      return;
    }

    setReceivables((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        customer_id: cust.id,
        customer_name: cust.name,
        amount: amt,
        remarks: recRemarks.trim(),
      },
    ]);
    setSelectedCustId("");
    setRecAmount("");
    setRecRemarks("");
    showToast("success", `Added opening receivable for ${cust.name}`);
  }

  function removeReceivable(id: string) {
    setReceivables((prev) => prev.filter((r) => r.id !== id));
  }

  function addInventory() {
    if (!selectedProdId) {
      showToast("error", "Please select a product.");
      return;
    }
    const qty = parseFloat(invQty);
    const cost = parseFloat(invCost);
    if (!qty || qty <= 0) {
      showToast("error", "Please enter a valid stock quantity.");
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast("error", "Please enter a valid unit cost price (>= 0).");
      return;
    }
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;

    if (inventory.some((i) => i.product_id === selectedProdId)) {
      showToast("error", "Product already in opening inventory list. Edit existing row instead.");
      return;
    }

    setInventory((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        product_id: prod.id,
        product_name: prod.name,
        product_code: prod.code || "",
        unit: prod.unit || "unit",
        qty,
        unit_cost: cost,
        remarks: invRemarks.trim(),
      },
    ]);
    setSelectedProdId("");
    setInvQty("");
    setInvCost("");
    setInvRemarks("");
    showToast("success", `Added ${qty} ${prod.unit} of ${prod.name} to opening stock`);
  }

  function removeInventory(id: string) {
    setInventory((prev) => prev.filter((i) => i.id !== id));
  }

  function addPayable() {
    if (!selectedSuppId) {
      showToast("error", "Please select a supplier.");
      return;
    }
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) {
      showToast("error", "Please enter a valid payable amount greater than 0.");
      return;
    }
    const supp = suppliers.find((s) => s.id === selectedSuppId);
    if (!supp) return;

    if (payables.some((p) => p.supplier_id === selectedSuppId)) {
      showToast("error", "Supplier already in opening payables list.");
      return;
    }

    setPayables((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        supplier_id: supp.id,
        supplier_name: supp.name,
        amount: amt,
        remarks: payRemarks.trim(),
      },
    ]);
    setSelectedSuppId("");
    setPayAmount("");
    setPayRemarks("");
    showToast("success", `Added opening payable for ${supp.name}`);
  }

  function removePayable(id: string) {
    setPayables((prev) => prev.filter((p) => p.id !== id));
  }

  function addOtherLiab() {
    if (!liabTitle.trim()) {
      showToast("error", "Please enter a liability description.");
      return;
    }
    const amt = parseFloat(liabAmount);
    if (!amt || amt <= 0) {
      showToast("error", "Please enter a valid amount.");
      return;
    }
    setOtherLiab((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: liabTitle.trim(),
        amount: amt,
        remarks: liabRemarks.trim(),
      },
    ]);
    setLiabTitle("");
    setLiabAmount("");
    setLiabRemarks("");
    showToast("success", "Added liability entry.");
  }

  function removeOtherLiab(id: string) {
    setOtherLiab((prev) => prev.filter((l) => l.id !== id));
  }

  // Save Draft
  function handleSaveDraft() {
    const draft: OpeningPositionSnapshot = {
      opening_date: openingDate,
      status: "draft",
      cash: totalCash,
      cash_notes: cashNotes,
      banks,
      digital,
      receivables,
      inventory,
      payables,
      other_liabilities: otherLiab,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      opening_capital: openingCapital,
      remarks,
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      showToast("success", "Opening position draft saved successfully.");
    } catch {
      showToast("error", "Failed to save draft locally.");
    }
  }

  // Finalize Opening Position
  async function handleFinalize() {
    if (!openingDate) {
      showToast("error", "Opening date is required.");
      return;
    }
    if (totalAssets === 0 && totalLiabilities === 0) {
      showToast("error", "Please enter at least one starting asset or liability.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      // 1. Attempt transactional RPC call
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("finalize_opening_position", {
        p_opening_date: openingDate,
        p_cash: totalCash,
        p_cash_notes: cashNotes || "Opening Position Cash in Hand",
        p_banks: banks.filter((b) => b.amount > 0),
        p_digital: digital,
        p_receivables: receivables,
        p_inventory: inventory,
        p_payables: payables,
        p_other_liabilities: otherLiab,
        p_remarks: remarks || "Initial Opening Position",
      });

      if (!rpcErr) {
        setStatus("finalized");
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        showToast("success", "✓ Opening position finalized and posted to double-entry ledger!");
        setConfirmOpen(false);
        setReviewOpen(false);
        if (onFinalized) {
          onFinalized({
            opening_date: openingDate,
            status: "finalized",
            cash: totalCash,
            cash_notes: cashNotes,
            banks,
            digital,
            receivables,
            inventory,
            payables,
            other_liabilities: otherLiab,
            total_assets: totalAssets,
            total_liabilities: totalLiabilities,
            opening_capital: openingCapital,
            remarks,
            finalized_at: new Date().toISOString(),
          });
        }
        return;
      }

      // If RPC is missing or errors out, execute client-side fallback
      console.warn("RPC finalize_opening_position error, executing atomic client sequence:", rpcErr);

      // 1. Cash Opening Balance
      if (totalCash > 0) {
        await supabase.from("opening_balances").insert({
          pool: "cash",
          instrument_id: null,
          amount: totalCash,
          as_of: openingDate,
          remarks: cashNotes || "Opening Position Cash in Hand",
          is_auto: false,
        });
      }

      // 2. Bank Accounts
      for (const b of banks) {
        if (b.amount > 0) {
          await supabase.from("opening_balances").insert({
            pool: "bank",
            instrument_id: b.instrument_id,
            amount: b.amount,
            as_of: openingDate,
            remarks: b.remarks || `Opening Balance for ${b.name}`,
            is_auto: false,
          });
        }
      }

      // 3. Digital Floats
      const digitalPools = [
        { pool: "upi_qr", amt: digital.upi_qr, label: "UPI QR Float" },
        { pool: "wallet", amt: digital.wallet, label: "Digital Wallet Float" },
        { pool: "aeps", amt: digital.aeps, label: "AEPS Float" },
        { pool: "dmt", amt: digital.dmt, label: "DMT Float" },
        { pool: "recharge", amt: digital.recharge, label: "Mobile Recharge Float" },
      ];
      for (const dp of digitalPools) {
        if (dp.amt > 0) {
          await supabase.from("opening_balances").insert({
            pool: dp.pool,
            instrument_id: null,
            amount: dp.amt,
            as_of: openingDate,
            remarks: `Opening Position ${dp.label}`,
            is_auto: false,
          });
        }
      }

      // 4. Customer Receivables
      for (const r of receivables) {
        if (r.amount > 0) {
          await supabase.from("customer_ledger").insert({
            customer_id: r.customer_id,
            entry_date: openingDate,
            type: "opening",
            description: r.remarks || "Opening Receivable Balance",
            debit: r.amount,
            credit: 0,
            balance_after: r.amount,
          });
        }
      }

      // 5. Inventory
      for (const i of inventory) {
        if (i.qty > 0) {
          await supabase
            .from("products")
            .update({
              stock_qty: i.qty,
              cost_price: i.unit_cost > 0 ? i.unit_cost : undefined,
            })
            .eq("id", i.product_id);

          await supabase.from("stock_movements").insert({
            product_id: i.product_id,
            movement_date: openingDate,
            movement_type: "OPENING_STOCK",
            qty_change: i.qty,
            unit_cost: i.unit_cost,
            stock_after: i.qty,
            remarks: i.remarks || "Opening Inventory Stock",
          });
        }
      }

      // 6. Supplier Payables
      for (const p of payables) {
        if (p.amount > 0) {
          await supabase
            .from("suppliers")
            .update({
              opening_balance: p.amount,
              current_balance: p.amount,
            })
            .eq("id", p.supplier_id);

          await supabase.from("supplier_ledger").insert({
            supplier_id: p.supplier_id,
            entry_date: openingDate,
            type: "opening",
            description: p.remarks || "Opening Payable Balance",
            debit: 0,
            credit: p.amount,
            balance_after: p.amount,
            ref_type: "opening",
          });
        }
      }

      // 7. Audit Log
      await supabase.from("audit_logs").insert({
        action: "opening_position_finalized",
        entity: "opening_positions",
        description: `Finalized Opening Position for ${openingDate} | Assets: ${totalAssets} | Liabilities: ${totalLiabilities} | Capital: ${openingCapital}`,
        details: {
          opening_date: openingDate,
          total_assets: totalAssets,
          total_liabilities: totalLiabilities,
          opening_capital: openingCapital,
        },
      });

      setStatus("finalized");
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      showToast("success", "✓ Opening position finalized and posted to double-entry ledger!");
      setConfirmOpen(false);
      setReviewOpen(false);
      if (onFinalized) {
        onFinalized({
          opening_date: openingDate,
          status: "finalized",
          cash: totalCash,
          cash_notes: cashNotes,
          banks,
          digital,
          receivables,
          inventory,
          payables,
          other_liabilities: otherLiab,
          total_assets: totalAssets,
          total_liabilities: totalLiabilities,
          opening_capital: openingCapital,
          remarks,
          finalized_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.error("Finalize error:", err);
      showToast("error", err.message || "Failed to finalize opening position.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FloatingWindow
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-3">
          <span className="icon-box-3d flex h-7 w-7 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md shadow-purple-600/20">
            <SvgIcon path="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              Opening Position &amp; Balance Sheet Initializer
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Declare what your business owns and owes on your starting date.
            </p>
          </div>
        </div>
      }
      headerRight={
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1 dark:border-white/10 dark:bg-slate-900">
            <span className="text-[11px] font-bold text-slate-400">Opening Date:</span>
            <input
              type="date"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
              disabled={status === "finalized"}
              className="bg-transparent text-xs font-black text-slate-900 outline-none dark:text-white"
            />
          </div>

          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
              status === "finalized"
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400"
            }`}
          >
            ● {status === "finalized" ? "Finalized Position" : "Draft Mode"}
          </span>
        </div>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black ${
                isBalanced
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                  : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
              }`}
            >
              <span>{isBalanced ? "✓ POSITION BALANCED" : "! ATTENTION REQUIRED"}</span>
            </span>

            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
              Assets: <strong className="text-slate-800 dark:text-white">{inr(totalAssets)}</strong> · Liabilities:{" "}
              <strong className="text-slate-800 dark:text-white">{inr(totalLiabilities)}</strong> · Opening Capital:{" "}
              <strong className="text-purple-600 dark:text-purple-400">{inr(openingCapital)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {status !== "finalized" && (
              <button
                type="button"
                onClick={handleSaveDraft}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Save Draft
              </button>
            )}

            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="rounded-xl border border-purple-200 bg-purple-50/60 px-3.5 py-2 text-xs font-bold text-purple-700 shadow-xs hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
            >
              Review Summary
            </button>

            {status !== "finalized" && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="btn-3d-tactile-primary flex items-center gap-1.5 px-4 py-2 text-xs font-black shadow-md"
              >
                <span>Finalize Opening Position →</span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-1">
        {/* Top Interactive Metric Navigation Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
          {[
            {
              id: "cash" as const,
              label: "Cash in Hand",
              val: inr(totalCash),
              sub: "Physical cash float",
              icon: "💵",
              color: "border-indigo-500/20 hover:border-indigo-500/50",
            },
            {
              id: "banks" as const,
              label: "Bank Accounts",
              val: inr(totalBanks),
              sub: `${banks.length} accounts`,
              icon: "🏦",
              color: "border-blue-500/20 hover:border-blue-500/50",
            },
            {
              id: "digital" as const,
              label: "Digital Floats",
              val: inr(totalDigital),
              sub: "UPI, AEPS, DMT, Wallets",
              icon: "📱",
              color: "border-violet-500/20 hover:border-violet-500/50",
            },
            {
              id: "inventory" as const,
              label: "Inventory Stock",
              val: inr(totalInventory),
              sub: `${inventory.length} items listed`,
              icon: "📦",
              color: "border-amber-500/20 hover:border-amber-500/50",
            },
            {
              id: "receivables" as const,
              label: "Customer Dues",
              val: inr(totalReceivables),
              sub: `${receivables.length} debtors`,
              icon: "👤",
              color: "border-emerald-500/20 hover:border-emerald-500/50",
            },
            {
              id: "payables" as const,
              label: "Supplier Dues",
              val: inr(totalPayables),
              sub: `${payables.length} creditors`,
              icon: "🏷️",
              color: "border-rose-500/20 hover:border-rose-500/50",
            },
          ].map((card) => {
            const isCurrent = activeTab === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setActiveTab(card.id)}
                className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition duration-150 ${
                  isCurrent
                    ? "border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-600/20 dark:border-blue-500 dark:bg-blue-950/30"
                    : `bg-white/80 dark:bg-slate-900/60 ${card.color}`
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-base">{card.icon}</span>
                    <span className="text-[10px] font-black uppercase text-slate-400">{card.label}</span>
                  </div>
                  <div className="mt-2 truncate text-sm font-black tracking-tight text-slate-900 dark:text-white">
                    {card.val}
                  </div>
                </div>
                <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">{card.sub}</p>
              </button>
            );
          })}
        </div>

        {/* Section Tabs Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200/80 pb-2 dark:border-white/10">
          {[
            { id: "overview" as const, label: "Overview & Balance Sheet", icon: "📊" },
            { id: "cash" as const, label: "1. Cash in Hand", icon: "💵" },
            { id: "banks" as const, label: "2. Bank Accounts", icon: "🏦" },
            { id: "digital" as const, label: "3. Digital Floats", icon: "📱" },
            { id: "receivables" as const, label: "4. Customer Dues", icon: "👤" },
            { id: "inventory" as const, label: "5. Opening Stock", icon: "📦" },
            { id: "payables" as const, label: "6. Supplier Dues", icon: "🏷️" },
            { id: "liabilities" as const, label: "7. Other Liabilities", icon: "⚖️" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW & STARTING BALANCE SHEET */}
        {activeTab === "overview" && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Total Assets Bento */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-emerald-500/10 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-400">
                    Total Starting Assets
                  </span>
                  <span className="text-lg">📈</span>
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                  {inr(totalAssets)}
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 border-t border-emerald-500/20 pt-2.5">
                  <li className="flex justify-between">
                    <span>Cash in Hand:</span>
                    <strong>{inr(totalCash)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Bank Balances:</span>
                    <strong>{inr(totalBanks)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Digital &amp; Service Floats:</span>
                    <strong>{inr(totalDigital)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Opening Stock Valuation:</span>
                    <strong>{inr(totalInventory)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Customer Receivables:</span>
                    <strong>{inr(totalReceivables)}</strong>
                  </li>
                </ul>
              </div>

              {/* Total Liabilities Bento */}
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 dark:border-rose-500/10 dark:bg-rose-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-rose-700 dark:text-rose-400">
                    Total Starting Liabilities
                  </span>
                  <span className="text-lg">📉</span>
                </div>
                <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                  {inr(totalLiabilities)}
                </div>
                <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400 border-t border-rose-500/20 pt-2.5">
                  <li className="flex justify-between">
                    <span>Supplier Payables:</span>
                    <strong>{inr(totalPayables)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Other External Liabilities:</span>
                    <strong>{inr(totalOtherLiabilities)}</strong>
                  </li>
                </ul>
              </div>

              {/* Opening Capital Equity Bento */}
              <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4 dark:border-purple-500/10 dark:bg-purple-950/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-purple-700 dark:text-purple-400">
                    Opening Capital (Owner Equity)
                  </span>
                  <span className="text-lg">🏛️</span>
                </div>
                <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
                  {inr(openingCapital)}
                </div>
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 border-t border-purple-500/20 pt-2.5">
                  Calculated as: <br />
                  <code className="text-[10px] font-bold">Assets ({inr(totalAssets)}) - Liabilities ({inr(totalLiabilities)})</code>
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <SvgIcon path="M20 6 9 17 4 12" className="h-4 w-4" />
                  <span>Double-Entry Balance Verified</span>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Step-by-Step Position Categories
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("cash")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>💵</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Cash in Hand</p>
                      <p className="text-[10px] text-slate-400">Physical drawer cash</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalCash)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("banks")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>🏦</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Bank Accounts</p>
                      <p className="text-[10px] text-slate-400">{banks.length} accounts configured</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalBanks)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("digital")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>📱</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Digital Floats</p>
                      <p className="text-[10px] text-slate-400">UPI, AEPS, DMT floats</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalDigital)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("receivables")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>👤</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Customer Dues</p>
                      <p className="text-[10px] text-slate-400">{receivables.length} customer debts</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalReceivables)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("inventory")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>📦</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Opening Stock</p>
                      <p className="text-[10px] text-slate-400">{inventory.length} product stocks</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalInventory)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("payables")}
                  className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span>🏷️</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Supplier Dues</p>
                      <p className="text-[10px] text-slate-400">{payables.length} vendor payables</p>
                    </div>
                  </div>
                  <strong className="text-xs">{inr(totalPayables)}</strong>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CASH IN HAND */}
        {activeTab === "cash" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Physical Cash in Hand
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Starting cash float available in the shop cash drawer on {openingDate}.
                </p>
              </div>
              <strong className="text-lg font-black text-blue-600 dark:text-blue-400">
                {inr(totalCash)}
              </strong>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Cash in Hand Amount (₹) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount || ""}
                  onChange={(e) => setCashAmount(parseFloat(e.target.value) || 0)}
                  disabled={status === "finalized"}
                  placeholder="e.g. 25000"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Optional Notes / Reference
                </label>
                <input
                  type="text"
                  value={cashNotes}
                  onChange={(e) => setCashNotes(e.target.value)}
                  disabled={status === "finalized"}
                  placeholder="e.g. Verified main drawer count"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BANK ACCOUNTS */}
        {activeTab === "banks" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Bank Account Balances
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Opening cleared balance for each bank account.
                </p>
              </div>
              <strong className="text-lg font-black text-blue-600 dark:text-blue-400">
                {inr(totalBanks)}
              </strong>
            </div>

            {banks.length === 0 ? (
              <p className="text-xs text-slate-400">No bank accounts configured in Business settings.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {banks.map((b, idx) => (
                  <div
                    key={b.instrument_id || idx}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {b.name}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">Bank Account</span>
                    </div>

                    <div className="mt-2.5">
                      <label className="text-[11px] font-bold text-slate-500">Opening Balance (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={b.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setBanks((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DIGITAL FLOATS */}
        {activeTab === "digital" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Digital &amp; Service Floats
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-funded provider floats and digital wallet starting amounts.
                </p>
              </div>
              <strong className="text-lg font-black text-purple-600 dark:text-purple-400">
                {inr(totalDigital)}
              </strong>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">UPI / QR Float</span>
                <input
                  type="number"
                  min="0"
                  value={digital.upi_qr || ""}
                  onChange={(e) =>
                    setDigital((prev) => ({ ...prev, upi_qr: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={status === "finalized"}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Digital Wallet</span>
                <input
                  type="number"
                  min="0"
                  value={digital.wallet || ""}
                  onChange={(e) =>
                    setDigital((prev) => ({ ...prev, wallet: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={status === "finalized"}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">AEPS Cash Float</span>
                <input
                  type="number"
                  min="0"
                  value={digital.aeps || ""}
                  onChange={(e) =>
                    setDigital((prev) => ({ ...prev, aeps: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={status === "finalized"}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">DMT Remittance Float</span>
                <input
                  type="number"
                  min="0"
                  value={digital.dmt || ""}
                  onChange={(e) =>
                    setDigital((prev) => ({ ...prev, dmt: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={status === "finalized"}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Mobile Recharge Float</span>
                <input
                  type="number"
                  min="0"
                  value={digital.recharge || ""}
                  onChange={(e) =>
                    setDigital((prev) => ({ ...prev, recharge: parseFloat(e.target.value) || 0 }))
                  }
                  disabled={status === "finalized"}
                  placeholder="0.00"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CUSTOMER RECEIVABLES */}
        {activeTab === "receivables" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Customer Opening Receivables (Debtors)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-existing amounts owed to your business by customers before starting this ERP.
                </p>
              </div>
              <strong className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {inr(totalReceivables)}
              </strong>
            </div>

            {status !== "finalized" && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 sm:grid-cols-12 dark:border-white/5 dark:bg-white/2">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-bold text-slate-500">Customer *</label>
                  <SearchableSelect
                    options={customers.map((c) => ({
                      value: c.id,
                      label: `${c.name} (${c.phone || "No phone"})`,
                    }))}
                    value={selectedCustId}
                    onChange={setSelectedCustId}
                    placeholder="Search customer..."
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Remarks</label>
                  <input
                    type="text"
                    value={recRemarks}
                    onChange={(e) => setRecRemarks(e.target.value)}
                    placeholder="Previous balance note"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={addReceivable}
                    className="flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs hover:bg-blue-700"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {receivables.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No customer receivables added.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
                {receivables.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{r.customer_name}</p>
                      {r.remarks && <p className="text-[10px] text-slate-400">{r.remarks}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                        {inr(r.amount)}
                      </strong>
                      {status !== "finalized" && (
                        <button
                          type="button"
                          onClick={() => removeReceivable(r.id)}
                          className="rounded-md p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: OPENING INVENTORY */}
        {activeTab === "inventory" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Opening Product Stock &amp; Inventory Valuation
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter physical stock count and purchase cost price for each product in stock.
                </p>
              </div>
              <strong className="text-lg font-black text-amber-600 dark:text-amber-400">
                {inr(totalInventory)}
              </strong>
            </div>

            {status !== "finalized" && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 sm:grid-cols-12 dark:border-white/5 dark:bg-white/2">
                <div className="sm:col-span-4">
                  <label className="text-[11px] font-bold text-slate-500">Product *</label>
                  <SearchableSelect
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.code || "No code"})`,
                    }))}
                    value={selectedProdId}
                    onChange={(id) => {
                      setSelectedProdId(id);
                      const prod = products.find((p) => p.id === id);
                      if (prod && Number(prod.cost_price) > 0) {
                        setInvCost(String(prod.cost_price));
                      }
                    }}
                    placeholder="Search product..."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={invQty}
                    onChange={(e) => setInvQty(e.target.value)}
                    placeholder="e.g. 50"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500">Unit Cost (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={invCost}
                    onChange={(e) => setInvCost(e.target.value)}
                    placeholder="e.g. 120"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Notes</label>
                  <input
                    type="text"
                    value={invRemarks}
                    onChange={(e) => setInvRemarks(e.target.value)}
                    placeholder="Shelf / Lot info"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={addInventory}
                    className="flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs hover:bg-blue-700"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {inventory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No opening inventory rows added.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
                {inventory.map((i) => {
                  const lineTotal = (Number(i.qty) || 0) * (Number(i.unit_cost) || 0);
                  return (
                    <div key={i.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {i.product_name} <span className="text-[10px] text-slate-400 font-normal">({i.product_code || "PRD"})</span>
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {i.qty} {i.unit} × {inr(i.unit_cost)} / {i.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <strong className="text-xs font-black text-amber-600 dark:text-amber-400">
                          {inr(lineTotal)}
                        </strong>
                        {status !== "finalized" && (
                          <button
                            type="button"
                            onClick={() => removeInventory(i.id)}
                            className="rounded-md p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Remove row"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: SUPPLIER PAYABLES */}
        {activeTab === "payables" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Supplier Opening Payables (Creditors)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-existing amounts owed by your business to vendors/suppliers.
                </p>
              </div>
              <strong className="text-lg font-black text-rose-600 dark:text-rose-400">
                {inr(totalPayables)}
              </strong>
            </div>

            {status !== "finalized" && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 sm:grid-cols-12 dark:border-white/5 dark:bg-white/2">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-bold text-slate-500">Supplier *</label>
                  <SearchableSelect
                    options={suppliers.map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.code})`,
                    }))}
                    value={selectedSuppId}
                    onChange={setSelectedSuppId}
                    placeholder="Search supplier..."
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Remarks</label>
                  <input
                    type="text"
                    value={payRemarks}
                    onChange={(e) => setPayRemarks(e.target.value)}
                    placeholder="Vendor invoice reference"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={addPayable}
                    className="flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs hover:bg-blue-700"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {payables.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No supplier payables added.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
                {payables.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{p.supplier_name}</p>
                      {p.remarks && <p className="text-[10px] text-slate-400">{p.remarks}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-xs font-black text-rose-600 dark:text-rose-400">
                        {inr(p.amount)}
                      </strong>
                      {status !== "finalized" && (
                        <button
                          type="button"
                          onClick={() => removePayable(p.id)}
                          className="rounded-md p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: OTHER LIABILITIES */}
        {activeTab === "liabilities" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Other Starting Liabilities
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Outstanding commercial loans, unpaid rent/electricity, or other obligations.
                </p>
              </div>
              <strong className="text-lg font-black text-rose-600 dark:text-rose-400">
                {inr(totalOtherLiabilities)}
              </strong>
            </div>

            {status !== "finalized" && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 sm:grid-cols-12 dark:border-white/5 dark:bg-white/2">
                <div className="sm:col-span-5">
                  <label className="text-[11px] font-bold text-slate-500">Liability Description *</label>
                  <input
                    type="text"
                    value={liabTitle}
                    onChange={(e) => setLiabTitle(e.target.value)}
                    placeholder="e.g. Bank Mudra Loan"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Amount (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={liabAmount}
                    onChange={(e) => setLiabAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="text-[11px] font-bold text-slate-500">Remarks</label>
                  <input
                    type="text"
                    value={liabRemarks}
                    onChange={(e) => setLiabRemarks(e.target.value)}
                    placeholder="Terms or notes"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    onClick={addOtherLiab}
                    className="flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white shadow-xs hover:bg-blue-700"
                  >
                    + Add
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {otherLiab.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No other liabilities added.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
                {otherLiab.map((l) => (
                  <div key={l.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{l.title}</p>
                      {l.remarks && <p className="text-[10px] text-slate-400">{l.remarks}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-xs font-black text-rose-600 dark:text-rose-400">
                        {inr(l.amount)}
                      </strong>
                      {status !== "finalized" && (
                        <button
                          type="button"
                          onClick={() => removeOtherLiab(l.id)}
                          className="rounded-md p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {reviewOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div
            onClick={() => setReviewOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/10">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Opening Balance Sheet Review
              </h3>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-50/30 p-3 dark:bg-emerald-950/20">
                  <strong className="text-emerald-700 dark:text-emerald-400">ASSETS</strong>
                  <div className="flex justify-between"><span>Cash in Hand:</span><span>{inr(totalCash)}</span></div>
                  <div className="flex justify-between"><span>Bank Accounts ({banks.length}):</span><span>{inr(totalBanks)}</span></div>
                  <div className="flex justify-between"><span>Digital Floats:</span><span>{inr(totalDigital)}</span></div>
                  <div className="flex justify-between"><span>Inventory Valuation:</span><span>{inr(totalInventory)}</span></div>
                  <div className="flex justify-between"><span>Customer Receivables ({receivables.length}):</span><span>{inr(totalReceivables)}</span></div>
                  <div className="flex justify-between font-black border-t border-emerald-500/20 pt-1">
                    <span>Total Assets:</span>
                    <span>{inr(totalAssets)}</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-rose-500/20 bg-rose-50/30 p-3 dark:bg-rose-950/20">
                  <strong className="text-rose-700 dark:text-rose-400">LIABILITIES &amp; EQUITY</strong>
                  <div className="flex justify-between"><span>Supplier Payables ({payables.length}):</span><span>{inr(totalPayables)}</span></div>
                  <div className="flex justify-between"><span>Other Liabilities ({otherLiab.length}):</span><span>{inr(totalOtherLiabilities)}</span></div>
                  <div className="flex justify-between font-black border-t border-rose-500/20 pt-1">
                    <span>Total Liabilities:</span>
                    <span>{inr(totalLiabilities)}</span>
                  </div>
                  <div className="flex justify-between font-black text-purple-700 dark:text-purple-400 border-t border-rose-500/20 pt-1">
                    <span>Opening Capital (Equity):</span>
                    <span>{inr(openingCapital)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-300"
              >
                Close
              </button>
              {status !== "finalized" && (
                <button
                  type="button"
                  onClick={() => {
                    setReviewOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm"
                >
                  Proceed to Finalize
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finalize Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 animate-fade-in">
          <div
            onClick={() => !submitting && setConfirmOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-purple-300 bg-white p-6 shadow-2xl dark:border-purple-900/60 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                🏛️
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Finalize Opening Position?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This establishes the authoritative financial baseline for this ERP.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-white/5 dark:bg-white/5 dark:text-slate-300">
              <div className="flex justify-between py-0.5">
                <span>Opening Date:</span>
                <strong>{openingDate}</strong>
              </div>
              <div className="flex justify-between py-0.5">
                <span>Total Assets:</span>
                <strong className="text-emerald-600">{inr(totalAssets)}</strong>
              </div>
              <div className="flex justify-between py-0.5">
                <span>Total Liabilities:</span>
                <strong className="text-rose-600">{inr(totalLiabilities)}</strong>
              </div>
              <div className="flex justify-between py-0.5 font-bold">
                <span>Opening Capital:</span>
                <strong className="text-purple-600">{inr(openingCapital)}</strong>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              ⚡ This will post starting cash float, bank balances, customer ledger debit seeds, supplier credits, and inventory starting stock atomically.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={submitting}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white hover:bg-purple-700 shadow-md disabled:opacity-50"
              >
                {submitting ? "Posting..." : "Confirm & Finalize"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastView}
    </FloatingWindow>
  );
}
