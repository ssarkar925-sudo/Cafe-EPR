"use client";

import { useState } from "react";
import Link from "next/link";

const quickCommands = [
  "Create a quick sale for 2 coffee and 1 sandwich, UPI.",
  "Prepare an invoice for Amit: 2 coffee and 1 sandwich.",
  "Explain how you would record a completed AEPS transaction.",
  "Show me what you need before recording a DMT transaction.",
];

type ApprovalSummary = {
  approval_id: string;
  customer: string;
  payment_method: string;
  total: number;
  items: { name: string; qty: number; rate: number; amount: number }[];
};

export default function CafeAIAgent() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);

  async function ask(text = message) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setReply("");
    setApproval(null);
    try {
      const quick = await fetch("/api/ai/quick-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value }),
      });
      const quickData = await quick.json();
      if (quick.ok && quickData?.action === "approval_required") {
        setApproval({ approval_id: quickData.approval_id, ...quickData.summary });
        setReply(quickData.message);
        return;
      }
      if (quick.ok && quickData?.action === "needs_input") {
        setReply(quickData.message || "I need more information before preparing the sale.");
        return;
      }

      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Cafe AI is unavailable");
      setReply(data.message || "No response");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cafe AI is unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function approveQuickSale() {
    if (!approval || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/ai/agent/approval/${approval.approval_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Owner approved quick sale from Cafe AI." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Approval failed");
      if (!data.executed) throw new Error("Approval was recorded but the sale was not executed.");
      const invoice = data.sale?.invoice_number || data.sale?.invoice_id || "created";
      setReply(`✓ Quick sale completed. Invoice ${invoice} was created in Cafe-EPR.`);
      setApproval(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Owner-controlled AI
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Cafe AI Agent</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Voice/text-ready shop assistant. Quick sales are prepared from your current Cafe-EPR catalog and require your owner approval before any record is created.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/ai-agent/learning" className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-xs font-black text-indigo-200 transition hover:bg-indigo-500/20">
              Learning Control Center
            </Link>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
              <div className="font-bold text-emerald-300">OWNER CONTROL</div>
              <div className="mt-1 text-slate-400">Writes require explicit approval</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Talk to Cafe AI</h2>
              <p className="text-xs text-slate-500">বাংলা · हिन्दी · English · mixed language</p>
            </div>
            <button type="button" disabled className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-400 dark:border-white/10">
              🎙 Voice — next layer
            </button>
          </div>

          <div className="min-h-48 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60">
            {reply ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{reply}</p> : <p className="text-sm text-slate-400">Ask the agent to prepare a quick sale, invoice, transaction record, report, or explain what it needs.</p>}

            {approval && (
              <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-amber-900 dark:text-amber-200">Owner approval required</div>
                    <div className="mt-1 text-xs text-amber-800 dark:text-amber-300">Nothing has been written yet.</div>
                  </div>
                  <div className="text-lg font-black text-amber-900 dark:text-amber-100">₹{approval.total.toFixed(2)}</div>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-700 dark:text-slate-200">
                  {approval.items.map((item) => <div key={`${item.name}-${item.qty}`}>{item.qty} × {item.name} @ ₹{item.rate.toFixed(2)}</div>)}
                  <div className="pt-1 font-bold">Payment: {approval.payment_method} · Customer: {approval.customer}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={approveQuickSale} disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Processing…" : "Approve & Create Sale"}</button>
                  <button type="button" onClick={() => setApproval(null)} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:text-slate-300">Cancel</button>
                </div>
              </div>
            )}
          </div>

          {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}

          <div className="mt-4 flex gap-2">
            <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} placeholder="e.g. Make a quick sale for 2 coffee..." className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-white" />
            <button onClick={() => ask()} disabled={busy || !message.trim()} className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Thinking…" : "Ask"}</button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Try a command</h2>
            <div className="mt-3 space-y-2">
              {quickCommands.map((command) => (
                <button key={command} onClick={() => { setMessage(command); ask(command); }} className="w-full rounded-2xl border border-slate-200 p-3 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">{command}</button>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-950/20">
            <h2 className="text-sm font-black text-amber-900 dark:text-amber-200">Your control</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
              <li>✓ Quick-sale writes require your approval.</li>
              <li>✓ Current prices and stock are rechecked at execution.</li>
              <li>✓ OTP/PIN/passwords are never requested.</li>
              <li>✓ Cancel means no Cafe-EPR change.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
