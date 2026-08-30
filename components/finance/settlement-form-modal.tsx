"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import SearchableSelect from "@/components/ui/searchable-select";
import { inr } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export const SETTLEMENT_TYPES = [
  { value: "aeps_to_bank", label: "AEPS Portal → Bank Account", from: "aeps", to: "bank", icon: "aeps", grad: "from-blue-500 to-indigo-600", desc: "Settle AEPS portal balance (CSC, EzeePay, Spice Money, PayNearby) into bank account." },
  { value: "upi_qr_to_bank", label: "UPI QR → Bank Account", from: "upi_qr", to: "bank", icon: "bank", grad: "from-sky-500 to-blue-600", desc: "Settle merchant QR collections (PhonePe, Google Pay, BharatPe) into bank account." },
  { value: "upi_qr_to_wallet", label: "UPI QR → Digital Wallet", from: "upi_qr", to: "wallet", icon: "qr", grad: "from-teal-500 to-emerald-600", desc: "Move money received on shop UPI QR into digital wallet." },
  { value: "bank_to_dmt", label: "Bank Account → DMT Portal", from: "bank", to: "dmt", icon: "dmt", grad: "from-violet-500 to-purple-600", desc: "Load DMT remittance float from bank balance." },
  { value: "bank_to_wallet", label: "Bank Account → Digital Wallet (Wallet Load)", from: "bank", to: "wallet", icon: "wallet", grad: "from-emerald-500 to-teal-600", desc: "Load digital wallet float (Rupepro, CSC Wallet) from bank balance." },
  { value: "wallet_to_dmt", label: "Wallet → DMT Portal", from: "wallet", to: "dmt", icon: "dmt", grad: "from-fuchsia-500 to-pink-600", desc: "Fund DMT float from digital wallet." },
  { value: "wallet_to_bank", label: "Wallet → Bank Account", from: "wallet", to: "bank", icon: "bank", grad: "from-amber-500 to-orange-600", desc: "Transfer wallet balance to bank account." },
  { value: "bank_withdrawal", label: "Bank Withdrawal (Bank → Cash)", from: "bank", to: "cash", icon: "cash", grad: "from-emerald-500 to-teal-600", desc: "Withdraw physical cash from bank into counter cash drawer." },
  { value: "add_cash_to_bank", label: "Cash Deposit (Cash → Bank)", from: "cash", to: "bank", icon: "bank", grad: "from-sky-500 to-blue-600", desc: "Deposit counter cash into bank account." },
  { value: "cash_adjustment", label: "Cash Drawer Physical Count", from: "cash", to: "cash", icon: "cash", grad: "from-rose-500 to-pink-600", desc: "Add or remove cash during counter physical audit." },
] as const;

export type SettlementType = (typeof SETTLEMENT_TYPES)[number]["value"];

export const POOL_LABEL: Record<string, string> = {
  cash: "Cash in Hand",
  bank: "Bank Balance",
  wallet: "Wallet Balance",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
};

const ICONS: Record<string, string> = {
  bank: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
  cash: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2M14 13h.01",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  card: "M3 10h18M3 6h18v12H3zM7 15h4",
  arrow: "M5 12h14M13 5l7 7-7 7",
};

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
    >
      <path d={d} />
    </svg>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200";

export default function SettlementFormModal({
  open,
  onClose,
  busy,
  initialType,
  initialAmount,
  portals = [],
  qrs = [],
  paymentAccounts = [],
  poolBalances = null,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  initialType?: SettlementType;
  initialAmount?: string | number;
  portals?: { id: string; name: string; payment_instrument_id?: string | null }[];
  qrs?: { id: string; display_name: string; upi_id?: string; payment_instrument_id?: string | null }[];
  paymentAccounts?: { id: string; name: string; type: string; details?: any; is_active?: boolean; opening_balance?: number }[];
  poolBalances?: any;
  onSave: (payload: {
    p_settlement_type: string;
    p_settlement_date: string;
    p_amount: number;
    p_reference: string;
    p_remarks: string;
    p_direction: string;
    p_source_instrument_id?: string | null;
    p_dest_instrument_id?: string | null;
  }) => void;
}) {
  const [type, setType] = useState<SettlementType>(() => initialType ?? "aeps_to_bank");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(() => initialAmount ? String(initialAmount) : "");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [error, setError] = useState("");

  const [sourceId, setSourceId] = useState<string>("");
  const [destId, setDestId] = useState<string>("");
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [loadedPortals, setLoadedPortals] = useState(portals);
  const [loadedQrs, setLoadedQrs] = useState(qrs);
  const [loadedAccounts, setLoadedAccounts] = useState(paymentAccounts);
  const [livePools, setLivePools] = useState<any>(poolBalances);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.rpc("get_pool_balances").then(({ data }) => {
      if (data) setLivePools(data);
    });
    if (loadedPortals.length === 0) {
      supabase.from("aeps_portals").select("*").order("name").then(({ data }) => {
        if (data) setLoadedPortals(data as any);
      });
    }
    if (loadedQrs.length === 0) {
      supabase.from("upi_merchant_qrs").select("*").order("display_name").then(({ data }) => {
        if (data) setLoadedQrs(data as any);
      });
    }
    supabase.from("payment_instruments").select("*").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setLoadedAccounts(data as any);
    });
  }, [open, loadedPortals.length, loadedQrs.length]);

  // Reset source & dest when type changes
  useEffect(() => {
    setSourceId("");
    setDestId("");
    setAvailableBalance(null);
    setError("");
  }, [type]);

  const selected = SETTLEMENT_TYPES.find((t) => t.value === type)!;
  const isAdjustment = type === "cash_adjustment";

  const bankAccounts = loadedAccounts.filter((i) => i.type === "bank" || i.type === "debit_card");
  const wallets = loadedAccounts.filter((i) => i.type === "wallet");
  const aepsPortals = useMemo(() => {
    return loadedPortals.filter((p: any) => {
      if (p.is_active === false) return false;
      const code = (p.code || "").toUpperCase();
      const name = (p.name || "").toUpperCase();
      if (code.includes("DMT") || name.includes("DMT")) return false;
      return true;
    });
  }, [loadedPortals]);

  const dmtPortals = useMemo(() => {
    return loadedPortals.filter((p: any) => {
      if (p.is_active === false) return false;
      const code = (p.code || "").toUpperCase();
      const name = (p.name || "").toUpperCase();
      if (code.includes("DMT") || name.includes("DMT")) return true;
      return false;
    });
  }, [loadedPortals]);

  // Determine what source selector is needed
  const isSourceAepsPortal = type === "aeps_to_bank";
  const isSourceUpiQr = type === "upi_qr_to_bank" || type === "upi_qr_to_wallet";
  const isSourceBank = type === "bank_to_dmt" || type === "bank_withdrawal" || type === "bank_to_wallet";
  const isSourceWallet = type === "wallet_to_dmt" || type === "wallet_to_bank";

  // Determine what dest selector is needed
  const isDestBank = type === "aeps_to_bank" || type === "upi_qr_to_bank" || type === "wallet_to_bank" || type === "add_cash_to_bank";
  const isDestWallet = type === "upi_qr_to_wallet" || type === "bank_to_wallet";
  const isDestDmtPortal = type === "bank_to_dmt" || type === "wallet_to_dmt";

  // Dynamic Current Available Balance Calculation for Selected Source (Strictly Account-Level, ZERO pool fallbacks)
  useEffect(() => {
    if (!open || !sourceId) {
      setAvailableBalance(null);
      return;
    }

    const supabase = createClient();
    setLoadingBalance(true);

    async function fetchLiveBalance() {
      try {
        if (type === "aeps_to_bank") {
          const portalObj = loadedPortals.find((p) => p.id === sourceId || p.payment_instrument_id === sourceId);
          const portalName = (portalObj?.name ?? "").toLowerCase();
          
          // 1. Resolve exact linked financial instrument
          const inst = loadedAccounts.find(
            (i) => i.id === sourceId ||
                   i.id === portalObj?.payment_instrument_id ||
                   ((i.type === "aeps_portal" || i.type === "aeps") && (
                     i.name.toLowerCase().includes(portalName) || portalName.includes(i.name.toLowerCase())
                   ))
          );

          const effectiveInstrumentId = inst?.id || portalObj?.payment_instrument_id || sourceId;
          const effectivePortalId = portalObj?.id || loadedPortals.find(p => p.payment_instrument_id === effectiveInstrumentId)?.id || sourceId;

          // 2. Resolve account-specific opening balance
          const openingBal = Number(inst?.opening_balance ?? 0);
          const seedDate = livePools?.aeps?.seed_date || "0001-01-01";

          // 3. Resolve account-specific transactions and settlements
          const [{ data: txs }, { data: setts }] = await Promise.all([
            supabase
              .from("transactions")
              .select("amount")
              .eq("service_type", "aeps")
              .eq("portal_id", effectivePortalId)
              .gte("transaction_date", seedDate)
              .eq("status", "success"),
            supabase
              .from("settlements")
              .select("amount, source_instrument_id, remarks")
              .eq("from_pool", "aeps")
              .gte("settlement_date", seedDate)
              .eq("status", "success"),
          ]);

          const totalIn = (txs ?? []).reduce((s, t) => s + Number(t.amount || 0), 0);
          const totalOut = (setts ?? [])
            .filter((st: any) => {
              if (st.source_instrument_id && effectiveInstrumentId) {
                return st.source_instrument_id === effectiveInstrumentId;
              }
              return !portalName || (st.remarks ?? "").toLowerCase().includes(portalName);
            })
            .reduce((s, st) => s + Number(st.amount || 0), 0);

          // Account-Level Formula: Opening + Inflows - Outflows (NO fallback to pool total)
          const accountBal = openingBal + totalIn - totalOut;
          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));
        } else if (type === "upi_qr_to_bank" || type === "upi_qr_to_wallet") {
          const qrObj = loadedQrs.find((q) => q.id === sourceId || (q as any).payment_instrument_id === sourceId);
          const qrName = (qrObj?.display_name ?? "").toLowerCase();

          const inst = loadedAccounts.find(
            (i) => i.id === sourceId ||
                   i.id === (qrObj as any)?.payment_instrument_id ||
                   (i.type === "upi" && (
                     i.name.toLowerCase().includes(qrName) || qrName.includes(i.name.toLowerCase())
                   ))
          );

          const effectiveInstrumentId = inst?.id || (qrObj as any)?.payment_instrument_id || sourceId;
          const effectiveQrId = qrObj?.id || loadedQrs.find(q => (q as any).payment_instrument_id === effectiveInstrumentId)?.id || sourceId;

          const openingBal = Number(inst?.opening_balance ?? 0);
          const seedDate = livePools?.upi_qr?.seed_date || "0001-01-01";

          const [{ data: txs }, { data: setts }] = await Promise.all([
            supabase
              .from("transactions")
              .select("amount")
              .eq("service_type", "upi")
              .eq("merchant_qr_id", effectiveQrId)
              .gte("transaction_date", seedDate)
              .eq("status", "success"),
            supabase
              .from("settlements")
              .select("amount, source_instrument_id, remarks")
              .eq("from_pool", "upi_qr")
              .gte("settlement_date", seedDate)
              .eq("status", "success"),
          ]);

          const totalIn = (txs ?? []).reduce((s, t) => s + Number(t.amount || 0), 0);
          const totalOut = (setts ?? [])
            .filter((st: any) => {
              if (st.source_instrument_id && effectiveInstrumentId) {
                return st.source_instrument_id === effectiveInstrumentId;
              }
              return !qrName || (st.remarks ?? "").toLowerCase().includes(qrName);
            })
            .reduce((s, st) => s + Number(st.amount || 0), 0);

          const accountBal = openingBal + totalIn - totalOut;
          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));
        } else if (isSourceWallet) {
          const inst = loadedAccounts.find((i) => i.id === sourceId);
          const openingBal = Number(inst?.opening_balance ?? 0);
          const seedDate = livePools?.wallet?.seed_date || "0001-01-01";

          const { data: ces } = await supabase
            .from("cash_entries")
            .select("direction, amount")
            .eq("instrument_id", sourceId)
            .gte("entry_date", seedDate);

          const flow = (ces ?? []).reduce((acc, c) => acc + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0);
          const accountBal = openingBal + flow;
          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));
        } else if (isSourceBank) {
          const inst = loadedAccounts.find((i) => i.id === sourceId);
          const openingBal = Number(inst?.opening_balance ?? 0);
          const seedDate = livePools?.bank?.seed_date || "0001-01-01";

          const { data: ces } = await supabase
            .from("cash_entries")
            .select("direction, amount")
            .eq("instrument_id", sourceId)
            .gte("entry_date", seedDate);

          const flow = (ces ?? []).reduce((acc, c) => acc + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0);
          const accountBal = openingBal + flow;
          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));
        } else if (type === "add_cash_to_bank" || type === "cash_adjustment") {
          const inst = loadedAccounts.find((i) => i.type === "cash");
          const openingBal = Number(inst?.opening_balance ?? 0);
          const seedDate = livePools?.cash?.seed_date || "0001-01-01";

          const { data: ces } = await supabase
            .from("cash_entries")
            .select("direction, amount")
            .eq("method", "cash")
            .gte("entry_date", seedDate);

          const flow = (ces ?? []).reduce((acc, c) => acc + (c.direction === "in" ? Number(c.amount) : -Number(c.amount)), 0);
          const accountBal = openingBal + flow;
          setAvailableBalance(Math.max(0, Math.round(accountBal * 100) / 100));
        }
      } catch (err) {
        console.error("Error computing source balance:", err);
      } finally {
        setLoadingBalance(false);
      }
    }

    fetchLiveBalance();
  }, [open, sourceId, type, loadedPortals, loadedQrs, loadedAccounts, livePools, isSourceBank, isSourceWallet]);

  if (!open) return null;

  const submit = () => {
    setError("");
    if (!date) return setError("Settlement date is required.");
    const amt = Number(amount);
    
    // Strict Positive Transfer Guard
    if (isNaN(amt) || amt <= 0) {
      return setError("Transfer amount must be a positive number greater than ₹0.00. Zero or negative amounts are strictly blocked.");
    }

    // Insufficient Funds Guard against Account-Level Available Balance
    if (availableBalance !== null && availableBalance >= 0 && amt > availableBalance) {
      return setError(`Insufficient funds in selected account. Available: ${inr(availableBalance)}, Requested: ${inr(amt)}`);
    }

    // Mandatory Source Validation & Instrument Resolution
    let sourceLabel = "";
    let sourceInstrumentId = sourceId || null;

    if (isSourceAepsPortal) {
      if (!sourceId) return setError("Please select the AEPS Portal (e.g. Digipay, Ezeepay) that was settled.");
      const p = loadedPortals.find((x) => x.id === sourceId || x.payment_instrument_id === sourceId);
      sourceLabel = p ? `Portal: ${p.name}` : "AEPS Portal";
      sourceInstrumentId = p?.payment_instrument_id || loadedAccounts.find(
        (i) => i.id === sourceId || (
          (i.type === "aeps_portal" || i.type === "aeps") && (
            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())
          )
        )
      )?.id || sourceId;
    } else if (isSourceUpiQr) {
      if (!sourceId) return setError("Please select the Merchant QR (e.g. PhonePe QR, Google Pay QR) being settled.");
      const q = loadedQrs.find((x) => x.id === sourceId || (x as any).payment_instrument_id === sourceId);
      sourceLabel = q ? `QR: ${q.display_name}` : "UPI QR";
      sourceInstrumentId = (q as any)?.payment_instrument_id || loadedAccounts.find(
        (i) => i.id === sourceId || (
          i.type === "upi" && (
            i.name.toLowerCase().includes((q?.display_name || "").toLowerCase()) || (q?.display_name || "").toLowerCase().includes(i.name.toLowerCase())
          )
        )
      )?.id || sourceId;
    } else if (isSourceBank) {
      if (!sourceId) return setError("Please select the Source Bank Account debited.");
      const b = bankAccounts.find((x) => x.id === sourceId);
      sourceLabel = b ? `Bank: ${b.name}` : "Bank Account";
    } else if (isSourceWallet) {
      if (!sourceId) return setError("Please select the Digital Wallet debited.");
      const w = wallets.find((x) => x.id === sourceId);
      sourceLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";
    }

    // Mandatory Destination Validation & Instrument Resolution
    let destLabel = "";
    let destInstrumentId = destId || null;

    if (isDestBank) {
      if (!destId) return setError("Please select the Destination Bank Account credited.");
      const b = bankAccounts.find((x) => x.id === destId);
      const acc = b?.details?.account_number ? ` (••••${String(b.details.account_number).slice(-4)})` : "";
      destLabel = b ? `Bank: ${b.name}${acc}` : "Bank Account";
    } else if (isDestWallet) {
      if (!destId) return setError("Please select the Destination Digital Wallet.");
      const w = wallets.find((x) => x.id === destId);
      destLabel = w ? `Wallet: ${w.name}` : "Digital Wallet";
    } else if (isDestDmtPortal) {
      if (!destId) return setError("Please select the DMT Portal receiving float.");
      const p = loadedPortals.find((x) => x.id === destId || x.payment_instrument_id === destId);
      destLabel = p ? `DMT: ${p.name}` : "DMT Portal";
      destInstrumentId = p?.payment_instrument_id || loadedAccounts.find(
        (i) => i.id === destId || (
          (i.type === "dmt_portal" || i.type === "dmt") && (
            i.name.toLowerCase().includes((p?.name || "").toLowerCase()) || (p?.name || "").toLowerCase().includes(i.name.toLowerCase())
          )
        )
      )?.id || destId;
    }

    // Auto-generate routing remarks
    let routingTag = "";
    if (sourceLabel && destLabel) {
      routingTag = `[${sourceLabel} ➔ ${destLabel}]`;
    } else if (sourceLabel) {
      routingTag = `[${sourceLabel}]`;
    } else if (destLabel) {
      routingTag = `[${destLabel}]`;
    }

    const finalRemarks = remarks.trim()
      ? `${routingTag} ${remarks.trim()}`
      : routingTag;

    onSave({
      p_settlement_type: type,
      p_settlement_date: date,
      p_amount: Math.round(amt * 100) / 100,
      p_reference: reference.trim() || (sourceLabel ? `Ref: ${sourceLabel}` : ""),
      p_remarks: finalRemarks,
      p_direction: isAdjustment ? direction : "",
      p_source_instrument_id: sourceInstrumentId,
      p_dest_instrument_id: destInstrumentId,
    });
  };

  return (
    <Modal
      onClose={onClose}
      size="xl"
      title="Record Account Settlement & Fund Shift"
      subtitle="Track exact portal-to-bank and wallet movements with complete audit routing."
    >
      <div className="space-y-5 p-1">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-400">
            ⚠️ {error}
          </div>
        )}

        {/* 1. Settlement Type Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            1. Select Settlement & Fund Movement Type *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {SETTLEMENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value as SettlementType)}
                className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  type === t.value
                    ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 dark:border-blue-500 dark:bg-blue-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
                }`}
              >
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.grad} text-white shadow-sm`}>
                  <Icon d={ICONS[t.icon] || ICONS.bank} className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{t.label}</div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Detailed Portal & Account Routing */}
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
              2. Specific Account & Portal Routing (Required)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source Selector */}
            {isSourceAepsPortal && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Source AEPS Portal *
                </label>
                <SearchableSelect
                  value={sourceId}
                  onChange={(v) => setSourceId(v)}
                  options={[
                    { value: "", label: "Select AEPS Portal..." },
                    ...aepsPortals.map((p) => ({ value: p.id, label: `🏢 ${p.name}` })),
                  ]}
                  placeholder="Choose Portal (CSC, EzeePay, Spice)..."
                  showClear={false}
                />
              </div>
            )}

            {isSourceUpiQr && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Source Merchant QR *
                </label>
                <SearchableSelect
                  value={sourceId}
                  onChange={(v) => setSourceId(v)}
                  options={[
                    { value: "", label: "Select Merchant QR..." },
                    ...loadedQrs.map((q) => ({ value: q.id, label: `📲 ${q.display_name} (${q.upi_id || "QR"})` })),
                  ]}
                  placeholder="Choose QR (PhonePe, GPay, BharatPe)..."
                  showClear={false}
                />
              </div>
            )}

            {isSourceBank && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Source Bank Account *
                </label>
                <SearchableSelect
                  value={sourceId}
                  onChange={(v) => setSourceId(v)}
                  options={[
                    { value: "", label: "Select Bank Account..." },
                    ...bankAccounts.map((b) => ({
                      value: b.id,
                      label: `🏦 ${b.name}${b.details?.account_number ? ` (••••${String(b.details.account_number).slice(-4)})` : ""}`,
                    })),
                  ]}
                  placeholder="Choose Source Bank..."
                  showClear={false}
                />
              </div>
            )}

            {isSourceWallet && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Source Digital Wallet *
                </label>
                <SearchableSelect
                  value={sourceId}
                  onChange={(v) => setSourceId(v)}
                  options={[
                    { value: "", label: "Select Digital Wallet..." },
                    ...wallets.map((w) => ({ value: w.id, label: `👛 ${w.name}` })),
                  ]}
                  placeholder="Choose Source Wallet..."
                  showClear={false}
                />
              </div>
            )}



            {/* Destination Selector */}
            {isDestBank && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Destination Bank Account *
                </label>
                <SearchableSelect
                  value={destId}
                  onChange={(v) => setDestId(v)}
                  options={[
                    { value: "", label: "Select Destination Bank..." },
                    ...bankAccounts.map((b) => ({
                      value: b.id,
                      label: `🏦 ${b.name}${b.details?.account_number ? ` (••••${String(b.details.account_number).slice(-4)})` : ""}`,
                    })),
                  ]}
                  placeholder="Choose Destination Bank Account..."
                  showClear={false}
                />
              </div>
            )}


            {isDestWallet && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Destination Digital Wallet *
                </label>
                <SearchableSelect
                  value={destId}
                  onChange={(v) => setDestId(v)}
                  options={[
                    { value: "", label: "Select Destination Wallet..." },
                    ...wallets.map((w) => ({ value: w.id, label: `👛 ${w.name}` })),
                  ]}
                  placeholder="Choose Destination Wallet..."
                  showClear={false}
                />
              </div>
            )}

            {isDestDmtPortal && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Destination DMT Portal *
                </label>
                <SearchableSelect
                  value={destId}
                  onChange={(v) => setDestId(v)}
                  options={[
                    { value: "", label: "Select DMT Portal..." },
                    ...dmtPortals.map((p) => ({ value: p.id, label: `🏢 ${p.name}` })),
                  ]}
                  placeholder="Choose DMT Portal..."
                  showClear={false}
                />
              </div>
            )}
          </div>

          {/* Current Available Balance & Quick Fill Helper */}
          {sourceId && (
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-3 dark:border-blue-900/40 dark:bg-blue-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Current Available Balance: </span>
                  {loadingBalance ? (
                    <span className="font-mono text-slate-400">Loading…</span>
                  ) : availableBalance !== null ? (
                    <span className={`font-mono font-bold text-sm ${availableBalance <= 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-300"}`}>
                      {inr(availableBalance)}
                    </span>
                  ) : (
                    <span className="font-mono text-slate-400">₹0.00</span>
                  )}
                </div>

                {availableBalance !== null && availableBalance > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.round(availableBalance * 0.25 * 100) / 100))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.round(availableBalance * 0.50 * 100) / 100))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.round(availableBalance * 100) / 100))}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-500"
                    >
                      100% Full ({inr(availableBalance)})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. Transaction Details & Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Settlement Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Transfer Amount (₹) *
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00 (Positive amount only)"
              className={inputClass}
            />
            {Number(amount) > 0 && availableBalance !== null && Number(amount) > availableBalance && (
              <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                ⚠️ Notice: Transfer amount ({inr(Number(amount))}) exceeds available balance ({inr(availableBalance)}).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Bank UTR / Reference No (Optional)
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR123456789"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              Additional Remarks (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Instant IMPS payout"
              className={inputClass}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Recording Settlement…" : "Record Settlement"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
