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
          href: "/catalog/products",
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
          href: "/invoices",
        });

      setResults(out);
      setSelected(0);
      setLoading(false);
    }, 220);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, selected]);

  if (!open) return null;

  const typeColor: Record<string, string> = {
    Customer: "bg-blue-100 text-blue-700",
    Product: "bg-violet-100 text-violet-700",
    Service: "bg-fuchsia-100 text-fuchsia-700",
    Invoice: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[#020617]/70 p-4 pt-20 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, products, services, invoices…"
            className="flex-1 bg-transparent py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Searching…</p>
          )}
          {!loading && results.length === 0 && q && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              No matches for “{q}”.
            </p>
          )}
          {!loading && !q && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Type to search across your shop.
            </p>
          )}
          {results.map((r, i) => (
            <Link
              key={r.type + r.title + i}
              href={r.href}
              onClick={() => go(i)}
              onMouseEnter={() => setSelected(i)}
              className={`flex items-center gap-3 border-b border-slate-50 px-4 py-3 transition last:border-0 ${
                i === selected ? "bg-blue-50/70" : ""
              }`}
            >
              <span className={`w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase ${typeColor[r.type] || "bg-slate-100 text-slate-600"}`}>
                {r.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {r.title}
                </span>
                {r.subtitle && (
                  <span className="block truncate text-xs text-slate-400">
                    {r.subtitle}
                  </span>
                )}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-300">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] text-slate-400">
          <span><kbd className="rounded border border-slate-200 bg-white px-1">↑</kbd> <kbd className="rounded border border-slate-200 bg-white px-1">↓</kbd> navigate</span>
          <span><kbd className="rounded border border-slate-200 bg-white px-1">↵</kbd> open</span>
          <span className="ml-auto">Ctrl K toggles</span>
        </div>
      </div>
    </div>
  );
}
