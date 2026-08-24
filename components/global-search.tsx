"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

type Result = {
  type: string;
  title: string;
  subtitle?: string;
  href: string;
};

const STATIC_PAGES: { title: string; subtitle: string; href: string; keywords: string[] }[] = [
  { title: "Financial Self-Audit", subtitle: "13-Subsystem Invariant AI Audit Center", href: "/ai/self-audit", keywords: ["audit", "self", "integrity", "ai", "variance", "reconcile"] },
  { title: "Tax Preparation / ITR", subtitle: "Accountant-Ready Section 44AD / 40A(3) Tax Prep", href: "/reports/tax-preparation", keywords: ["tax", "itr", "44ad", "income tax", "prep"] },
  { title: "GST Reports", subtitle: "Statutory GSTR-1 & GSTR-3B Outward Tax Reports", href: "/reports/gst", keywords: ["gst", "gstr-1", "gstr-3b", "tax", "hsn", "sac"] },
  { title: "Security Center", subtitle: "Immutability Locks, Audit Logs & Access Control", href: "/security", keywords: ["security", "triggers", "immutability", "lock", "roles"] },
  { title: "Profit & Loss", subtitle: "Operating Revenue, COGS, Expenses & Net Profit", href: "/finance/pnl", keywords: ["pnl", "profit", "loss", "revenue", "cogs", "expenses"] },
  { title: "Cash Book", subtitle: "Daily Cash Movement Ledger & Drawer Counts", href: "/finance/cashbook", keywords: ["cash", "cashbook", "drawer", "movement"] },
  { title: "Day Close & Rollover", subtitle: "Daily Reconciliation, Profit Lock & Rollover", href: "/finance/day-close", keywords: ["day close", "rollover", "close", "reconcile"] },
  { title: "Settlement Hub", subtitle: "Liquid Pool & Bank Settlements", href: "/finance/settlements", keywords: ["settlement", "bank", "wallet", "transfer"] },
  { title: "Opening Balances", subtitle: "Starting Cash, Bank, Cards & Float Matrix", href: "/finance/opening-balances", keywords: ["opening", "balance", "seed", "float"] },
  { title: "General Ledger", subtitle: "Complete Double-Entry Ledger", href: "/finance/ledger", keywords: ["ledger", "accounts", "journal", "general"] },
  { title: "Expenses", subtitle: "Recorded Business Operating Expenses", href: "/finance/expenses", keywords: ["expense", "outgoing", "cost", "voucher"] },
  { title: "Reports Hub", subtitle: "Sales, Products, Accounts & Customer Reports", href: "/reports", keywords: ["reports", "sales", "analytics"] },
  { title: "Point of Sale (POS)", subtitle: "Invoice Billing & Quick Counter Sales", href: "/pos", keywords: ["pos", "sale", "billing", "counter", "checkout"] },
  { title: "Invoices & Receipts", subtitle: "All Invoices, Statuses & Printouts", href: "/invoices", keywords: ["invoice", "receipt", "bill", "payment"] },
  { title: "Returns & Credit Notes", subtitle: "Refunds, Stock Reversal & Credit Notes", href: "/returns", keywords: ["return", "refund", "credit note"] },
  { title: "Customers & CRM", subtitle: "Customer Accounts, Dues & Ledgers", href: "/customers", keywords: ["customer", "due", "crm", "balance", "client"] },
  { title: "Products & Stock", subtitle: "Catalog, Quantities & Purchase Costs", href: "/catalog/products", keywords: ["product", "stock", "catalog", "item", "inventory"] },
  { title: "Services Catalog", subtitle: "Service Price List & Commissions", href: "/catalog/services", keywords: ["service", "price", "fee"] },
  { title: "AEPS Banking", subtitle: "Aadhaar ATM Cash Withdrawal & Balances", href: "/business/aeps", keywords: ["aeps", "aadhaar", "atm", "cash out"] },
  { title: "DMT Money Transfer", subtitle: "Domestic Money Remittance", href: "/business/dmt", keywords: ["dmt", "remittance", "transfer", "money"] },
  { title: "UPI Collections", subtitle: "Dynamic QR & Merchant Soundbox Payments", href: "/business/upi", keywords: ["upi", "qr", "soundbox", "merchant"] },
  { title: "Staff & Attendance", subtitle: "Staff Management, Roles & Shift Attendance", href: "/staff", keywords: ["staff", "employee", "team", "attendance", "users"] },
  { title: "Shop Settings", subtitle: "Shop Profile, Tax Settings & Accounts", href: "/settings", keywords: ["settings", "shop", "profile", "config"] },
];

export default function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const supabaseRef = useMemo(() => supabase, [supabase]);

  useEffect(() => {
    if (open) {
      setQ("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const needle = q.trim().toLowerCase();
    if (!needle) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const out: Result[] = [];

      // 1. Search Static Module Pages
      for (const page of STATIC_PAGES) {
        if (
          page.title.toLowerCase().includes(needle) ||
          page.subtitle.toLowerCase().includes(needle) ||
          page.keywords.some((k) => k.includes(needle))
        ) {
          out.push({
            type: "Navigation",
            title: page.title,
            subtitle: page.subtitle,
            href: page.href,
          });
        }
      }

      const ilike = `%${needle}%`;

      const [cust, prods, servs, invs] = await Promise.all([
        supabaseRef
          .from("customers")
          .select("id, name, code, phone, email")
          .or(`name.ilike.${ilike},phone.ilike.${ilike},email.ilike.${ilike}`)
          .limit(5),
        supabaseRef
          .from("products")
          .select("id, name, code")
          .eq("is_active", true)
          .ilike("name", ilike)
          .limit(5),
        supabaseRef
          .from("services")
          .select("id, name")
          .eq("is_active", true)
          .ilike("name", ilike)
          .limit(5),
        supabaseRef
          .from("invoices")
          .select("id, invoice_number, customers(name), total")
          .ilike("invoice_number", ilike)
          .limit(5),
      ]);

      if (cancelled) return;

      for (const c of cust.data ?? [])
        out.push({
          type: "Customer",
          title: c.name as string,
          subtitle: `${c.code ?? ""}${c.phone ? " · " + c.phone : ""}`.trim(),
          href: `/customers/${c.id}`,
        });
      for (const p of prods.data ?? [])
        out.push({
          type: "Product",
          title: p.name as string,
          subtitle: (p.code as string) ?? "",
          href: `/catalog/products?q=${encodeURIComponent(p.name as string)}`,
        });
      for (const s of servs.data ?? [])
        out.push({
          type: "Service",
          title: s.name as string,
          subtitle: undefined,
          href: "/catalog/services",
        });
      for (const i of invs.data ?? [])
        out.push({
          type: "Invoice",
          title: i.invoice_number as string,
          subtitle: `${(i as any).customers?.name ?? "Walk-in"} · ${inr(Number(i.total))}`,
          href: `/invoices?q=${encodeURIComponent(i.invoice_number as string)}`,
        });

      setResults(out);
      setSelected(0);
      setLoading(false);
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, open, supabaseRef]);

  function go(idx: number) {
    const r = results[idx];
    if (!r) return;
    onClose();
    setQ("");
    window.location.href = r.href;
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(selected);
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg
            className="h-5 w-5 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all 35+ modules, customers, invoices, products..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-400 outline-none"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-blue-500" />
          )}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            ESC
          </kbd>
        </div>

        {results.length > 0 ? (
          <ul className="max-h-96 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
            {results.map((r, idx) => {
              const active = idx === selected;
              return (
                <li key={r.type + r.href + r.title}>
                  <button
                    type="button"
                    onClick={() => go(idx)}
                    onMouseEnter={() => setSelected(idx)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                      active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                            active
                              ? "bg-white/20 text-white"
                              : "bg-white/10 text-slate-400"
                          }`}
                        >
                          {r.type}
                        </span>
                        <span className="truncate font-semibold">{r.title}</span>
                      </div>
                      {r.subtitle && (
                        <p
                          className={`truncate text-[11px] mt-0.5 ${
                            active ? "text-blue-100" : "text-slate-400"
                          }`}
                        >
                          {r.subtitle}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] opacity-60">↵</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : q.trim() && !loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No matching modules, customers, or products found for &ldquo;{q}&rdquo;.
          </div>
        ) : (
          <div className="p-4 text-xs text-slate-400">
            <p className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-2">
              Popular Quick Jumps
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-slate-300">
              <button onClick={() => { onClose(); window.location.href = "/ai/self-audit"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🔍 Financial Self-Audit
              </button>
              <button onClick={() => { onClose(); window.location.href = "/reports/tax-preparation"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                📑 Tax Preparation / ITR
              </button>
              <button onClick={() => { onClose(); window.location.href = "/reports/gst"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🏛️ GST Reports
              </button>
              <button onClick={() => { onClose(); window.location.href = "/finance/cashbook"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                💵 Daily Cash Book
              </button>
              <button onClick={() => { onClose(); window.location.href = "/finance/day-close"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🔒 Day Close &amp; Rollover
              </button>
              <button onClick={() => { onClose(); window.location.href = "/security"; }} className="text-left rounded-lg p-1.5 hover:bg-white/5 hover:text-white">
                🛡️ Security Center
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
