"use client";

import type { ComponentProps, CSSProperties } from "react";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import SettingsClient from "@/components/settings/settings-client";
import { SETTINGS_GROUPS, tabMeta, type SettingsGroup } from "@/components/settings/settings-config";

type SettingsClientProps = ComponentProps<typeof SettingsClient>;
type Props = SettingsClientProps;

const FORM_TABS = new Set(["general", "receipt", "tax"]);

const MODULE_LAYOUT: Record<string, { modal: string; contentWidth: string }> = {
  general: { modal: "max-w-[780px] h-[min(680px,calc(100vh-48px))]", contentWidth: "720px" },
  receipt: { modal: "max-w-[920px] h-[min(740px,calc(100vh-48px))]", contentWidth: "860px" },
  tax: { modal: "max-w-[720px] h-[min(560px,calc(100vh-48px))]", contentWidth: "660px" },
  "payment-accounts": { modal: "max-w-[1020px] h-[min(780px,calc(100vh-48px))]", contentWidth: "960px" },
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

function SettingsHub({ onOpen }: { onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="min-h-screen bg-slate-900/[0.02] dark:bg-slate-950">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-40 dark:opacity-20">
        <div className="absolute -left-[10%] top-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute right-[-5%] top-[10%] h-[600px] w-[600px] rounded-full bg-indigo-500/10 blur-[140px]" />
        <div className="absolute bottom-[-10%] left-[30%] h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Header Hero Section */}
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/80 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-blue-700 shadow-sm backdrop-blur-md dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              Settings &amp; Preferences Hub
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              System Administration
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Centralized control room for your shop profiles, payment rails, catalog masters, WhatsApp automations, and security controls.
            </p>
          </div>

          {/* Quick Search Bar */}
          <div className="relative w-full lg:w-[380px]">
            <Icon
              path="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings modules… (Press / to focus)"
              className="h-12 w-full rounded-2xl border border-slate-200/90 bg-white/90 pl-11 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-900"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <CloseIcon />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 sm:inline-block dark:border-white/10 dark:bg-slate-800 dark:text-slate-400">
                /
              </kbd>
            )}
          </div>
        </div>

        {/* Category Quick Filter Pills */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeFilter === "all"
                ? "bg-slate-900 text-white shadow-md shadow-slate-900/20 dark:bg-white dark:text-slate-900"
                : "bg-white/80 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white hover:text-slate-900 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-white/10 dark:hover:bg-slate-900 dark:hover:text-white"
            }`}
          >
            <span>All Modules</span>
            <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px] dark:bg-white/20">
              {totalModules}
            </span>
          </button>
          {SETTINGS_GROUPS.map((g) => {
            const isCurrent = activeFilter === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveFilter(g.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 dark:bg-blue-500 dark:text-white"
                    : "bg-white/80 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white hover:text-slate-900 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-white/10 dark:hover:bg-slate-900 dark:hover:text-white"
                }`}
              >
                <span>{g.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isCurrent ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                  }`}
                >
                  {g.items.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Group Cards Grid */}
        <div className="grid gap-6 xl:grid-cols-2">
          {filteredGroups.map((group) => (
            <section
              key={group.id}
              className={`group/section relative overflow-hidden rounded-[26px] border ${group.borderColor} bg-white/90 p-1 shadow-[0_4px_25px_rgba(15,23,42,.04)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_12px_40px_rgba(15,23,42,.08)] dark:border-white/10 dark:bg-slate-900/80`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${group.color}`} />
                    <h2 className="truncate text-base font-extrabold text-slate-900 dark:text-white">
                      {group.label}
                    </h2>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                    {group.tagline}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  {group.items.length} {group.items.length === 1 ? "module" : "modules"}
                </span>
              </div>

              {/* Module Buttons Grid */}
              <div className="grid gap-2.5 p-3.5 sm:grid-cols-2">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onOpen(item.key)}
                    className="group relative flex min-h-[110px] items-start gap-3.5 rounded-[20px] border border-transparent bg-slate-50/50 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-md hover:shadow-slate-200/50 dark:bg-white/[0.02] dark:hover:border-white/15 dark:hover:bg-slate-800/80 dark:hover:shadow-none"
                  >
                    {/* Icon Container */}
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] transition-all duration-200 group-hover:scale-105 group-hover:shadow-md ${
                        item.accent || "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                      }`}
                    >
                      <Icon path={item.icon} className="h-5 w-5" />
                    </span>

                    {/* Content */}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-slate-900 group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black tracking-wide ${
                              item.badgeColor || "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {item.desc}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-blue-400">
                        Open settings <span aria-hidden="true">→</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Empty Search Result State */}
        {!filteredGroups.length && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-12 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/50">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <Icon path="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" className="h-6 w-6" />
            </div>
            <p className="mt-4 font-bold text-slate-800 dark:text-slate-200">
              No matching settings modules found
            </p>
            <p className="mt-1 text-sm text-slate-400">
              No settings match &ldquo;{query}&rdquo;. Try another search term or reset the category filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveFilter("all");
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleWindow({ props, tab, onClose }: { props: Props; tab: string; onClose: () => void }) {
  const meta = tabMeta[tab] ?? { title: "Settings", desc: "", group: "System Administration" };
  const layout = MODULE_LAYOUT[tab] ?? DEFAULT_LAYOUT;
  const isFormTab = FORM_TABS.has(tab);
  const shellStyle = { ["--settings-content-width" as string]: layout.contentWidth } as CSSProperties;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md transition-all sm:p-4 lg:p-6 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={shellStyle}
        className={`floating-mac-window settings-module-shell ${
          isFormTab ? "settings-module-shell--form" : "settings-module-shell--action"
        } flex w-full ${layout.modal} flex-col overflow-hidden animate-modal-panel`}
      >
        {/* macOS Window Top Bar */}
        <div className="mac-window-header shrink-0">
          <div className="flex items-center gap-3">
            {/* Traffic Lights */}
            <div className="mac-traffic-lights group">
              <button
                type="button"
                onClick={onClose}
                title="Close window (Esc)"
                className="mac-dot mac-dot-close focus:outline-none"
                aria-label="Close"
              />
              <button
                type="button"
                onClick={onClose}
                title="Minimize"
                className="mac-dot mac-dot-min focus:outline-none"
                aria-label="Minimize"
              />
              <button
                type="button"
                title="Maximize"
                className="mac-dot mac-dot-max focus:outline-none"
                aria-label="Maximize"
              />
            </div>

            <div className="flex items-center gap-2 pl-2">
              <span className="text-sm">⚙️</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400 dark:text-slate-500">
                  {meta.group}
                </span>
                <span className="text-[10px] text-slate-300 dark:text-slate-600">/</span>
                <span className="text-xs font-black text-slate-900 dark:text-white">
                  {meta.title}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400 sm:inline-block dark:border-white/10 dark:bg-slate-800 dark:text-slate-400">
              Esc
            </kbd>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings window"
              title="Close (Esc)"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Modal Window Content Scroll Area */}
        <div className="settings-module-content min-h-0 flex-1 overflow-y-auto bg-slate-50/60 dark:bg-slate-950">
          <SettingsClient {...props} initialTab={tab} key={tab} />
        </div>

        {/* Global Styles for Embedding inside the Module Shell */}
        <style jsx global>{`
          .settings-module-content > div > div:first-child {
            display: none !important;
          }
          .settings-module-content > div > div:nth-child(2) > div:first-child {
            display: none !important;
          }
          .settings-module-content > div > div:nth-child(2) {
            display: block !important;
          }
          .settings-module-content > div > div:nth-child(2) > div:last-child {
            display: block !important;
            width: 100% !important;
            max-width: var(--settings-content-width) !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          .settings-module-content > div > div:nth-child(2) > div:last-child > div {
            width: 100% !important;
            max-width: none !important;
          }
          .settings-module-content > div {
            width: 100% !important;
            max-width: none !important;
            padding: 1rem 1.25rem 2rem !important;
            margin: 0 !important;
          }

          /* Form save bar controls inside modal */
          .settings-module-shell--form .settings-module-content > div > div:first-child {
            display: flex !important;
            align-items: center !important;
            justify-content: flex-end !important;
            margin: 0 0 0.75rem !important;
            padding: 0 0 0.75rem !important;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2) !important;
          }
          .settings-module-shell--form .settings-module-content > div > div:first-child > div:first-child {
            display: none !important;
          }
          .settings-module-shell--form .settings-module-content > div > div:first-child > div:last-child {
            display: flex !important;
            width: auto !important;
            align-items: center !important;
            justify-content: flex-end !important;
            gap: 0.75rem !important;
          }
          .settings-module-shell--form .settings-module-content > div > div:first-child > div:last-child button {
            min-height: 38px !important;
            height: 38px !important;
            padding: 0.5rem 1rem !important;
            border-radius: 0.75rem !important;
            font-size: 0.8rem !important;
            font-weight: 700 !important;
          }

          .settings-module-shell--action .settings-module-content > div > div:first-child {
            display: none !important;
          }

          @media (max-width: 900px) {
            .settings-module-content > div {
              padding: 0.75rem !important;
            }
            .settings-module-content > div > div:nth-child(2) > div:last-child {
              max-width: calc(100vw - 48px) !important;
            }
          }
          @media (max-width: 640px) {
            .settings-module-content > div {
              padding: 0.5rem !important;
            }
            .settings-module-content > div > div:nth-child(2) > div:last-child {
              max-width: 100% !important;
            }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

export default function SettingsCommandShell(props: Props) {
  const [openTab, setOpenTab] = useState<string | null>(
    props.initialTab && props.initialTab !== "general" ? props.initialTab : null
  );

  function openModule(key: string) {
    setOpenTab(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("section");
    window.history.pushState(null, "", url.toString());
  }

  return (
    <>
      <SettingsHub onOpen={openModule} />
      {openTab && (
        <ModuleWindow
          props={props}
          tab={openTab}
          onClose={() => {
            setOpenTab(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("tab");
            url.searchParams.delete("section");
            window.history.pushState(null, "", url.toString());
          }}
        />
      )}
    </>
  );
}
