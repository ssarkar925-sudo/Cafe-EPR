"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SettingsModal, { CATEGORIES, CardItem } from "@/components/settings/settings-modal";

const THEME_CLASSES: Record<string, { bg: string; text: string; border: string; hover: string }> = {
  "theme-blue": {
    bg: "bg-blue-50/80 dark:bg-blue-950/40",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/90 dark:border-blue-900/60",
    hover: "hover:border-blue-400 hover:shadow-blue-500/10",
  },
  "theme-emerald": {
    bg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/90 dark:border-emerald-900/60",
    hover: "hover:border-emerald-400 hover:shadow-emerald-500/10",
  },
  "theme-purple": {
    bg: "bg-purple-50/80 dark:bg-purple-950/40",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200/90 dark:border-purple-900/60",
    hover: "hover:border-purple-400 hover:shadow-purple-500/10",
  },
  "theme-amber": {
    bg: "bg-amber-50/80 dark:bg-amber-950/40",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/90 dark:border-amber-900/60",
    hover: "hover:border-amber-400 hover:shadow-amber-500/10",
  },
  "theme-indigo": {
    bg: "bg-indigo-50/80 dark:bg-indigo-950/40",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200/90 dark:border-indigo-900/60",
    hover: "hover:border-indigo-400 hover:shadow-indigo-500/10",
  },
  "theme-rose": {
    bg: "bg-rose-50/80 dark:bg-rose-950/40",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200/90 dark:border-rose-900/60",
    hover: "hover:border-rose-400 hover:shadow-rose-500/10",
  },
  "theme-cyan": {
    bg: "bg-cyan-50/80 dark:bg-cyan-950/40",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200/90 dark:border-cyan-900/60",
    hover: "hover:border-cyan-400 hover:shadow-cyan-500/10",
  },
};

export default function SettingsHubClient() {
  const searchParams = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>(undefined);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("business");
  const [searchQuery, setSearchQuery] = useState("");

  // Sync incoming search query parameters (e.g. from ThemeToggle link /settings?tab=other)
  useEffect(() => {
    const tab = searchParams?.get("tab");
    const card = searchParams?.get("card") || searchParams?.get("submodule");
    if (card) {
      setSelectedCardId(card);
      setModalOpen(true);
    } else if (tab) {
      if (tab === "other" || tab === "appearance") {
        setSelectedCardId("appearance");
        setSelectedCategoryId("automations");
        setModalOpen(true);
      } else if (tab === "commission") {
        setSelectedCardId("bbps-comm");
        setSelectedCategoryId("recharge");
        setModalOpen(true);
      } else if (tab === "accounts") {
        setSelectedCardId("pool-accounts");
        setSelectedCategoryId("finance");
        setModalOpen(true);
      }
    }
  }, [searchParams]);

  // Filter cards across categories
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CATEGORIES;

    return CATEGORIES.map((cat) => {
      const matchingCards = cat.cards.filter(
        (card) =>
          card.title.toLowerCase().includes(q) ||
          card.desc.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q) ||
          cat.groupName.toLowerCase().includes(q)
      );
      return {
        ...cat,
        cards: matchingCards,
      };
    }).filter((cat) => cat.cards.length > 0);
  }, [searchQuery]);

  const totalCardsCount = useMemo(() => {
    return filteredCategories.reduce((acc, cat) => acc + cat.cards.length, 0);
  }, [filteredCategories]);

  function handleCardClick(card: CardItem, categoryId: string) {
    if (card.directHref && !card.panelKey) {
      // If card specifies external directHref without in-popup panel, navigate
      window.location.href = card.directHref;
      return;
    }
    setSelectedCardId(card.id);
    setSelectedCategoryId(categoryId);
    setModalOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 space-y-6 sm:space-y-8 animate-fade-in">
      
      {/* TOP COMMAND HEADER */}
      <div className="flex flex-col gap-4 rounded-2xl sm:rounded-3xl border border-slate-200/90 bg-gradient-to-r from-white via-indigo-50/30 to-blue-50/40 p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900/90 dark:to-indigo-950/20 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <span className="text-xl">⚙️</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-2xl">
                  Settings &amp; System Control Center
                </h1>
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-black text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Live Operational Hub
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Organized master directory. Click any card to launch its in-popup editor with zero page reloads.
              </p>
            </div>
          </div>
        </div>

        {/* TOP QUICK ACTIONS & LIVE SEARCH */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings, masters & slabs..."
              className="w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 pl-9 text-xs text-slate-900 placeholder-slate-400 shadow-2xs transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950/80 dark:text-white dark:focus:ring-indigo-950"
            />
            <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex w-full sm:w-auto items-center gap-2">
            <Link
              href="/settings/defaults"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-50 transition dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300"
            >
              <span>Routing Defaults</span>
              <span className="text-indigo-400">→</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setSelectedCardId(undefined);
                setSelectedCategoryId("business");
                setModalOpen(true);
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <span>Open Popup</span>
              <kbd className="hidden sm:inline-block rounded border border-indigo-400/40 bg-indigo-700 px-1 py-0.2 font-mono text-[9px] text-white">⌘,</kbd>
            </button>
          </div>
        </div>
      </div>

      {/* QUICK HORIZONTAL CATEGORY JUMP PILLS */}
      {!searchQuery && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-indigo-300 hover:text-indigo-600 active:scale-95 transition dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-indigo-400"
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {cat.cards.length}
              </span>
            </a>
          ))}
        </div>
      )}

      {/* SEARCH STATS BAR (IF ACTIVE SEARCH) */}
      {searchQuery && (
        <div className="flex items-center justify-between rounded-2xl bg-indigo-50/70 border border-indigo-200/80 px-4 py-2 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200">
          <span>Found <strong>{totalCardsCount}</strong> matching setting card{totalCardsCount === 1 ? "" : "s"} for &ldquo;{searchQuery}&rdquo;</span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="font-bold underline hover:text-indigo-700"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* CATEGORIZED SECTIONS OF PREMIUM COLOR CARDS */}
      <div className="space-y-8">
        {filteredCategories.map((category) => {
          return (
            <section key={category.id} id={category.id} className="space-y-3.5 scroll-mt-20">
              
              {/* Category Header */}
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{category.icon}</span>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      {category.label}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {category.desc}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {category.cards.length} card{category.cards.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* Cards Grid (1 column on mobile, 2 on tablet, 3 on desktop, 4 on xl) */}
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {category.cards.map((card) => {
                  const themeStyle = THEME_CLASSES[card.theme] || THEME_CLASSES["theme-indigo"];
                  return (
                    <div
                      key={card.id}
                      onClick={() => handleCardClick(card, category.id)}
                      className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border ${themeStyle.border} bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${themeStyle.hover} dark:bg-slate-900`}
                    >
                      <div>
                        {/* Top Icon & Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${themeStyle.bg} text-xl shadow-2xs group-hover:scale-105 transition-transform`}>
                            {card.icon}
                          </div>
                          {card.badge && (
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${themeStyle.border} ${themeStyle.bg} ${themeStyle.text}`}>
                              {card.badge}
                            </span>
                          )}
                        </div>

                        {/* Title & Desc */}
                        <div className="mt-3.5">
                          <h3 className="text-sm font-bold text-slate-950 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                            {card.title}
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2 dark:text-slate-400">
                            {card.desc}
                          </p>
                        </div>
                      </div>

                      {/* Bottom Action Footer */}
                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-bold text-indigo-600 dark:border-slate-800/80 dark:text-indigo-400">
                        <span className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          <span>{card.panelKey ? "Open in Popup" : "Manage"}</span>
                          <span>&rarr;</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {card.panelKey ? "In-Modal Form" : "Master View"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </section>
          );
        })}
      </div>

      {/* UNIFIED CENTERED SETTINGS POPUP MODAL */}
      <SettingsModal
        open={modalOpen}
        initialCategory={selectedCategoryId}
        initialCardId={selectedCardId}
        onClose={() => {
          setModalOpen(false);
          setSelectedCardId(undefined);
        }}
      />

    </div>
  );
}
