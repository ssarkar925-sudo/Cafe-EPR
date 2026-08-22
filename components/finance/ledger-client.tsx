"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";
import StatCard from "@/components/ui/stat-card";
import CompactToggle from "@/components/ui/compact-toggle";
import Modal from "@/components/ui/modal";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/components/ui/csv";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export type LedgerCustomer = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  balance: number | string;
};

type LedgerRow = {
  id: string;
  entry_date: string;
  type: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  balance_after: number | string;
  created_at: string;
};

const TYPE_COLOR: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  payment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  return: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  advance: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  adjustment: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  recharge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  dmt: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function LedgerClient({ customers: initialCustomers }: { customers: LedgerCustomer[] }) {
  const searchParams = useSearchParams();
  const queryCustomer = searchParams?.get("customer") ?? "";
  const supabase = createClient();
  const [customers, setCustomers] = useState<LedgerCustomer[]>(initialCustomers);
  const [customerId, setCustomerId] = useState<string>(() => {
    if (queryCustomer && initialCustomers.some((c) => c.id === queryCustomer)) {
      return queryCustomer;
    }
    return initialCustomers[0]?.id ?? "";
  });
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(false);
  const { showToast, toastView } = useToast();

  // Payment Collection Modal State
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payRemarks, setPayRemarks] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  // Manual Adjustment Modal State
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustDirection, setAdjustDirection] = useState<"credit" | "debit">("credit");
  const [adjustType, setAdjustType] = useState<"adjustment" | "discount" | "opening">("adjustment");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDate, setAdjustDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  async function loadCustomerLedger(cId: string) {
    if (!cId) {
      setRows([]);
      setUnpaidInvoices([]);
      return;
    }
    setLoading(true);
    const [{ data: ledgerData }, { data: custData }, { data: invData }] = await Promise.all([
      supabase
        .from("customer_ledger")
        .select("*")
        .eq("customer_id", cId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("customers")
        .select("id, name, code, phone, balance")
        .eq("id", cId)
        .single(),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, paid, due, status, invoice_date")
        .eq("customer_id", cId)
        .in("status", ["unpaid", "partial"])
        .order("invoice_date", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setRows((ledgerData ?? []) as LedgerRow[]);
    setUnpaidInvoices(invData ?? []);
    if (custData) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === cId ? { ...c, balance: (custData as any).balance } : c))
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCustomerLedger(customerId);
  }, [customerId]);

  const selected = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const agingSummary = useMemo(() => {
    const now = new Date().getTime();
    let current = 0; // 0-7 days
    let d8_15 = 0; // 8-15 days
    let d16_30 = 0; // 16-30 days
    let d30_plus = 0; // 30+ days

    for (const inv of unpaidInvoices) {
      const due = Number(inv.due ?? (Number(inv.total) - Number(inv.paid || 0)));
      if (due <= 0) continue;
      const invDate = new Date(inv.invoice_date || "").getTime();
      const diffDays = isNaN(invDate) ? 0 : Math.max(0, Math.floor((now - invDate) / (1000 * 60 * 60 * 24)));
      if (diffDays <= 7) current += due;
      else if (diffDays <= 15) d8_15 += due;
      else if (diffDays <= 30) d16_30 += due;
      else d30_plus += due;
    }
    const total = current + d8_15 + d16_30 + d30_plus;
    return { current, d8_15, d16_30, d30_plus, total, count: unpaidInvoices.length };
  }, [unpaidInvoices]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.description ?? "").toLowerCase().includes(needle) ||
        r.type.toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const summary = useMemo(() => {
    const debit = filtered.reduce((s, r) => s + Number(r.debit), 0);
    const credit = filtered.reduce((s, r) => s + Number(r.credit), 0);
    const closing = filtered.length ? Number(filtered[0].balance_after) : Number(selected?.balance ?? 0);
    return { debit, credit, closing };
  }, [filtered, selected]);

  function exportCsv() {
    downloadCsv(
      `ledger-${(selected?.code ?? customerId).replace(/[^a-z0-9-]/gi, "")}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Date", "Type", "Description", "Debit", "Credit", "Balance"],
      filtered.map((r) => [r.entry_date, r.type, r.description ?? "-", Number(r.debit), Number(r.credit), Number(r.balance_after)])
    );
    showToast("success", `Exported ${filtered.length} ledger entries for ${selected?.name ?? "customer"}`);
  }

  async function handleRecordPayment() {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      showToast("error", "Please enter a valid positive payment amount.");
      return;
    }
    setPayBusy(true);
    let { error } = await supabase.rpc("adjust_customer_ledger", {
      p_customer_id: customerId,
      p_entry_date: payDate,
      p_type: "payment",
      p_direction: "credit",
      p_amount: amt,
      p_method: payMethod,
      p_description: payRemarks.trim() || `Payment received via ${payMethod.toUpperCase()}`,
    });

    // Resilient fallback if RPC function is not yet created in Supabase
    if (error && (error.message.includes("Could not find the function") || error.code === "PGRST202")) {
      const currentBal = Number(selected?.balance ?? 0);
      const newBal = currentBal - amt;
      const { error: custErr } = await supabase
        .from("customers")
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq("id", customerId);
      if (custErr) {
        setPayBusy(false);
        showToast("error", custErr.message);
        return;
      }
      const { data: lEntry, error: ledgErr } = await supabase
        .from("customer_ledger")
        .insert({
          customer_id: customerId,
          entry_date: payDate,
          type: "payment",
          description: payRemarks.trim() || `Payment received (${payMethod.toUpperCase()})`,
          debit: 0,
          credit: amt,
          balance_after: newBal,
        })
        .select("id")
        .single();
      if (ledgErr) {
        setPayBusy(false);
        showToast("error", ledgErr.message);
        return;
      }
      await supabase.from("cash_entries").insert({
        entry_date: payDate,
        method: payMethod,
        direction: "in",
        amount: amt,
        description: `Payment received from ${selected?.name || "Customer"}`,
        ref_type: "customer_payment",
        ref_id: lEntry?.id || customerId,
      });
      error = null;
    }

    // Automated FIFO Invoice Allocation across unpaid/partial invoices
    if (!error && unpaidInvoices.length > 0) {
      let remaining = amt;
      for (const inv of unpaidInvoices) {
        if (remaining <= 0) break;
        const invTotal = Number(inv.total);
        const invPaid = Number(inv.paid || 0);
        const invDue = Number(inv.due ?? (invTotal - invPaid));
        if (invDue <= 0) continue;

        const applied = Math.min(remaining, invDue);
        const newPaid = invPaid + applied;
        const newDue = Math.max(0, invTotal - newPaid);
        const newStatus = newDue <= 0.001 ? "paid" : "partial";

        await Promise.all([
          supabase.from("payments").insert({
            invoice_id: inv.id,
            amount: applied,
            method: payMethod,
            received_at: `${payDate}T${new Date().toISOString().slice(11, 19)}`,
            note: payRemarks.trim() ? `FIFO: ${payRemarks.trim()}` : `Auto FIFO Settlement from Customer Ledger`,
          }),
          supabase.from("invoices").update({
            paid: newPaid,
            due: newDue,
            status: newStatus,
            updated_at: new Date().toISOString(),
          }).eq("id", inv.id),
        ]);

        remaining -= applied;
      }
    }

    setPayBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `Recorded payment of ${inr(amt)} for ${selected?.name}.`);
    setPayModal(false);
    setPayAmount("");
    setPayRemarks("");
    await loadCustomerLedger(customerId);
  }

  async function handleRecordAdjustment() {
    const amt = Number(adjustAmount);
    if (!amt || amt <= 0) {
      showToast("error", "Please enter a valid positive adjustment amount.");
      return;
    }
    if (!adjustRemarks.trim()) {
      showToast("error", "Please provide a reason/remark for the manual adjustment.");
      return;
    }
    setAdjustBusy(true);
    const desc = `${adjustType === "discount" ? "Discount/Write-off" : adjustType === "opening" ? "Opening Balance Correction" : "Adjustment"}: ${adjustRemarks.trim()}`;
    let { error } = await supabase.rpc("adjust_customer_ledger", {
      p_customer_id: customerId,
      p_entry_date: adjustDate,
      p_type: "adjustment",
      p_direction: adjustDirection,
      p_amount: amt,
      p_method: "cash",
      p_description: desc,
    });

    // Resilient fallback if RPC function is not yet created in Supabase
    if (error && (error.message.includes("Could not find the function") || error.code === "PGRST202")) {
      const isCredit = adjustDirection === "credit";
      const currentBal = Number(selected?.balance ?? 0);
      const newBal = isCredit ? currentBal - amt : currentBal + amt;
      const { error: custErr } = await supabase
        .from("customers")
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq("id", customerId);
      if (custErr) {
        setAdjustBusy(false);
        showToast("error", custErr.message);
        return;
      }
      const { error: ledgErr } = await supabase.from("customer_ledger").insert({
        customer_id: customerId,
        entry_date: adjustDate,
        type: "adjustment",
        description: desc,
        debit: isCredit ? 0 : amt,
        credit: isCredit ? amt : 0,
        balance_after: newBal,
      });
      if (ledgErr) {
        setAdjustBusy(false);
        showToast("error", ledgErr.message);
        return;
      }
      error = null;
    }

    setAdjustBusy(false);
    if (error) {
      showToast("error", error.message);
      return;
    }
    showToast("success", `Ledger adjusted by ${inr(amt)} (${adjustDirection === "credit" ? "Reduced Due" : "Increased Due"}).`);
    setAdjustModal(false);
    setAdjustAmount("");
    setAdjustRemarks("");
    await loadCustomerLedger(customerId);
  }

  const whatsappLink = useMemo(() => {
    if (!selected) return "";
    const phone = (selected.phone || "").replace(/[^0-9]/g, "");
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;
    let agingTxt = "";
    if (agingSummary.d30_plus > 0 || agingSummary.d16_30 > 0) {
      agingTxt = `\n• Overdue (>15 days): ${inr(agingSummary.d16_30 + agingSummary.d30_plus)}`;
    }
    const msg = `Dear ${selected.name},\n\nHere is your current Account Statement with Cafe:\n• Total Debited/Invoiced: ${inr(summary.debit)}\n• Total Paid: ${inr(summary.credit)}\n• Current Outstanding Due: ${inr(Number(selected.balance))}${agingTxt}\n\nPlease clear your balance at your earliest convenience.\nThank you!`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
  }, [selected, summary, agingSummary]);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Customer Ledger &amp; Due Manager</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Running statement for each customer — collect dues, apply adjustments, and track credit history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPayAmount(Number(selected.balance) > 0 ? String(selected.balance) : "");
                  setPayModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Collect Payment
              </button>

              <button
                type="button"
                onClick={() => setAdjustModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Adjust / Correct
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!selected) return;
                  const phone = (selected.phone || "").replace(/[^0-9]/g, "");
                  let agingTxt = "";
                  if (agingSummary.d30_plus > 0 || agingSummary.d16_30 > 0) {
                    agingTxt = `\n• Overdue (>15 days): ${inr(agingSummary.d16_30 + agingSummary.d30_plus)}`;
                  }
                  const msg = `Dear ${selected.name},\n\nHere is your current Account Statement with Cafe:\n• Total Debited/Invoiced: ${inr(summary.debit)}\n• Total Paid: ${inr(summary.credit)}\n• Current Outstanding Due: ${inr(Number(selected.balance))}${agingTxt}\n\nPlease clear your balance at your earliest convenience.\nThank you!`;

                  showToast("info", "Sending statement via WhatsApp...");
                  const res = await sendWhatsAppMessage({ phone, message: msg });
                  if (res.ok) {
                    showToast("success", `✓ Statement sent to ${selected.name} via WhatsApp!`);
                  } else {
                    window.open(res.fallbackUrl, "_blank", "noopener");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                WhatsApp Statement
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 14h12v8H6z" />
                </svg>
                Print
              </button>
              <Link
                href={`/customers/${selected.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Customer Profile
              </Link>
            </>
          )}

          <button
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchableSelect
            value={customerId}
            onChange={setCustomerId}
            options={customers.map((c) => ({
              value: c.id,
              label: `${c.name} (${c.code ?? "-"})${c.phone ? ` · ${c.phone}` : ""}`,
            }))}
            placeholder="Select customer…"
            searchPlaceholder="Search customer…"
            showClear={false}
            className="w-full max-w-sm"
          />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 dark:bg-white/5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Live Balance</span>
              <span className={`text-base font-bold ${Number(selected?.balance ?? 0) > 0 ? "text-rose-600" : Number(selected?.balance ?? 0) < 0 ? "text-emerald-600" : "text-slate-800 dark:text-slate-200"}`}>
                {inr(selected?.balance ?? 0)}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {Number(selected?.balance ?? 0) > 0 ? "(Payable Due)" : Number(selected?.balance ?? 0) < 0 ? "(Advance Credit)" : "(Settled)"}
              </span>
            </div>
            <CompactToggle value={compact} onChange={setCompact} storageKey="sccomm-ledger-compact" />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Debited"
          value={inr(summary.debit)}
          sub="Sales & advances billed"
          icon="M12 15V3m0 12 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-rose-500 to-pink-600"
        />
        <StatCard
          label="Total Credited"
          value={inr(summary.credit)}
          sub="Payments received"
          icon="M12 3v12m0 0 4-4m-4 4-4-4M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"
          grad="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Closing Balance"
          value={inr(summary.closing)}
          sub="Current net due position"
          icon="M12 3v18M8 7h7a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h7"
          grad={Number(summary.closing) > 0 ? "from-rose-500 to-orange-600" : "from-blue-500 to-indigo-600"}
        />
        <StatCard
          label="Entries"
          value={String(filtered.length)}
          sub={`${filtered.length} of ${rows.length} rows`}
          icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          grad="from-violet-500 to-purple-600"
        />
      </div>

      {/* Due Aging Analysis Widget */}
      {Number(selected?.balance ?? 0) > 0 && agingSummary.total > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Due Aging Breakdown ({agingSummary.count} unpaid bills)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Chronological aging of customer's unpaid balances</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                0–7 Days: {inr(agingSummary.current)}
              </span>
              <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                8–15 Days: {inr(agingSummary.d8_15)}
              </span>
              <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                16–30 Days: {inr(agingSummary.d16_30)}
              </span>
              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                30+ Days (Critical): {inr(agingSummary.d30_plus)}
              </span>
            </div>
          </div>
          {/* Visual aging bar */}
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
            {agingSummary.current > 0 && (
              <div style={{ width: `${(agingSummary.current / agingSummary.total) * 100}%` }} className="bg-emerald-500" title={`0-7 Days: ${inr(agingSummary.current)}`} />
            )}
            {agingSummary.d8_15 > 0 && (
              <div style={{ width: `${(agingSummary.d8_15 / agingSummary.total) * 100}%` }} className="bg-amber-500" title={`8-15 Days: ${inr(agingSummary.d8_15)}`} />
            )}
            {agingSummary.d16_30 > 0 && (
              <div style={{ width: `${(agingSummary.d16_30 / agingSummary.total) * 100}%` }} className="bg-orange-500" title={`16-30 Days: ${inr(agingSummary.d16_30)}`} />
            )}
            {agingSummary.d30_plus > 0 && (
              <div style={{ width: `${(agingSummary.d30_plus / agingSummary.total) * 100}%` }} className="bg-rose-500" title={`30+ Days: ${inr(agingSummary.d30_plus)}`} />
            )}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or type…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-white/10">
        <table className={`w-full text-left text-sm ${compact ? "rows-compact" : ""}`}>
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 dark:border-white/10">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-5 py-3 text-right font-medium">Debit (+Due)</th>
              <th className="px-5 py-3 text-right font-medium">Credit (-Paid)</th>
              <th className="px-5 py-3 text-right font-medium">Balance After</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  Loading statement…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                  {rows.length === 0 ? "No ledger entries yet for this customer." : "No entries match your search."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                <td className="px-5 py-3 text-slate-500">{r.entry_date}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${TYPE_COLOR[r.type] || "bg-slate-100 text-slate-600"}`}>
                    {r.type}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-900 dark:text-white">{r.description || "-"}</td>
                <td className="px-5 py-3 text-right font-medium text-rose-600">{Number(r.debit) > 0 ? `+${inr(r.debit)}` : ""}</td>
                <td className="px-5 py-3 text-right font-medium text-emerald-600">{Number(r.credit) > 0 ? `-${inr(r.credit)}` : ""}</td>
                <td className={`px-5 py-3 text-right font-semibold ${Number(r.balance_after) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {inr(r.balance_after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Collection Modal */}
      {payModal && selected && (
        <Modal onClose={() => setPayModal(false)} title={`Collect Payment · ${selected.name}`} accent="emerald" size="md">
          <div className="space-y-4 p-5">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Current Outstanding Due:</span>
                <span className="text-sm font-bold text-rose-600">{inr(selected.balance)}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Payment Amount (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} mt-1 text-base font-bold`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Payment Method *</label>
              <div className="mt-1 flex gap-2">
                {[
                  { value: "cash", label: "Cash" },
                  { value: "upi", label: "UPI" },
                  { value: "bank", label: "Bank Transfer" },
                  { value: "card", label: "Card" },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPayMethod(m.value)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${
                      payMethod === m.value
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Remarks / Note (optional)</label>
              <input
                type="text"
                value={payRemarks}
                onChange={(e) => setPayRemarks(e.target.value)}
                placeholder="e.g. Due settled in cash"
                className={`${inputClass} mt-1`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                disabled={payBusy}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {payBusy ? "Recording…" : "Record Payment"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manual Balance Adjustment Modal */}
      {adjustModal && selected && (
        <Modal onClose={() => setAdjustModal(false)} title={`Ledger Adjustment · ${selected.name}`} accent="blue" size="md">
          <div className="space-y-4 p-5">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Adjustment Type</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustDirection("credit");
                    setAdjustType("adjustment");
                  }}
                  className={`flex-1 rounded-xl border p-2.5 text-xs font-semibold ${
                    adjustDirection === "credit"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  Reduce Due / Credit (−)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustDirection("debit");
                    setAdjustType("adjustment");
                  }}
                  className={`flex-1 rounded-xl border p-2.5 text-xs font-semibold ${
                    adjustDirection === "debit"
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  Increase Due / Debit (+)
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Adjustment Category</label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value as any)}
                className={`${inputClass} mt-1`}
              >
                <option value="adjustment">General Balance Correction</option>
                <option value="discount">Special Discount / Due Write-off</option>
                <option value="opening">Opening Due Balance Adjustment</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Amount (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} mt-1 text-base font-bold`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Adjustment Date</label>
              <input
                type="date"
                value={adjustDate}
                onChange={(e) => setAdjustDate(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Reason / Description *</label>
              <input
                type="text"
                value={adjustRemarks}
                onChange={(e) => setAdjustRemarks(e.target.value)}
                placeholder="e.g. Special waiver or correction"
                className={`${inputClass} mt-1`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordAdjustment}
                disabled={adjustBusy}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
              >
                {adjustBusy ? "Saving…" : "Save Adjustment"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toastView}
    </div>
  );
}