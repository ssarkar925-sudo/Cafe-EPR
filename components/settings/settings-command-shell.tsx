"use client";

import type { ComponentProps, CSSProperties } from "react";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SettingsClient from "@/components/settings/settings-client";
import { SETTINGS_GROUPS, tabMeta, type SettingsGroup, type SettingsGroupItem } from "@/components/settings/settings-config";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;
type Props = SettingsClientProps;

const FORM_TABS = new Set(["general", "receipt", "tax"]);

const MODULE_LAYOUT: Record<string, { modal: string; contentWidth: string }> = {
  general: { modal: "max-w-[780px] h-[min(680px,calc(100vh-48px))]", contentWidth: "720px" },
  receipt: { modal: "max-w-[920px] h-[min(740px,calc(100vh-48px))]", contentWidth: "860px" },
  tax: { modal: "max-w-[720px] h-[min(560px,calc(100vh-48px))]", contentWidth: "660px" },
  "payment-accounts": { modal: "max-w-[1100px] h-[min(840px,calc(100vh-48px))]", contentWidth: "1040px" },
  "payment-methods": { modal: "max-w-[780px] h-[min(680px,calc(100vh-48px))]", contentWidth: "720px" },
  "quick-favorites": { modal: "max-w-[780px] h-[min(680px,calc(100vh-48px))]", contentWidth: "720px" },
  "business-setup": { modal: "max-w-[1120px] h-[min(820px,calc(100vh-48px))]", contentWidth: "1060px" },
  catalog: { modal: "max-w-[1080px] h-[min(800px,calc(100vh-48px))]", contentWidth: "1020px" },
  inventory: { modal: "max-w-[940px] h-[min(740px,calc(100vh-48px))]", contentWidth: "880px" },
  notifications: { modal: "max-w-[1080px] h-[min(820px,calc(100vh-48px))]", contentWidth: "1020px" },
  backup: { modal: "max-w-[860px] h-[min(640px,calc(100vh-48px))]", contentWidth: "800px" },
  security: { modal: "max-w-[860px] h-[min(680px,calc(100vh-48px))]", contentWidth: "800px" },
  other: { modal: "max-w-[860px] h-[min(660px,calc(100vh-48px))]", contentWidth: "800px" },
};

const DEFAULT_LAYOUT = { modal: "max-w-[880px] h-[min(720px,calc(100vh-48px))]", contentWidth: "820px" };

function Icon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function CloseIcon() {
  return <Icon path="M6 6l12 12M18 6L6 18" className="h-5 w-5" />;
}

const PINNED_STORAGE_KEY = "cafe_erp_pinned_settings";
const RECENT_STORAGE_KEY = "cafe_erp_recent_settings";

const DEFAULT_PINNED = ["payment-accounts", "quick-favorites", "general", "tax", "notifications", "other"];

function SettingsHub({ onOpen, onOpenWithSection }: { onOpen: (key: string) => void; onOpenWithSection: (key: string, section?: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [pinnedKeys, setPinnedKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_PINNED;
    try {
      const saved = localStorage.getItem(PINNED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PINNED;
    } catch {
      return DEFAULT_PINNED;
    }
  });

  const [recentKeys, setRecentKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(RECENT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  function togglePin(key: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPinnedKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function handleItemClick(item: SettingsGroupItem) {
    // Record recent
    setRecentKeys((prev) => {
      const filtered = prev.filter((k) => k !== item.key);
      const next = [item.key, ...filtered].slice(0, 5);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (item.directHref) {
      router.push(item.directHref);
      return;
    }

    if (item.section) {
      onOpenWithSection(item.key, item.section);
    } else {
      onOpen(item.key);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const totalModules = useMemo(() => SETTINGS_GROUPS.reduce((acc, g) => acc + g.items.length, 0), []);

  const filteredGroups = useMemo(() => {
    let list = SETTINGS_GROUPS;
    if (activeFilter !== "all") {
      list = list.filter((g) => g.id === activeFilter);
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            `${group.label} ${group.tagline} ${item.label} ${item.desc}`.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [query, activeFilter]);

  const totalMatches = useMemo(
    () => filteredGroups.reduce((acc, g) => acc + g.items.length, 0),
    [filteredGroups]
  );

  const allItemsMap = useMemo(() => {
    const map = new Map<string, SettingsGroupItem>();
    SETTINGS_GROUPS.forEach((g) => {
      g.items.forEach((it) => {
        map.set(it.key, it);
      });
    });
    return map;
  }, []);

  const pinnedItems = useMemo(() => {
    return pinnedKeys.map((k) => allItemsMap.get(k)).filter(Boolean) as SettingsGroupItem[];
  }, [pinnedKeys, allItemsMap]);

  const recentItems = useMemo(() => {
    return recentKeys.map((k) => allItemsMap.get(k)).filter(Boolean) as SettingsGroupItem[];
  }, [recentKeys, allItemsMap]);

  return (
    <div className="min-h-screen bg-slate-900/[0.02] dark:bg-slate-950">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-40 dark:opacity-20">
        <div className="absolute -left-[10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute right-[-5%] top-[10%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Executive Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
                <Icon
                  path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1 2.83 2.83l-.06-.06A1.65 1.65 0 0 0 19.4 9c.2.6.77 1 1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 1-1.51 1z"
                  className="h-6 w-6"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                    Settings & System Control
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Operational
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Control your business, operations, and application configurations from one central hub.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/ai/self-audit"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <Icon path="M12 2a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v1a1 1 0 0 0 1 1h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-1a1 1 0 0 0-1 1v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1a1 1 0 0 0-1-1h-1a2 2 0 0 1-2-2v-1a1 1 0 0 1-1-1H3a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V9a2 2 0 0 1 2-2h1a1 1 0 0 0 1-1V4a2 2 0 0 1 2-2h2z" className="h-4 w-4 text-purple-500" />
                Audit Diagnostics
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <Icon path="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" className="h-4 w-4 text-blue-500" />
                Counter Dashboard
              </Link>
            </div>
          </div>

          {/* Global Search Bar */}
          <div className="mt-6">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <Icon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="h-5 w-5" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings, payment instruments, commissions, BBPS, tax, staff, themes... (Press '/' or Ctrl+K)"
                className="w-full rounded-2xl border border-slate-200/90 bg-white/90 py-3.5 pl-11 pr-24 text-sm font-medium text-slate-900 shadow-sm backdrop-blur-md transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-slate-900/90 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-900 dark:focus:ring-blue-400/10"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 gap-1.5">
                {query ? (
                  <button
                    onClick={() => setQuery("")}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  >
                    <CloseIcon />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    /
                  </kbd>
                )}
                <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  {totalMatches} modules
                </span>
              </div>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveFilter("all")}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                activeFilter === "all"
                  ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                  : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white ring-1 ring-slate-200 dark:ring-white/10"
              }`}
            >
              All Categories ({totalModules})
            </button>
            {SETTINGS_GROUPS.map((g) => {
              const count = g.items.length;
              const isSelected = activeFilter === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveFilter(g.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                      : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white ring-1 ring-slate-200/80 dark:ring-white/10"
                  }`}
                >
                  {g.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Pinned Quick Settings Bar */}
        {pinnedItems.length > 0 && !query && activeFilter === "all" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  ⭐ Quick Access / Pinned Settings
                </span>
              </div>
              <span className="text-[11px] font-medium text-slate-400">
                Click star to pin/unpin
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {pinnedItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleItemClick(item)}
                  className="group relative flex flex-col items-start rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 text-left shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-blue-400/40 dark:hover:bg-white/[0.06]"
                >
                  <div className="flex w-full items-center justify-between">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${item.accent || "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"}`}>
                      <Icon path={item.icon} className="h-4 w-4" />
                    </div>
                    <span
                      onClick={(e) => togglePin(item.key, e)}
                      title="Unpin"
                      className="rounded-lg p-1 text-amber-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      ★
                    </span>
                  </div>
                  <span className="mt-2.5 text-xs font-bold text-slate-800 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400 line-clamp-1">
                    {item.label}
                  </span>
                  {item.directHref ? (
                    <span className="mt-0.5 text-[10px] font-semibold text-blue-500 dark:text-blue-400">
                      Open Page ↗
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      Control Panel
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recently Visited Settings */}
        {recentItems.length > 0 && !query && activeFilter === "all" && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                🕒 Recently Visited
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleItemClick(item)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <Icon path={item.icon} className="h-3.5 w-3.5 text-slate-400" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category Cards Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className={`group relative flex flex-col rounded-3xl border ${group.borderColor} bg-white/80 p-6 shadow-sm backdrop-blur-md transition hover:shadow-xl dark:bg-slate-900/60`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${group.color}`} />
                    <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                      {group.label}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {group.tagline}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {group.items.length}
                </span>
              </div>

              {/* Items List */}
              <div className="mt-5 divide-y divide-slate-100 dark:divide-white/5">
                {group.items.map((item) => {
                  const isPinned = pinnedKeys.includes(item.key);
                  return (
                    <div
                      key={item.key}
                      onClick={() => handleItemClick(item)}
                      className="group/item flex cursor-pointer items-start justify-between gap-3 py-3.5 transition hover:translate-x-1"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${item.accent || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                          <Icon path={item.icon} className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-slate-800 transition group-hover/item:text-blue-600 dark:text-slate-100 dark:group-hover/item:text-blue-400">
                              {item.label}
                            </span>
                            {item.badge && (
                              <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold ${item.badgeColor || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                            {item.desc}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pt-1">
                        <button
                          onClick={(e) => togglePin(item.key, e)}
                          title={isPinned ? "Unpin" : "Pin to top"}
                          className={`rounded-lg p-1 transition ${
                            isPinned
                              ? "text-amber-500 hover:bg-slate-100 dark:hover:bg-white/10"
                              : "text-slate-300 opacity-0 group-hover/item:opacity-100 hover:bg-slate-100 hover:text-amber-500 dark:text-slate-600 dark:hover:bg-white/10"
                          }`}
                        >
                          {isPinned ? "★" : "☆"}
                        </button>
                        {item.directHref ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover/item:bg-blue-600 group-hover/item:text-white dark:bg-white/5 dark:text-slate-400 dark:group-hover/item:bg-blue-500 dark:group-hover/item:text-white">
                            <Icon path="M7 17l10-10M17 7H7M17 7v10" className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition group-hover/item:bg-blue-600 group-hover/item:text-white dark:bg-white/5 dark:text-slate-400 dark:group-hover/item:bg-blue-500 dark:group-hover/item:text-white">
                            <Icon path="M9 18l6-6-6-6" className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SettingsCommandShell(props: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(props.initialTab || null);
  const [activeSection, setActiveSection] = useState<string | undefined>(props.initialSection);
  const router = useRouter();

  function openModule(key: string) {
    setActiveKey(key);
    setActiveSection(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("section");
    window.history.replaceState(null, "", url.toString());
  }

  function openModuleWithSection(key: string, section?: string) {
    setActiveKey(key);
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    if (section) url.searchParams.set("section", section);
    else url.searchParams.delete("section");
    window.history.replaceState(null, "", url.toString());
  }

  function closeModule() {
    setActiveKey(null);
    setActiveSection(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete("tab");
    url.searchParams.delete("section");
    window.history.replaceState(null, "", url.toString());
  }

  const activeMeta = activeKey ? tabMeta[activeKey] : null;
  const layout = activeKey ? MODULE_LAYOUT[activeKey] || DEFAULT_LAYOUT : DEFAULT_LAYOUT;

  return (
    <>
      <SettingsHub onOpen={openModule} onOpenWithSection={openModuleWithSection} />

      {activeKey && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <div
            onClick={closeModule}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
          />

          {/* Modal Container */}
          <div
            className={`relative z-10 w-full ${layout.modal} flex flex-col rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 animate-in zoom-in-95 duration-200 overflow-hidden`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                  <Icon
                    path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 1-1.51 1H21a2 2 0 1 1 0 4h-.09a2 2 0 0 1-1.51 1z"
                    className="h-4.5 w-4.5"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                      {activeMeta?.group || "Settings"}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {activeMeta?.title || "Module"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                    {activeMeta?.desc}
                  </p>
                </div>
              </div>

              <button
                onClick={closeModule}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <SettingsClient
                {...props}
                initialTab={activeKey}
                initialSection={activeSection}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
