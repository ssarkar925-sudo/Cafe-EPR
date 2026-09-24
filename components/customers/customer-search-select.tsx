"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatCustomerResult } from "@/lib/customer-search";

export interface CustomerSearchResult {
  id: string;
  code: string | null;
  name: string | null;
  phone: string | null;
  is_active: boolean;
  match_tier?: string;
  match_field?: string | null;
}

interface CustomerSearchSelectProps {
  value: string | null;
  onChange: (id: string | null, record: CustomerSearchResult | null) => void;
  /** Record for the current value (avoids a lookup; falls back to id text). */
  selected?: CustomerSearchResult | null;
  placeholder?: string;
  /** Show a "walk-in / no profile" option that clears the selection. */
  allowWalkIn?: boolean;
  walkInLabel?: string;
  includeInactive?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  limit?: number;
  className?: string;
  /** External ref for the search input (e.g. keyboard-shortcut focus). */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** "dark" (default): fixed dark styling for dark-only workspace pages. "auto": light/dark adaptive. */
  tone?: "dark" | "auto";
}

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

/**
 * Canonical customer selector. Server-side search (no full-directory preload),
 * canonical ranking from the API, keyboard navigation, inactive marking.
 */
export default function CustomerSearchSelect({
  value,
  onChange,
  selected = null,
  placeholder = "Search name, phone, or ID…",
  allowWalkIn = false,
  walkInLabel = "Walk-in Customer",
  includeInactive = false,
  disabled = false,
  autoFocus = false,
  limit = 20,
  className = "",
  inputRef,
  tone = "dark",
}: CustomerSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lastSelected, setLastSelected] = useState<CustomerSearchResult | null>(selected);
  const abortRef = useRef<AbortController | null>(null);
  const innerInputRef = useRef<HTMLInputElement | null>(null);
  const inputElRef = inputRef ?? innerInputRef;
  const listId = useId();

  useEffect(() => {
    if (selected !== undefined) setLastSelected(selected);
  }, [selected]);

  useEffect(() => {
    if (autoFocus) inputElRef.current?.focus();
  }, [autoFocus, inputElRef]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({
          q: trimmed,
          limit: String(limit),
          ...(includeInactive ? { include_inactive: "1" } : {}),
        });
        const res = await fetch(`/api/customers/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Search failed (${res.status})`);
        setResults(Array.isArray(data?.results) ? data.results : []);
        setActiveIndex(-1);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [query, limit, includeInactive]);

  const displayRecord = lastSelected && value && lastSelected.id === value ? lastSelected : null;

  function choose(record: CustomerSearchResult | null) {
    if (record && !record.is_active && !includeInactive) return;
    setLastSelected(record);
    onChange(record ? record.id : null, record);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  const showWalkInRow = allowWalkIn && (!query || query.trim().length < MIN_QUERY_LENGTH || results.length > 0);
  const walkInOffset = showWalkInRow ? 1 : 0;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const total = results.length + walkInOffset;
      if (total === 0) return;
      setActiveIndex((prev) => {
        const next = e.key === "ArrowDown" ? prev + 1 : prev - 1;
        if (next < -1) return total - 1;
        if (next >= total) return -1;
        return next;
      });
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0) {
        e.preventDefault();
        if (walkInOffset === 1 && activeIndex === 0) choose(null);
        else choose(results[activeIndex - walkInOffset] ?? null);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const auto = tone === "auto";
  const cx = {
    card: auto
      ? "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
      : "flex items-center gap-2 rounded-lg border border-[#2a3340] bg-[#0f141b] px-3 py-2",
    title: auto
      ? "truncate text-xs font-bold text-slate-900 dark:text-white"
      : "truncate text-sm font-semibold text-white",
    subtitle: auto ? "truncate text-[10px] text-slate-500 dark:text-slate-400" : "truncate text-xs text-slate-400",
    clearBtn: auto
      ? "rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white"
      : "rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-white",
    input: auto
      ? "h-8 w-full rounded-xl border border-slate-200 bg-white pl-3 pr-3 text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500 disabled:opacity-50"
      : "w-full rounded-lg border border-[#2a3340] bg-[#0f141b] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50",
    menu: auto
      ? "absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      : "absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[#2a3340] bg-[#151b24] shadow-xl",
    status: auto ? "px-3 py-2 text-xs text-slate-500 dark:text-slate-400" : "px-3 py-2 text-xs text-slate-400",
    walkIn: (active: boolean) =>
      auto
        ? `block w-full px-2.5 py-1.5 text-left text-xs font-bold ${active ? "bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-cyan-300" : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`
        : `block w-full px-3 py-2 text-left text-sm ${active ? "bg-emerald-600/20 text-emerald-200" : "text-slate-300 hover:bg-white/5"}`,
    option: (active: boolean) =>
      auto
        ? `block w-full px-2.5 py-1.5 text-left ${active ? "bg-blue-50 dark:bg-blue-600/20" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`
        : `block w-full px-3 py-2 text-left ${active ? "bg-emerald-600/20" : "hover:bg-white/5"}`,
    optTitle: auto
      ? "truncate text-xs font-bold text-slate-900 dark:text-white"
      : "truncate text-sm font-medium text-white",
    optSub: auto
      ? "truncate text-[10px] text-slate-500 dark:text-slate-400"
      : "truncate text-xs text-slate-400",
    empty: auto
      ? "px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400"
      : "px-3 py-2 text-xs text-slate-500",
  };

  return (
    <div className={`relative ${className}`}>
      {displayRecord ? (
        <div className={cx.card}>
          <div className="min-w-0 flex-1">
            <div className={cx.title}>
              {formatCustomerResult(displayRecord).title}
            </div>
            <div className={cx.subtitle}>
              {formatCustomerResult(displayRecord).subtitle}
              {!displayRecord.is_active && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                  Inactive
                </span>
              )}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => choose(null)}
              className={cx.clearBtn}
              aria-label="Clear selected customer"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <input
          ref={inputElRef}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={value ? `Selected ${String(value).slice(0, 8)}…` : placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          className={cx.input}
        />
      )}

      {open && !displayRecord && !disabled && (query.trim().length >= MIN_QUERY_LENGTH || allowWalkIn) && (
        <div
          id={listId}
          role="listbox"
          className={cx.menu}
        >
          {loading && <div className={cx.status}>Searching…</div>}
          {error && <div className="px-3 py-2 text-xs text-rose-300">{error}</div>}
          {!loading && !error && showWalkInRow && allowWalkIn && (
            <button
              type="button"
              role="option"
              id={`${listId}-opt-0`}
              aria-selected={activeIndex === 0}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(null);
              }}
              className={cx.walkIn(activeIndex === 0)}
            >
              {walkInLabel} <span className="text-xs text-slate-500">(no profile)</span>
            </button>
          )}
          {!loading &&
            !error &&
            results.map((r, i) => {
              const idx = allowWalkIn && showWalkInRow ? i + 1 : i;
              const label = formatCustomerResult(r);
              const blocked = !r.is_active && !includeInactive;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  id={`${listId}-opt-${idx}`}
                  aria-selected={activeIndex === idx}
                  disabled={blocked}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(r);
                  }}
                  className={`${cx.option(activeIndex === idx)} ${blocked ? "opacity-50" : ""}`}
                >
                  <div className={cx.optTitle}>{label.title}</div>
                  <div className={cx.optSub}>
                    {label.subtitle}
                    {!r.is_active && (
                      <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                        Inactive
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          {!loading && !error && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
            <div className={cx.empty}>
              No customers found. Check spelling, try the phone number, or create a new customer.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
