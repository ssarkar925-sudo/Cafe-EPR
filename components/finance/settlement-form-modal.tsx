"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";

export const SETTLEMENT_TYPES = [
  { value: "aeps_to_bank", label: "AEPS → Bank", from: "aeps", to: "bank", icon: "aeps", grad: "from-blue-500 to-indigo-600", desc: "AEPS portal settlement credited to the bank account." },
  { value: "bank_to_dmt", label: "Bank → DMT", from: "bank", to: "dmt", icon: "dmt", grad: "from-violet-500 to-purple-600", desc: "Load DMT float from the bank balance." },
  { value: "wallet_to_dmt", label: "Wallet → DMT", from: "wallet", to: "dmt", icon: "dmt", grad: "from-fuchsia-500 to-pink-600", desc: "Fund the DMT float from the digital wallet." },
  { value: "upi_qr_to_wallet", label: "UPI QR → Wallet", from: "upi_qr", to: "wallet", icon: "qr", grad: "from-teal-500 to-emerald-600", desc: "Move money received on the shop UPI QR into the wallet." },
  { value: "upi_qr_to_bank", label: "UPI QR → Bank", from: "upi_qr", to: "bank", icon: "bank", grad: "from-sky-500 to-blue-600", desc: "Settle the merchant QR wallet balance into the bank account." },
  { value: "wallet_to_bank", label: "Wallet → Bank", from: "wallet", to: "bank", icon: "bank", grad: "from-amber-500 to-orange-600", desc: "Transfer wallet balance to the bank account." },
  { value: "bank_to_credit_card", label: "Bank → Credit Card (Bill Payment)", from: "bank", to: "credit_card", icon: "card", grad: "from-cyan-500 to-sky-600", desc: "Pay Credit Card bill from bank account to restore available credit limit." },
  { value: "cash_to_credit_card", label: "Cash → Credit Card (Bill Payment)", from: "cash", to: "credit_card", icon: "card", grad: "from-emerald-500 to-cyan-600", desc: "Pay Credit Card bill using counter cash to restore available credit limit." },
  { value: "credit_card_to_bank", label: "Credit Card → Bank (Cash Advance)", from: "credit_card", to: "bank", icon: "bank", grad: "from-blue-600 to-indigo-700", desc: "Transfer credit card payout/advance to bank account." },
  { value: "bank_withdrawal", label: "Bank Withdrawal", from: "bank", to: "cash", icon: "cash", grad: "from-emerald-500 to-teal-600", desc: "Withdraw cash from the bank into the counter." },
  { value: "add_cash_to_bank", label: "Cash → Bank", from: "cash", to: "bank", icon: "bank", grad: "from-sky-500 to-blue-600", desc: "Deposit counter cash into the bank account." },
  { value: "cash_adjustment", label: "Cash Adjustment", from: "cash", to: "cash", icon: "cash", grad: "from-rose-500 to-pink-600", desc: "Add or remove cash during a physical count." },
  { value: "bank_to_recharge", label: "Bank → Recharge", from: "bank", to: "recharge", icon: "recharge", grad: "from-cyan-500 to-sky-600", desc: "Load the recharge float from the bank balance." },
  { value: "recharge_to_bank", label: "Recharge → Bank", from: "recharge", to: "bank", icon: "bank", grad: "from-slate-500 to-slate-700", desc: "Move unused recharge float back to the bank." },
] as const;

export type SettlementType = (typeof SETTLEMENT_TYPES)[number]["value"];

export const POOL_LABEL: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  wallet: "Wallet",
  dmt: "DMT Float",
  aeps: "AEPS Float",
  upi_qr: "UPI QR",
  recharge: "Recharge Float",
  credit_card: "Credit Card",
};

const ICONS: Record<string, string> = {
  bank: "M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01",
  cash: "M2 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm10-3V5H4a2 2 0 0 0-2 2M14 13h.01",
  dmt: "M22 2 11 13M22 2 15 22l-4-9-9-4z",
  aeps: "M4 10h16M4 14h16M6 18V7m4 11V7m4 11V7M2 7l10-5 10 5z",
  qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14h1M14 20h1M20 20h1",
  recharge: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
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
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export default function SettlementFormModal({
  open,
  onClose,
  busy,
  initialType,
  initialAmount,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  initialType?: SettlementType;
  initialAmount?: string | number;
  onSave: (payload: {
    p_settlement_type: string;
    p_settlement_date: string;
    p_amount: number;
    p_reference: string;
    p_remarks: string;
    p_direction: string;
  }) => void;
}) {
  const [type, setType] = useState<SettlementType>(() => initialType ?? "bank_withdrawal");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(() => initialAmount ? String(initialAmount) : "");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [error, setError] = useState("");

  const [instruments, setInstruments] = useState<{ id: string; name: string; type: string; details?: any }[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [selectedBankId, setSelectedBankId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from("payment_instruments")
      .select("id, name, type, details, is_active")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setInstruments(data as any);
      });
  }, [open]);

  if (!open) return null;

  const selected = SETTLEMENT_TYPES.find((t) => t.value === type)!;
  const isAdjustment = type === "cash_adjustment";
  const isCCRelated = type === "bank_to_credit_card" || type === "cash_to_credit_card" || type === "credit_card_to_bank";

  const creditCards = instruments.filter((i) => i.type === "credit_card");
  const bankAccounts = instruments.filter((i) => i.type === "bank" || i.type === "debit_card");

  const handleSelectCreditCard = (card: { id: string; name: string; details?: any }) => {
    setSelectedCardId(card.id);
    const last4 = card.details?.card_last4 ? ` (ending ${card.details.card_last4})` : "";
    const cardRef = `${card.name}${last4}`;
    if (!reference || reference.includes("Credit Card")) {
      setReference(`Card: ${cardRef}`);
    }
  };

  const handleSelectBank = (bank: { id: string; name: string; details?: any }) => {
    setSelectedBankId(bank.id);
    const ac = bank.details?.account_number ? ` (A/C: ${bank.details.account_number.slice(-4)})` : "";
    const bankNote = `Paid from ${bank.name}${ac}`;
    if (!remarks) {
      setRemarks(bankNote);
    }
  };

  const submit = () => {
    setError("");
    if (!date) return setError("Settlement date is required.");
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("Amount must be greater than zero.");
    onSave({
      p_settlement_type: type,
      p_settlement_date: date,
      p_amount: Math.round(amt * 100) / 100,
      p_reference: reference.trim(),
      p_remarks: remarks.trim(),
      p_direction: isAdjustment ? direction : "",
    });
  };

  return (
    <Modal
      onClose={onClose}
      size="xl"
      header={
        <div className="relative shrink-0 bg-gradient-to-r from-[#0f172a] via-[#1e293b] to-[#020617] px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">New Settlement</h2>
              <p className="mt-0.5 text-xs text-[#94a3b8]">
                Record an internal fund transfer between cash, bank &amp; wallets.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg bg-white/10 p-1.5 text-[#cbd5e1] transition hover:bg-white/20 hover:text-white"
            >
              <Icon d="M6 6l12 12M18 6L6 18" className="h-4 w-4" />
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Record Settlement"}
          </button>
        </div>
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Settlement type
      </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SETTLEMENT_TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20"
                      : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${t.grad} text-white shadow`}
                  >
                    <Icon d={ICONS[t.icon]} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-sm font-semibold ${
                        active ? "text-blue-700" : "text-slate-800"
                      }`}
                    >
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {POOL_LABEL[t.from]} → {POOL_LABEL[t.to]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-3 text-sm text-slate-600">
            <Icon d={ICONS.arrow} className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-slate-800">
              {POOL_LABEL[selected.from]} → {POOL_LABEL[selected.to]}
            </span>
            <span className="hidden text-xs text-slate-400 sm:inline">
              · {selected.desc}
            </span>
          </div>

          {isAdjustment && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Adjustment type
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setDirection("in")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    direction === "in"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  Add Cash (Found extra)
                </button>
                <button
                  onClick={() => setDirection("out")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    direction === "out"
                      ? "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  Remove Cash (Shortage)
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={`mt-1.5 ${inputClass}`}
              />
            </div>
          </div>

          {/* Credit Card Selector for CC Bill Payment */}
          {isCCRelated && creditCards.length > 0 && (
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/50 p-3 dark:border-cyan-900/40 dark:bg-cyan-950/20">
              <label className="text-xs font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300">
                💳 Select Credit Card (Bill Target):
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {creditCards.map((c) => {
                  const active = selectedCardId === c.id;
                  const last4 = c.details?.card_last4 ? ` •••• ${c.details.card_last4}` : "";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCreditCard(c)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-cyan-500 bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-500/30"
                          : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                      }`}
                    >
                      <span>💳</span>
                      <span>{c.name}{last4}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paid From Bank Account Selector */}
          {(type === "bank_to_credit_card" || type === "bank_to_dmt" || type === "bank_to_recharge" || type === "bank_withdrawal") && bankAccounts.length > 0 && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <label className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                🏦 Select Source Bank Account (Paid From):
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {bankAccounts.map((b) => {
                  const active = selectedBankId === b.id;
                  const ac = b.details?.account_number ? ` •••• ${b.details.account_number.slice(-4)}` : "";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBank(b)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "border-blue-500 bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/30"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
                      }`}
                    >
                      <span>🏦</span>
                      <span>{b.name}{ac}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Reference / Card / UTR
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. HDFC Regalia (ending 4321) / UTR 329482934"
              className={`mt-1.5 ${inputClass}`}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Remarks / Payment Note
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Paid via Netbanking / BillDesk / SBI Current A/C"
              className={`mt-1.5 ${inputClass} resize-none`}
            />
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}
    </Modal>
  );
}
