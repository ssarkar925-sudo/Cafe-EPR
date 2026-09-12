"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export const INSTRUMENT_TYPES: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
  { value: "debit_card", label: "Debit Card" },
  { value: "credit_card", label: "Credit Card" },
];

export type InstrumentPick = {
  method: string;
  instrument_id: string;
};

export const METHOD_ACCOUNT_TYPES: Record<string, string[]> = {
  cash: ["cash"],
  upi: ["upi", "upi_qr"],
  card: ["debit_card", "credit_card"],
  bank: ["bank"],
  wallet: ["wallet"],
  debit_card: ["debit_card"],
  credit_card: ["credit_card"],
  credit: ["credit_card"],
};

type PosInstrument = { id: string; name: string; type: string };

function normalizeMethod(method: string) {
  return method === "credit" ? "credit_card" : method;
}

export function instrumentLabel(method: string) {
  const normalized = normalizeMethod(method);
  return INSTRUMENT_TYPES.find((t) => t.value === normalized)?.label ?? method;
}

export function buildInstrumentOptions(instruments: PosInstrument[], enabled?: string[]) {
  return INSTRUMENT_TYPES.filter(
    (t) => !enabled || enabled.includes(t.value) || (t.value === "credit_card" && enabled.includes("credit"))
  ).map((t) => {
    const acceptedTypes = t.value === "upi" ? ["upi", "upi_qr"] : [t.value];
    const named = instruments.filter((i) => acceptedTypes.includes(i.type));
    const options = named.map((i) => ({ value: i.id, label: i.name, method: t.value }));
    options.unshift({ value: "__gen__:" + t.value, label: `Generic ${t.label}`, method: t.value });
    return { group: t.label, options };
  });
}

export function selectValueOf(pick: InstrumentPick, instruments?: PosInstrument[]) {
  if (pick.instrument_id) return pick.instrument_id;
  const method = normalizeMethod(pick.method || "");
  return method ? "__gen__:" + method : "";
}

export function parseInstrumentValue(value: string, instruments: PosInstrument[]): InstrumentPick | null {
  if (value === "__add__") return null;
  if (value.startsWith("__gen__:")) {
    const method = normalizeMethod(value.slice(8));
    return { method, instrument_id: "" };
  }
  const inst = instruments.find((i) => i.id === value);
  const method = inst?.type === "upi_qr" ? "upi" : inst?.type ?? "cash";
  return { method, instrument_id: value };
}

function useResetPairedAmountWhenCartClears(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cartPanel = root.closest(".sticky");
    if (!cartPanel) return;

    const resetIfEmpty = () => {
      const header = cartPanel.querySelector("h2");
      if (!header || header.textContent?.trim() !== "Current Invoice") return;
      const itemCount = header.parentElement?.querySelector("p")?.textContent ?? "";
      if (!/^0\\s+items\\b/.test(itemCount.trim())) return;

      const pairedInput = root.parentElement?.querySelector<HTMLInputElement>("input");
      if (!pairedInput || pairedInput.value === "") return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(pairedInput, "");
      pairedInput.dispatchEvent(new Event("input", { bubbles: true }));
      pairedInput.dispatchEvent(new Event("change", { bubbles: true }));
    };

    resetIfEmpty();
    const observer = new MutationObserver(resetIfEmpty);
    observer.observe(cartPanel, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [rootRef]);
}

export default function InstrumentSelect({
  instruments,
  pick,
  onChange,
  className,
  includeAdd = true,
  enabled,
}: {
  instruments: PosInstrument[];
  pick: InstrumentPick;
  onChange: (pick: InstrumentPick | null) => void;
  className?: string;
  includeAdd?: boolean;
  enabled?: string[];
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  useResetPairedAmountWhenCartClears(rootRef);

  const groups = buildInstrumentOptions(instruments, enabled);
  const currentVal = selectValueOf(pick);
  const currentOption = groups.flatMap((g) => g.options).find((o) => o.value === currentVal);
  const currentLabel = currentOption?.label ?? (pick.instrument_id ? instrumentLabel(pick.method) : instrumentLabel(pick.method || "Cash"));
  const needle = search.trim().toLowerCase();

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(value: string) {
    onChange(parseInstrumentValue(value, instruments));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${className ?? ""} flex w-full items-center justify-between gap-2 !bg-transparent !text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="min-w-0 truncate">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 p-2 dark:border-white/5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search account…"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[10px] font-semibold outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/[0.04]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  aria-label="Clear account search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto p-1.5">
            {groups.map((group) => {
              const options = group.options.filter((o) => o.label.toLowerCase().includes(needle));
              if (!options.length) return null;
              return (
                <div key={group.group} className="mb-1 last:mb-0">
                  <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-400">
                    {group.group}
                  </div>
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === currentVal}
                      onClick={() => choose(option.value)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[10px] font-bold transition ${
                        option.value === currentVal
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                      {option.value === currentVal && <span className="ml-2 text-[9px] font-black">✓</span>}
                    </button>
                  ))}
                </div>
              );
            })}
            {includeAdd && (
              <button
                type="button"
                onClick={() => choose("__add__")}
                className="mt-1 flex w-full items-center rounded-lg border-t border-slate-100 px-2.5 py-2 text-[10px] font-black text-indigo-600 hover:bg-indigo-50 dark:border-white/5 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
              >
                + Add card / account…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
