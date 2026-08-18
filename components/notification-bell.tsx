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

type Activity = {
  id: string;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

function entityRoute(entity: string, details: Record<string, unknown> | null): string {
  const service = details?.service_type as string | undefined;
  switch (entity) {
    case "transaction":
      return `/business/${service || "aeps"}`;
    case "invoice":
      return "/invoices";
    case "payment":
      return "/invoices";
    case "return":
      return "/returns";
    case "customer":
      return "/customers";
    case "product":
      return "/catalog/products";
    case "service":
      return "/catalog/services";
    case "expense":
      return "/finance/expenses";
    case "settlement":
      return "/finance/settlements";
    case "staff":
      return "/staff";
    case "quick_sale":
      return "/invoices";
    case "payment_instrument":
    case "payment_method":
    case "settings":
    case "profile":
      return "/settings";
    case "report":
      return "/reports";
    default:
      return "/dashboard";
  }
}

function actionMeta(action: string) {
  switch (action) {
    case "create":
      return { icon: "M12 5v14M5 12h14", cls: "bg-emerald-100 text-emerald-600" };
    case "update":
      return { icon: "M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z", cls: "bg-blue-100 text-blue-600" };
    case "delete":
      return { icon: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", cls: "bg-rose-100 text-rose-600" };
    case "cancel":
      return { icon: "M6 6 18 18M6 18 18 6", cls: "bg-amber-100 text-amber-600" };
    case "reverse":
      return { icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5", cls: "bg-violet-100 text-violet-600" };
    case "payment":
      return { icon: "M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2ZM2 10h20", cls: "bg-teal-100 text-teal-600" };
    case "login":
    case "logout":
      return { icon: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3", cls: "bg-slate-200 text-slate-600" };
    case "upload":
      return { icon: "M12 5v14M5 12h14", cls: "bg-indigo-100 text-indigo-600" };
    case "settings":
      return { icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z", cls: "bg-slate-200 text-slate-600" };
    default:
      return { icon: "M12 5v14M5 12h14", cls: "bg-slate-200 text-slate-600" };
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function NotificationBell({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [dueInvoices, setDueInvoices] = useState<DueInvoice[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
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
    const isBackOffice = role !== "staff";
    const queries: any[] = [];

    if (isBackOffice) {
      queries.push(supabase.rpc("unread_notifications"));
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
    let idx = 0;
    let notif: any;
    let low: any;
    if (isBackOffice) notif = results[idx++];
    if (isBackOffice) low = results[idx++];
    const due = results[idx++];

    if (notif) {
      const data = (notif.data as { unread?: Activity[]; count?: number } | null) ?? {};
      setActivity((data.unread ?? []) as Activity[]);
      setUnreadCount(Number(data.count ?? 0));
    } else {
      setActivity([]);
      setUnreadCount(0);
    }

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
    if (role === "staff") return;
    const channel = supabase
      .channel("notif-realtime-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          const row = payload.new as unknown as Activity;
          if (row && row.id) {
            setActivity((prev) => [row, ...prev].slice(0, 40));
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, role]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const total = unreadCount + lowStock.length + dueInvoices.length;
  const isNew = (createdAt?: string) =>
    !!createdAt && seen.length > 0 && createdAt > seen;

  function markSeen() {
    const s = new Date().toISOString();
    try {
      localStorage.setItem(SEEN_KEY, s);
    } catch {
      /* ignore */
    }
    setSeen(s);
  }

  async function markOneRead(id: string) {
    setActivity((prev) => prev.filter((a) => a.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
    await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  }

  async function markAllRead() {
    const ids = activity.map((a) => a.id);
    if (!ids.length) return;
    setActivity([]);
    setUnreadCount(0);
    await supabase.rpc("mark_notifications_read", { p_ids: ids });
  }

  function toggle() {
    setOpen((v) => {
      if (!v) markSeen();
      return !v;
    });
  }

  function close() {
    setOpen(false);
  }

  const sectionCls =
    "sticky top-0 z-10 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

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
                    : `${unreadCount} new change${unreadCount === 1 ? "" : "s"} · ${lowStock.length + dueInvoices.length} alert${lowStock.length + dueInvoices.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  markSeen();
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
                onClick={markAllRead}
                title="Mark all as read"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {!loading && total === 0 && (
              <div className="px-4 py-10 text-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-10 w-10 text-slate-300">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                <p className="mt-3 text-sm font-medium text-slate-600">You're all caught up</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                  Every change in the shop will appear here until you mark it read.
                </p>
              </div>
            )}

            {activity.length > 0 && (
              <div>
                <p className={sectionCls}>Recent Activity · {unreadCount}</p>
                {activity.slice(0, 12).map((a) => {
                  const meta = actionMeta(a.action);
                  return (
                    <Link
                      key={a.id}
                      href={entityRoute(a.entity, a.details)}
                      onClick={() => markOneRead(a.id)}
                      className="group flex items-start gap-3 px-4 py-2.5 transition hover:bg-slate-50"
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.cls}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <path d={meta.icon} />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug text-slate-800">
                          {a.description || `${a.action} ${a.entity}`}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                          {a.user_name ? `${a.user_name} · ` : ""}
                          {timeAgo(a.created_at)}
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="Mark as read"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          markOneRead(a.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            markOneRead(a.id);
                          }
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        </svg>
                      </span>
                    </Link>
                  );
                })}
                {role === "admin" && (
                  <Link href="/audit" onClick={close} className="block px-4 py-2 text-xs font-medium text-blue-600 hover:bg-slate-50">
                    View full audit log →
                  </Link>
                )}
              </div>
            )}

            {role !== "staff" && lowStock.length > 0 && (
              <div>
                <p className={sectionCls}>Low Stock · {lowStock.length}</p>
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
                <p className={sectionCls}>Due Invoices · {dueInvoices.length}</p>
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
                markAllRead();
                markSeen();
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