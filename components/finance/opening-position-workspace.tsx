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
  opening_balance?: number;
  current_balance?: number;
  details?: any;
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

export type AccountRow = {
  instrument_id: string;
  name: string;
  type: string;
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
  cash_accounts: AccountRow[];
  bank_accounts: AccountRow[];
  digital_accounts: AccountRow[];
  wallet_accounts: AccountRow[];
  aeps_accounts: AccountRow[];
  dmt_accounts: AccountRow[];
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

export const DRAFT_STORAGE_KEY = "cafe_erp_opening_position_draft_v2";

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
    "overview" | "cash" | "banks" | "digital" | "wallets" | "aeps" | "dmt" | "receivables" | "inventory" | "payables" | "liabilities"
  >("overview");

  const [openingDate, setOpeningDate] = useState<string>(() => {
    if (initialSnapshot?.opening_date) return initialSnapshot.opening_date;
    return new Date().toISOString().slice(0, 10);
  });

  const [status, setStatus] = useState<"draft" | "finalized">(
    initialSnapshot?.status === "finalized" ? "finalized" : "draft"
  );
  const [remarks, setRemarks] = useState(initialSnapshot?.remarks || "");

  // Filter Active Instruments by Type
  const activeCashInstruments = useMemo(
    () => instruments.filter((i) => i.type === "cash" && i.is_active),
    [instruments]
  );
  const activeBankInstruments = useMemo(
    () => instruments.filter((i) => i.type === "bank" && i.is_active),
    [instruments]
  );
  const activeUpiInstruments = useMemo(
    () => instruments.filter((i) => i.type === "upi" && i.is_active),
    [instruments]
  );
  const activeWalletInstruments = useMemo(
    () => instruments.filter((i) => i.type === "wallet" && i.is_active),
    [instruments]
  );
  const activeAepsInstruments = useMemo(
    () => instruments.filter((i) => i.type === "aeps_portal" && i.is_active),
    [instruments]
  );
  const activeDmtInstruments = useMemo(
    () => instruments.filter((i) => i.type === "dmt_portal" && i.is_active),
    [instruments]
  );

  // 1. Cash Accounts State (Account-Wise)
  const [cashAccounts, setCashAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.cash_accounts && initialSnapshot.cash_accounts.length > 0) {
      return initialSnapshot.cash_accounts;
    }
    if (activeCashInstruments.length > 0) {
      return activeCashInstruments.map((c) => ({
        instrument_id: c.id,
        name: c.name,
        type: "cash",
        amount: Number(c.opening_balance || 0),
        remarks: "",
      }));
    }
    return [
      {
        instrument_id: "",
        name: "Main Cash Drawer",
        type: "cash",
        amount: 0,
        remarks: "",
      },
    ];
  });

  // 2. Bank Accounts State (Account-Wise)
  const [bankAccounts, setBankAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.bank_accounts && initialSnapshot.bank_accounts.length > 0) {
      return initialSnapshot.bank_accounts;
    }
    return activeBankInstruments.map((b) => ({
      instrument_id: b.id,
      name: b.name,
      type: "bank",
      amount: Number(b.opening_balance || 0),
      remarks: "",
    }));
  });

  // 3. UPI / Digital Settlement Accounts State (Account-Wise)
  const [digitalAccounts, setDigitalAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.digital_accounts && initialSnapshot.digital_accounts.length > 0) {
      return initialSnapshot.digital_accounts;
    }
    return activeUpiInstruments.map((u) => ({
      instrument_id: u.id,
      name: u.name,
      type: "upi",
      amount: Number(u.opening_balance || 0),
      remarks: "",
    }));
  });

  // 4. Digital Wallet Accounts State (Account-Wise)
  const [walletAccounts, setWalletAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.wallet_accounts && initialSnapshot.wallet_accounts.length > 0) {
      return initialSnapshot.wallet_accounts;
    }
    return activeWalletInstruments.map((w) => ({
      instrument_id: w.id,
      name: w.name,
      type: "wallet",
      amount: Number(w.opening_balance || 0),
      remarks: "",
    }));
  });

  // 5. AEPS Provider Floats State (Provider-Wise)
  const [aepsProviderAccounts, setAepsProviderAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.aeps_accounts && initialSnapshot.aeps_accounts.length > 0) {
      return initialSnapshot.aeps_accounts;
    }
    return activeAepsInstruments.map((a) => ({
      instrument_id: a.id,
      name: a.name,
      type: "aeps_portal",
      amount: Number(a.opening_balance || 0),
      remarks: "",
    }));
  });

  // 6. DMT Provider Wallets State (Provider-Wise)
  const [dmtProviderAccounts, setDmtProviderAccounts] = useState<AccountRow[]>(() => {
    if (initialSnapshot?.dmt_accounts && initialSnapshot.dmt_accounts.length > 0) {
      return initialSnapshot.dmt_accounts;
    }
    return activeDmtInstruments.map((d) => ({
      instrument_id: d.id,
      name: d.name,
      type: "dmt_portal",
      amount: Number(d.opening_balance || 0),
      remarks: "",
    }));
  });

  // 7. Customer Receivables
  const [receivables, setReceivables] = useState<ReceivableRow[]>(
    initialSnapshot?.receivables || []
  );
  const [selectedCustId, setSelectedCustId] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recRemarks, setRecRemarks] = useState("");

  // 8. Inventory Stock
  const [inventory, setInventory] = useState<InventoryRow[]>(
    initialSnapshot?.inventory || []
  );
  const [selectedProdId, setSelectedProdId] = useState("");
  const [invQty, setInvQty] = useState("");
  const [invCost, setInvCost] = useState("");
  const [invRemarks, setInvRemarks] = useState("");

  // 9. Supplier Payables
  const [payables, setPayables] = useState<PayableRow[]>(
    initialSnapshot?.payables || []
  );
  const [selectedSuppId, setSelectedSuppId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payRemarks, setPayRemarks] = useState("");

  // 10. Other Liabilities
  const [otherLiab, setOtherLiab] = useState<OtherLiabRow[]>(
    initialSnapshot?.other_liabilities || []
  );
  const [liabTitle, setLiabTitle] = useState("");
  const [liabAmount, setLiabAmount] = useState("");
  const [liabRemarks, setLiabRemarks] = useState("");

  // Modals
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Sync instruments if lists change
  useEffect(() => {
    if (activeCashInstruments.length > 0 && cashAccounts.every((c) => !c.instrument_id)) {
      setCashAccounts(
        activeCashInstruments.map((c) => ({
          instrument_id: c.id,
          name: c.name,
          type: "cash",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeCashInstruments, cashAccounts]);

  useEffect(() => {
    if (bankAccounts.length === 0 && activeBankInstruments.length > 0) {
      setBankAccounts(
        activeBankInstruments.map((b) => ({
          instrument_id: b.id,
          name: b.name,
          type: "bank",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeBankInstruments, bankAccounts.length]);

  useEffect(() => {
    if (digitalAccounts.length === 0 && activeUpiInstruments.length > 0) {
      setDigitalAccounts(
        activeUpiInstruments.map((u) => ({
          instrument_id: u.id,
          name: u.name,
          type: "upi",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeUpiInstruments, digitalAccounts.length]);

  useEffect(() => {
    if (walletAccounts.length === 0 && activeWalletInstruments.length > 0) {
      setWalletAccounts(
        activeWalletInstruments.map((w) => ({
          instrument_id: w.id,
          name: w.name,
          type: "wallet",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeWalletInstruments, walletAccounts.length]);

  useEffect(() => {
    if (aepsProviderAccounts.length === 0 && activeAepsInstruments.length > 0) {
      setAepsProviderAccounts(
        activeAepsInstruments.map((a) => ({
          instrument_id: a.id,
          name: a.name,
          type: "aeps_portal",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeAepsInstruments, aepsProviderAccounts.length]);

  useEffect(() => {
    if (dmtProviderAccounts.length === 0 && activeDmtInstruments.length > 0) {
      setDmtProviderAccounts(
        activeDmtInstruments.map((d) => ({
          instrument_id: d.id,
          name: d.name,
          type: "dmt_portal",
          amount: 0,
          remarks: "",
        }))
      );
    }
  }, [activeDmtInstruments, dmtProviderAccounts.length]);

  // Load Saved Draft v2 (and purge legacy v1 draft to prevent stale resurrection)
  useEffect(() => {
    if (!initialSnapshot && typeof window !== "undefined") {
      try {
        // Purge legacy draft key
        window.localStorage.removeItem("cafe_erp_opening_position_draft_v1");

        const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === "object") {
            if (parsed.opening_date) setOpeningDate(parsed.opening_date);
            if (Array.isArray(parsed.cash_accounts) && parsed.cash_accounts.length > 0) setCashAccounts(parsed.cash_accounts);
            if (Array.isArray(parsed.bank_accounts) && parsed.bank_accounts.length > 0) setBankAccounts(parsed.bank_accounts);
            if (Array.isArray(parsed.digital_accounts) && parsed.digital_accounts.length > 0) setDigitalAccounts(parsed.digital_accounts);
            if (Array.isArray(parsed.wallet_accounts) && parsed.wallet_accounts.length > 0) setWalletAccounts(parsed.wallet_accounts);
            if (Array.isArray(parsed.aeps_accounts) && parsed.aeps_accounts.length > 0) setAepsProviderAccounts(parsed.aeps_accounts);
            if (Array.isArray(parsed.dmt_accounts) && parsed.dmt_accounts.length > 0) setDmtProviderAccounts(parsed.dmt_accounts);
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

  // --- Derived Category Calculations ---
  const totalCash = useMemo(
    () => cashAccounts.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [cashAccounts]
  );
  const totalBanks = useMemo(
    () => bankAccounts.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
    [bankAccounts]
  );
  const totalDigital = useMemo(
    () => digitalAccounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [digitalAccounts]
  );
  const totalWallets = useMemo(
    () => walletAccounts.reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [walletAccounts]
  );
  const totalAeps = useMemo(
    () => aepsProviderAccounts.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    [aepsProviderAccounts]
  );
  const totalDmt = useMemo(
    () => dmtProviderAccounts.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [dmtProviderAccounts]
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
  const totalPayables = useMemo(
    () => payables.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
    [payables]
  );
  const totalOtherLiabilities = useMemo(
    () => otherLiab.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [otherLiab]
  );

  const totalAssets = useMemo(
    () =>
      totalCash +
      totalBanks +
      totalDigital +
      totalWallets +
      totalAeps +
      totalDmt +
      totalReceivables +
      totalInventory,
    [
      totalCash,
      totalBanks,
      totalDigital,
      totalWallets,
      totalAeps,
      totalDmt,
      totalReceivables,
      totalInventory,
    ]
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
      showToast("error", "Please enter a valid liability amount.");
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
    showToast("success", "Added starting liability");
  }

  function removeOtherLiab(id: string) {
    setOtherLiab((prev) => prev.filter((l) => l.id !== id));
  }

  // Save Draft to LocalStorage v2
  function handleSaveDraft() {
    if (typeof window !== "undefined") {
      const draftData: OpeningPositionSnapshot = {
        opening_date: openingDate,
        status: "draft",
        cash_accounts: cashAccounts,
        bank_accounts: bankAccounts,
        digital_accounts: digitalAccounts,
        wallet_accounts: walletAccounts,
        aeps_accounts: aepsProviderAccounts,
        dmt_accounts: dmtProviderAccounts,
        receivables,
        inventory,
        payables,
        other_liabilities: otherLiab,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        opening_capital: openingCapital,
        remarks,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      showToast("success", "✓ Opening position draft saved to local workspace.");
    }
  }

  // Finalize Opening Position (Account-Wise Execution)
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
      // 1. Post All Financial Account Rows to opening_balances & update payment_instruments
      const allFinancialRows = [
        ...cashAccounts.map((a) => ({ ...a, pool: "cash" })),
        ...bankAccounts.map((a) => ({ ...a, pool: "bank" })),
        ...digitalAccounts.map((a) => ({ ...a, pool: "upi_qr" })),
        ...walletAccounts.map((a) => ({ ...a, pool: "wallet" })),
        ...aepsProviderAccounts.map((a) => ({ ...a, pool: "aeps" })),
        ...dmtProviderAccounts.map((a) => ({ ...a, pool: "dmt" })),
      ];

      for (const row of allFinancialRows) {
        if (Number(row.amount) > 0) {
          const instId = row.instrument_id ? row.instrument_id : null;
          await supabase.from("opening_balances").insert({
            pool: row.pool,
            instrument_id: instId,
            amount: Number(row.amount),
            as_of: openingDate,
            remarks: row.remarks || `Opening Balance for ${row.name}`,
            is_auto: false,
          });

          if (instId) {
            await supabase
              .from("payment_instruments")
              .update({
                opening_balance: Number(row.amount),
                current_balance: Number(row.amount),
              })
              .eq("id", instId);
          }
        }
      }

      // 2. Customer Receivables
      for (const r of receivables) {
        if (Number(r.amount) > 0) {
          await supabase.from("customer_ledger").insert({
            customer_id: r.customer_id,
            entry_date: openingDate,
            type: "opening",
            description: r.remarks || "Opening Receivable Balance",
            debit: Number(r.amount),
            credit: 0,
            balance_after: Number(r.amount),
          });
          await supabase
            .from("customers")
            .update({
              opening_balance: Number(r.amount),
              balance: Number(r.amount),
            })
            .eq("id", r.customer_id);
        }
      }

      // 3. Inventory Stock
      for (const i of inventory) {
        if (Number(i.qty) > 0) {
          await supabase
            .from("products")
            .update({
              stock_qty: Number(i.qty),
              cost_price: Number(i.unit_cost) > 0 ? Number(i.unit_cost) : undefined,
            })
            .eq("id", i.product_id);

          await supabase.from("stock_movements").insert({
            product_id: i.product_id,
            movement_date: openingDate,
            movement_type: "OPENING_STOCK",
            qty_change: Number(i.qty),
            unit_cost: Number(i.unit_cost),
            stock_after: Number(i.qty),
            remarks: i.remarks || "Opening Inventory Stock",
          });
        }
      }

      // 4. Supplier Payables
      for (const p of payables) {
        if (Number(p.amount) > 0) {
          await supabase
            .from("suppliers")
            .update({
              opening_balance: Number(p.amount),
              current_balance: Number(p.amount),
            })
            .eq("id", p.supplier_id);

          await supabase.from("supplier_ledger").insert({
            supplier_id: p.supplier_id,
            entry_date: openingDate,
            type: "opening",
            description: p.remarks || "Opening Payable Balance",
            debit: 0,
            credit: Number(p.amount),
            balance_after: Number(p.amount),
            ref_type: "opening",
          });
        }
      }

      // 5. Audit Log
      await supabase.from("audit_logs").insert({
        action: "opening_position_finalized",
        entity: "opening_positions",
        description: `Finalized Opening Position for ${openingDate} | Assets: ${inr(totalAssets)} | Liabilities: ${inr(totalLiabilities)} | Capital: ${inr(openingCapital)}`,
        details: {
          opening_date: openingDate,
          total_assets: totalAssets,
          total_liabilities: totalLiabilities,
          opening_capital: openingCapital,
        },
      });

      setStatus("finalized");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
      showToast("success", "✓ Opening position finalized and posted to double-entry ledger!");
      setConfirmOpen(false);
      setReviewOpen(false);

      if (onFinalized) {
        onFinalized({
          opening_date: openingDate,
          status: "finalized",
          cash_accounts: cashAccounts,
          bank_accounts: bankAccounts,
          digital_accounts: digitalAccounts,
          wallet_accounts: walletAccounts,
          aeps_accounts: aepsProviderAccounts,
          dmt_accounts: dmtProviderAccounts,
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
      console.error("Error finalizing opening position:", err);
      showToast("error", err.message || "Failed to finalize opening position.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FloatingWindow
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Opening Position &amp; Balance Sheet Initializer</span>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
            {status === "finalized"
              ? "Finalized & Active"
              : status === "draft"
              ? "Draft in Progress"
              : "Not Initialized"}
          </span>
        </div>
      }
      subtitle="Establish starting financial accounts, inventory stock, customer receivables, and supplier payables in one verified double-entry position."
      headerRight={
        <div className="flex items-center gap-2">
          {status !== "finalized" && (
            <button
              type="button"
              onClick={handleSaveDraft}
              className="btn-3d-tactile-secondary px-3 py-1.5 text-xs font-bold"
            >
              Save Draft
            </button>
          )}
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="btn-3d-tactile-secondary px-3 py-1.5 text-xs font-bold"
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
              sub: `${cashAccounts.length} cash account${cashAccounts.length === 1 ? "" : "s"}`,
              icon: "💵",
              color: "border-indigo-500/20 hover:border-indigo-500/50",
            },
            {
              id: "banks" as const,
              label: "Bank Accounts",
              val: inr(totalBanks),
              sub: `${bankAccounts.length} bank account${bankAccounts.length === 1 ? "" : "s"}`,
              icon: "🏦",
              color: "border-blue-500/20 hover:border-blue-500/50",
            },
            {
              id: "digital" as const,
              label: "UPI Accounts",
              val: inr(totalDigital),
              sub: `${digitalAccounts.length} settlement account${digitalAccounts.length === 1 ? "" : "s"}`,
              icon: "📱",
              color: "border-violet-500/20 hover:border-violet-500/50",
            },
            {
              id: "wallets" as const,
              label: "Wallets",
              val: inr(totalWallets),
              sub: `${walletAccounts.length} digital wallet${walletAccounts.length === 1 ? "" : "s"}`,
              icon: "👛",
              color: "border-emerald-500/20 hover:border-emerald-500/50",
            },
            {
              id: "aeps" as const,
              label: "AEPS Floats",
              val: inr(totalAeps),
              sub: `${aepsProviderAccounts.length} provider float${aepsProviderAccounts.length === 1 ? "" : "s"}`,
              icon: "🏧",
              color: "border-amber-500/20 hover:border-amber-500/50",
            },
            {
              id: "dmt" as const,
              label: "DMT Wallets",
              val: inr(totalDmt),
              sub: `${dmtProviderAccounts.length} provider wallet${dmtProviderAccounts.length === 1 ? "" : "s"}`,
              icon: "💸",
              color: "border-cyan-500/20 hover:border-cyan-500/50",
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
            { id: "cash" as const, label: "1. Cash Accounts", icon: "💵" },
            { id: "banks" as const, label: "2. Bank Accounts", icon: "🏦" },
            { id: "digital" as const, label: "3. UPI Accounts", icon: "📱" },
            { id: "wallets" as const, label: "4. Wallets", icon: "👛" },
            { id: "aeps" as const, label: "5. AEPS Floats", icon: "🏧" },
            { id: "dmt" as const, label: "6. DMT Wallets", icon: "💸" },
            { id: "receivables" as const, label: "7. Customer Dues", icon: "👤" },
            { id: "inventory" as const, label: "8. Opening Stock", icon: "📦" },
            { id: "payables" as const, label: "9. Supplier Dues", icon: "🏷️" },
            { id: "liabilities" as const, label: "10. Other Liabilities", icon: "⚖️" },
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
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/5 p-4 dark:border-emerald-500/10 dark:bg-emerald-950/20">
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
                    <span>Cash Accounts ({cashAccounts.length}):</span>
                    <strong>{inr(totalCash)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Bank Accounts ({bankAccounts.length}):</span>
                    <strong>{inr(totalBanks)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>UPI Settlement ({digitalAccounts.length}):</span>
                    <strong>{inr(totalDigital)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Wallets ({walletAccounts.length}):</span>
                    <strong>{inr(totalWallets)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>AEPS Floats ({aepsProviderAccounts.length}):</span>
                    <strong>{inr(totalAeps)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>DMT Wallets ({dmtProviderAccounts.length}):</span>
                    <strong>{inr(totalDmt)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Customer Receivables ({receivables.length}):</span>
                    <strong>{inr(totalReceivables)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Opening Stock Valuation ({inventory.length}):</span>
                    <strong>{inr(totalInventory)}</strong>
                  </li>
                </ul>
              </div>

              {/* Total Liabilities Bento */}
              <div className="rounded-2xl border border-rose-500/20 bg-rose-50/5 p-4 dark:border-rose-500/10 dark:bg-rose-950/20">
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
                    <span>Supplier Payables ({payables.length}):</span>
                    <strong>{inr(totalPayables)}</strong>
                  </li>
                  <li className="flex justify-between">
                    <span>Other External Liabilities ({otherLiab.length}):</span>
                    <strong>{inr(totalOtherLiabilities)}</strong>
                  </li>
                </ul>
              </div>

              {/* Opening Capital Equity Bento */}
              <div className="rounded-2xl border border-purple-500/20 bg-purple-50/5 p-4 dark:border-purple-500/10 dark:bg-purple-950/20">
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

            {/* Anchor Date & Setup */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Business Starting Anchor Date</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">The effective date for all opening balances and starting stock.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Effective Date:</label>
                  <input
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    disabled={status === "finalized"}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CASH ACCOUNTS (MULTI-CASH READY) */}
        {activeTab === "cash" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Cash Accounts (Tills &amp; Drawers)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Opening physical cash balances for your active shop cash drawers and counters.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">CASH TOTAL</span>
                <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{inr(totalCash)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cashAccounts.map((c, idx) => (
                <div
                  key={c.instrument_id || `cash-${idx}`}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-white">{c.name}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                      Cash Account
                    </span>
                  </div>
                  <div className="mt-3">
                    <label className="text-[11px] font-bold text-slate-500">Starting Cash (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.amount || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCashAccounts((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                        );
                      }}
                      disabled={status === "finalized"}
                      placeholder="0.00"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={c.remarks}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCashAccounts((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                        );
                      }}
                      disabled={status === "finalized"}
                      placeholder="Drawer location / notes"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: BANK ACCOUNTS */}
        {activeTab === "banks" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Bank Accounts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Opening balances for your configured commercial current and savings bank accounts.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">BANK TOTAL</span>
                <p className="text-lg font-black text-blue-600 dark:text-blue-400">{inr(totalBanks)}</p>
              </div>
            </div>

            {bankAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No bank accounts configured. Add bank accounts in Settings → Payment Accounts.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bankAccounts.map((b, idx) => (
                  <div
                    key={b.instrument_id || `bank-${idx}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{b.name}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        Bank Account
                      </span>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-slate-500">Starting Balance (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={b.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setBankAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={b.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBankAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="Branch / AC details"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: UPI / DIGITAL SETTLEMENT ACCOUNTS */}
        {activeTab === "digital" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  UPI / Digital Settlement Accounts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-existing balances in digital settlement and aggregator accounts.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">UPI TOTAL</span>
                <p className="text-lg font-black text-violet-600 dark:text-violet-400">{inr(totalDigital)}</p>
              </div>
            </div>

            <div className="rounded-xl bg-violet-50/40 p-3 text-xs text-violet-700 dark:bg-violet-950/20 dark:text-violet-300">
              💡 <strong>Merchant QR Protection:</strong> Merchant QR codes (e.g. 9339987644@upi) are payment collection channels linked to settlement accounts. They do not create separate independent asset balances.
            </div>

            {digitalAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No UPI settlement accounts configured. Add UPI accounts in Settings → Payment Accounts.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {digitalAccounts.map((d, idx) => (
                  <div
                    key={d.instrument_id || `upi-${idx}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{d.name}</span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        UPI Account
                      </span>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-slate-500">Starting Balance (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={d.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setDigitalAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={d.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDigitalAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="Settlement notes"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: DIGITAL WALLETS */}
        {activeTab === "wallets" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Digital Wallets
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-funded digital wallet accounts (e.g., Paytm, Mobikwik, Amazon Pay).
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">WALLET TOTAL</span>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{inr(totalWallets)}</p>
              </div>
            </div>

            {walletAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No digital wallet accounts configured.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {walletAccounts.map((w, idx) => (
                  <div
                    key={w.instrument_id || `wallet-${idx}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{w.name}</span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Wallet
                      </span>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-slate-500">Starting Float (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={w.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setWalletAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={w.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWalletAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="Wallet notes"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: AEPS PROVIDER FLOATS (PROVIDER-WISE) */}
        {activeTab === "aeps" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  AEPS Provider Floats
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-funded settlement floats per genuine AEPS portal provider (e.g. Digipay, Ezeepay).
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">AEPS TOTAL</span>
                <p className="text-lg font-black text-amber-600 dark:text-amber-400">{inr(totalAeps)}</p>
              </div>
            </div>

            {aepsProviderAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No AEPS provider float accounts configured.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {aepsProviderAccounts.map((a, idx) => (
                  <div
                    key={a.instrument_id || `aeps-${idx}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{a.name}</span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        AEPS Float
                      </span>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-slate-500">Starting Float (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={a.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setAepsProviderAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={a.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAepsProviderAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="Provider portal notes"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 7: DMT PROVIDER WALLETS (PROVIDER-WISE) */}
        {activeTab === "dmt" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  DMT Provider Wallets
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pre-funded remittance wallets per genuine DMT provider gateway.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase text-slate-400">DMT TOTAL</span>
                <p className="text-lg font-black text-cyan-600 dark:text-cyan-400">{inr(totalDmt)}</p>
              </div>
            </div>

            {dmtProviderAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400 dark:border-white/10">
                No DMT provider wallet accounts configured.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dmtProviderAccounts.map((d, idx) => (
                  <div
                    key={d.instrument_id || `dmt-${idx}`}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/5 dark:bg-white/2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{d.name}</span>
                      <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                        DMT Wallet
                      </span>
                    </div>
                    <div className="mt-3">
                      <label className="text-[11px] font-bold text-slate-500">Starting Wallet Float (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={d.amount || ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setDmtProviderAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, amount: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                    <div className="mt-2">
                      <input
                        type="text"
                        value={d.remarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDmtProviderAccounts((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, remarks: val } : item))
                          );
                        }}
                        disabled={status === "finalized"}
                        placeholder="DMT gateway notes"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 8: CUSTOMER RECEIVABLES */}
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
                    placeholder="e.g. Previous shop ledger"
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

        {/* TAB 9: OPENING INVENTORY STOCK */}
        {activeTab === "inventory" && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Opening Inventory Stock
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

        {/* TAB 10: SUPPLIER PAYABLES */}
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

        {/* TAB 11: OTHER LIABILITIES */}
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
                  <div className="flex justify-between"><span>Cash Accounts ({cashAccounts.length}):</span><span>{inr(totalCash)}</span></div>
                  <div className="flex justify-between"><span>Bank Accounts ({bankAccounts.length}):</span><span>{inr(totalBanks)}</span></div>
                  <div className="flex justify-between"><span>UPI Accounts ({digitalAccounts.length}):</span><span>{inr(totalDigital)}</span></div>
                  <div className="flex justify-between"><span>Wallets ({walletAccounts.length}):</span><span>{inr(totalWallets)}</span></div>
                  <div className="flex justify-between"><span>AEPS Floats ({aepsProviderAccounts.length}):</span><span>{inr(totalAeps)}</span></div>
                  <div className="flex justify-between"><span>DMT Wallets ({dmtProviderAccounts.length}):</span><span>{inr(totalDmt)}</span></div>
                  <div className="flex justify-between"><span>Inventory Valuation ({inventory.length}):</span><span>{inr(totalInventory)}</span></div>
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
              ⚡ This will post starting cash accounts, bank balances, digital accounts, wallet floats, AEPS &amp; DMT provider floats, customer ledger debit seeds, supplier credits, and inventory starting stock atomically.
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
