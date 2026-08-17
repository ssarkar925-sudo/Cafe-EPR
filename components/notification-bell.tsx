"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

const SEEN_KEY = "sccomm-notif-seen";

type LowStock = {
  id: string;
  name: string;
  stock_qty: number | string;
  reorder_level: number | string;
  unit: string;
};

type DueInvoice = {
  id: string;
  invoice_number: string;
  due: number | string;
  status: string;
  customers: { name: string } | null;
  created_at: string;
};

export default function NotificationBell({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [dueInvoices, setDueInvoices] = useState<DueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [seen, setSeen] = useState<string>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const ref = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  async function load() {
    const now = new Date().toISOString();
    const queries: any[] = [];

    if (role !== "staff") {
      queries.push(
        supabase
          .from("products")
          .select("id, name, stock_qty, reorder_level, unit")
          .eq("is_active", true)
      );
    }
    queries.push(
      supabase
        .from("invoices")
        .select("id, invoice_number, due, status, customers(name), created_at")
        .in("status", ["unpaid", "partial"])
        .gt("due", 0)
        .order("created_at", { ascending: false })
        .limit(20)
    );

    const results = await Promise.all(queries);
    const low = results[0];
    const due = role !== "staff" ? results[1] : results[0];

    const lowList = ((low?.data ?? []) as LowStock[]).filter(
      (p) => Number(p.stock_qty) <= Number(p.reorder_level)
    );
    setLowStock(lowList);
    setDueInvoices((due?.data ?? []) as DueInvoice[]);
    setUpdatedAt(now);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const total = lowStock.length + dueInvoices.length;
  const isNew = (createdAt?: string) =>
    !!createdAt && seen.length > 0 && createdAt > seen;

  function markRead() {
    const s = new Date().toISOString();
    try {
      localStorage.setItem(SEEN_KEY, s);
    } catch {
      /* ignore */
    }
    setSeen(s);
  }

  function toggle() {
    setOpen((v) => {
      if (!v) markRead();
      return !v;
    });
  }

  function close() {
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        title="Notifications"
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4.5 w-4.5"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
              <p className="text-[11px] text-slate-400">
                {loading
                  ? "Loading…"
                  : total === 0
                    ? "All clear"
                    : `${total} item${total === 1 ? "" : "s"} need attention`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  markRead();
                  load();
                }}
                title="Refresh"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
                </svg>
              </button>
              <button
                onClick={markRead}
                title="Mark all as read"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {!loading && total === 0 && (
              <div className="px-4 py-10 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-10 w-10 text-slate-300">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <p className="mt-3 text-sm font-medium text-slate-600">You're all caught up</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                  Low-stock products and unpaid invoices will appear here.
                </p>
              </div>
            )}

            {role !== "staff" && lowStock.length > 0 && (
              <div>
                <p className="sticky top-0 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Low Stock · {lowStock.length}
                </p>
                {lowStock.slice(0, 6).map((p) => (
                  <Link
                    key={p.id}
                    href="/catalog/products"
                    onClick={close}
                    className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {Number(p.stock_qty)} {p.unit} left · reorder at {Number(p.reorder_level)}
                      </span>
                    </span>
                    <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                      Low
                    </span>
                  </Link>
                ))}
                {lowStock.length > 6 && (
                  <Link href="/catalog/products" onClick={close} className="block px-4 py-1.5 text-xs font-medium text-blue-600 hover:bg-slate-50">
                    +{lowStock.length - 6} more…
                  </Link>
                )}
              </div>
            )}

            {dueInvoices.length > 0 && (
              <div>
                <p className="sticky top-0 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Due Invoices · {dueInvoices.length}
                </p>
                {dueInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href="/invoices"
                    onClick={close}
                    className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                  >
                    {isNew(inv.created_at) && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${inv.status === "unpaid" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{inv.invoice_number}</span>
                      <span className="block text-[11px] text-slate-400">
                        {inv.customers?.name ?? "Walk-in"} · {inr(Number(inv.due))} due
                      </span>
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${inv.status === "unpaid" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                      {inv.status === "unpaid" ? "Unpaid" : "Partial"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
            <span className="text-[10px] text-slate-400">
              {updatedAt
                ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Updating…"}
            </span>
            <button
              onClick={() => {
                markRead();
                setOpen(false);
              }}
              className="text-[11px] font-medium text-slate-500 transition hover:text-slate-800"
            >
              Mark all as read
            </button>
          </div>
        </div>
      )}
    </div>
  );
}