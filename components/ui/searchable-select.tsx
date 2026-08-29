"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className = "",
  disabled = false,
  showClear = true,
  emptyText = "No options found",
  minSearchLength = 0,
  minSearchPrompt = "Type at least 2 characters to search…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  showClear?: boolean;
  emptyText?: string;
  minSearchLength?: number;
  minSearchPrompt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (minSearchLength > 0 && needle.length < minSearchLength) {
      // Privacy mode: show only default unselected option (e.g. Walk-in) until threshold reached
      return options.filter((o) => !o.value);
    }
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q, minSearchLength]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setQ("");
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm transition focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-slate-400"
        }`}
      >
        <span className={`truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {minSearchLength > 0 && q.trim().length < minSearchLength && (
              <div className="p-3 text-center text-xs font-medium text-slate-400">
                🔍 {minSearchPrompt}
              </div>
            )}
            {showClear && value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQ("");
                }}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 transition hover:bg-slate-50"
              >
                <span>Clear selection</span>
                <span className="text-xs text-slate-400">✕</span>
              </button>
            )}
            {filtered.length === 0 && (minSearchLength === 0 || q.trim().length >= minSearchLength) ? (
              <div className="p-3 text-center text-xs text-slate-400">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    o.value === value
                      ? "bg-blue-50 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <span className="text-xs text-blue-600">✓</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
