"use client";

import { useEffect, useMemo, useState } from "react";
import SettingsSection from "@/components/settings/settings-section";
import {
  QUICK_ACCESS_CATALOG,
  DEFAULT_QUICK_ACCESS,
  type QuickAccessItem,
} from "@/components/quick-access-registry";
import {
  loadQuickAccessDisplayMode,
  loadQuickAccessItems,
  loadQuickAccessOwnerActive,
  saveQuickAccessDisplayMode,
  saveQuickAccessItems,
  saveQuickAccessOwnerActive,
  subscribeQuickAccess,
  type QuickAccessDisplayMode,
} from "@/components/quick-access-store";

export default function QuickAccessEditor() {
  const [ownerActive, setOwnerActive] = useState(false);
  const [displayMode, setDisplayMode] = useState<QuickAccessDisplayMode>("full");
  const [items, setItems] = useState<QuickAccessItem[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const sync = () => {
      setOwnerActive(loadQuickAccessOwnerActive());
      setDisplayMode(loadQuickAccessDisplayMode());
      setItems(loadQuickAccessItems());
    };
    sync();
    return subscribeQuickAccess(sync);
  }, []);

  const available = useMemo(
    () => QUICK_ACCESS_CATALOG.filter((candidate) => !items.some((item) => item.id === candidate.id)),
    [items],
  );

  function flash(message: string) {
    setSavedMessage(message);
    window.setTimeout(() => setSavedMessage(""), 1800);
  }

  function toggleOwnership() {
    const next = !ownerActive;
    setOwnerActive(next);
    saveQuickAccessOwnerActive(next);
    flash(next ? "Quick Access ownership reactivated." : "Quick Access ownership paused.");
  }

  function updateDisplayMode(mode: QuickAccessDisplayMode) {
    if (!ownerActive) return;
    setDisplayMode(mode);
    saveQuickAccessDisplayMode(mode);
    flash(mode === "full" ? "Showing icon + full name." : "Showing icons only.");
  }

  function move(index: number, direction: -1 | 1) {
    if (!ownerActive) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
    saveQuickAccessItems(next);
    flash("Quick Access order saved.");
  }

  function remove(id: string) {
    if (!ownerActive || items.length <= 1) return;
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    saveQuickAccessItems(next);
    flash("Shortcut removed.");
  }

  function add(id: string) {
    if (!ownerActive) return;
    const item = QUICK_ACCESS_CATALOG.find((candidate) => candidate.id === id);
    if (!item || items.some((existing) => existing.id === id)) return;
    const next = [...items, item];
    setItems(next);
    saveQuickAccessItems(next);
    flash(`${item.label} added.`);
  }

  function reset() {
    if (!ownerActive) return;
    const next = [...DEFAULT_QUICK_ACCESS];
    setItems(next);
    saveQuickAccessItems(next);
    flash("Default Quick Access restored.");
  }

  return (
    <SettingsSection
      icon="M5 12h14M12 5l7 7-7 7"
      tone="amber"
      title="Quick Access Ownership"
      desc="Own the global Quick Access bar shown directly below the Executive Header on every web and mobile page."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-400/20 dark:bg-amber-950/15">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 dark:text-white">
              <span className={`h-2 w-2 rounded-full ${ownerActive ? "bg-emerald-500" : "bg-slate-400"}`} />
              {ownerActive ? "Settings owns Quick Access" : "Quick Access ownership is inactive"}
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {ownerActive
                ? "This panel is the canonical editor for order, shortcuts and display mode."
                : "Reactivate ownership to edit the global bar from Theme & Display."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleOwnership}
            className={`rounded-xl px-3.5 py-2 text-xs font-black text-white shadow-sm transition ${ownerActive ? "bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600" : "bg-amber-600 hover:bg-amber-700"}`}
          >
            {ownerActive ? "Pause ownership" : "Reactivate editor"}
          </button>
        </div>

        <div className={`rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03] ${ownerActive ? "" : "opacity-60"}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white">Quick Access display</div>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Use the same mode on desktop, tablet and mobile.</p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-900">
              <button
                type="button"
                disabled={!ownerActive}
                aria-pressed={displayMode === "full"}
                onClick={() => updateDisplayMode("full")}
                className={`rounded-lg px-3 py-2 text-[10px] font-black transition ${displayMode === "full" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"} disabled:cursor-not-allowed`}
              >
                Icon + Name
              </button>
              <button
                type="button"
                disabled={!ownerActive}
                aria-pressed={displayMode === "icon"}
                onClick={() => updateDisplayMode("icon")}
                className={`rounded-lg px-3 py-2 text-[10px] font-black transition ${displayMode === "icon" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500 dark:text-slate-400"} disabled:cursor-not-allowed`}
              >
                Icon Only
              </button>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.02] ${ownerActive ? "" : "opacity-60"}`}>
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white">Pinned shortcuts ({items.length})</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Use ↑ / ↓ to order the same shortcuts on every device.</div>
            </div>
            <button type="button" disabled={!ownerActive} onClick={reset} className="rounded-lg px-2.5 py-1.5 text-[10px] font-black text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-950/20">Restore defaults</button>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-slate-900">
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={!ownerActive || index === 0} onClick={() => move(index, -1)} className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10" aria-label={`Move ${item.label} up`}>↑</button>
                  <button type="button" disabled={!ownerActive || index === items.length - 1} onClick={() => move(index, 1)} className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10" aria-label={`Move ${item.label} down`}>↓</button>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" aria-hidden="true">{item.icon === "quick-sale" ? "⚡" : item.icon === "cash-book" ? "▤" : item.icon === "customer-crm" ? "♙" : item.icon === "aeps" ? "▥" : item.icon === "dmt" ? "➤" : item.icon === "expenses" ? "↘" : item.icon === "day-close" ? "◷" : item.icon === "new-sale" ? "▣" : "•"}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-extrabold text-slate-900 dark:text-white">{item.label}</div>
                  <div className="truncate text-[10px] text-slate-400">{item.href}</div>
                </div>
                <button type="button" disabled={!ownerActive || items.length <= 1} onClick={() => remove(item.id)} className="shrink-0 rounded-lg px-2.5 py-2 text-[10px] font-black text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25 dark:text-rose-400 dark:hover:bg-rose-950/20">Remove</button>
              </div>
            ))}
          </div>
        </div>

        {available.length > 0 && (
          <div className={`flex flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/[0.02] ${ownerActive ? "" : "opacity-60"}`}>
            <div>
              <div className="text-xs font-extrabold text-slate-900 dark:text-white">Add a shortcut</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Add an application destination to the end of the bar.</div>
            </div>
            <select
              disabled={!ownerActive}
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) {
                  add(event.target.value);
                  event.currentTarget.value = "";
                }
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-blue-400 disabled:cursor-not-allowed dark:border-white/10 dark:bg-slate-900 dark:text-white"
            >
              <option value="" disabled>Add shortcut…</option>
              {available.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
        )}

        {savedMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950/20 dark:text-emerald-300">{savedMessage}</div>}
      </div>
    </SettingsSection>
  );
}
