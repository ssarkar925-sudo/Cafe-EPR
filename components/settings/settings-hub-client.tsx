"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SettingsModal, { CATEGORIES, CardItem } from "@/components/settings/settings-modal";
import { useTheme, ACCENT_PALETTES } from "@/components/theme-provider";

const THEME_CLASSES: Record<string, { bg: string; text: string; border: string; hover: string; laser: string; glow: string; iconBg: string }> = {
  "theme-blue": {
    bg: "bg-blue-50/90 dark:bg-blue-950/50",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-200/90 dark:border-blue-900/60",
    hover: "hover:border-blue-400 hover:shadow-blue-500/15",
    laser: "from-blue-500 via-indigo-400 to-cyan-400",
    glow: "hover:shadow-blue-500/15",
    iconBg: "bg-gradient-to-tr from-blue-500 to-indigo-600 text-white",
  },
  "theme-emerald": {
    bg: "bg-emerald-50/90 dark:bg-emerald-950/50",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/90 dark:border-emerald-900/60",
    hover: "hover:border-emerald-400 hover:shadow-emerald-500/15",
    laser: "from-emerald-500 via-teal-400 to-cyan-400",
    glow: "hover:shadow-emerald-500/15",
    iconBg: "bg-gradient-to-tr from-emerald-500 to-teal-600 text-white",
  },
  "theme-purple": {
    bg: "bg-purple-50/90 dark:bg-purple-950/50",
    text: "text-purple-700 dark:text-purple-300",
    border: "border-purple-200/90 dark:border-purple-900/60",
    hover: "hover:border-purple-400 hover:shadow-purple-500/15",
    laser: "from-violet-500 via-purple-400 to-indigo-400",
    glow: "hover:shadow-purple-500/15",
    iconBg: "bg-gradient-to-tr from-violet-600 to-purple-600 text-white",
  },
  "theme-amber": {
    bg: "bg-amber-50/90 dark:bg-amber-950/50",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/90 dark:border-amber-900/60",
    hover: "hover:border-amber-400 hover:shadow-amber-500/15",
    laser: "from-amber-500 via-orange-400 to-rose-400",
    glow: "hover:shadow-amber-500/15",
    iconBg: "bg-gradient-to-tr from-amber-500 to-orange-600 text-white",
  },
  "theme-indigo": {
    bg: "bg-indigo-50/90 dark:bg-indigo-950/50",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200/90 dark:border-indigo-900/60",
    hover: "hover:border-indigo-400 hover:shadow-indigo-500/15",
    laser: "from-indigo-500 via-purple-400 to-blue-400",
    glow: "hover:shadow-indigo-500/15",
    iconBg: "bg-gradient-to-tr from-indigo-500 to-blue-600 text-white",
  },
  "theme-rose": {
    bg: "bg-rose-50/90 dark:bg-rose-950/50",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200/90 dark:border-rose-900/60",
    hover: "hover:border-rose-400 hover:shadow-rose-500/15",
    laser: "from-rose-500 via-pink-400 to-amber-400",
    glow: "hover:shadow-rose-500/15",
    iconBg: "bg-gradient-to-tr from-rose-500 to-pink-600 text-white",
  },
  "theme-cyan": {
    bg: "bg-cyan-50/90 dark:bg-cyan-950/50",
    text: "text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-200/90 dark:border-cyan-900/60",
    hover: "hover:border-cyan-400 hover:shadow-cyan-500/15",
    laser: "from-cyan-500 via-teal-400 to-blue-400",
    glow: "hover:shadow-cyan-500/15",
    iconBg: "bg-gradient-to-tr from-cyan-500 to-teal-600 text-white",
  },
};

export default function SettingsHubClient() {
  const searchParams = useSearchParams();
  const { resolvedDisplayMode, accent, density, gradientPreset, gradientEnabled } = useTheme();
  const activeAccentObj = ACCENT_PALETTES.find((p) => p.key === accent) || ACCENT_PALETTES[2];

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

        {/* LIVE SEARCH BOX */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings, masters & slabs..."
            className="w-full rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2.5 pl-9 text-xs text-slate-900 placeholder-slate-400 shadow-2xs transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-800 dark:bg-slate-950/80 dark:text-white dark:focus:ring-indigo-950"
          />
          <span className="absolute left-3 top-3 text-xs text-slate-400">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              ✕
            </button>
          )}
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
                  const isAppearance = card.id === "appearance";

                  return (
                    <div
                      key={card.id}
                      onClick={() => handleCardClick(card, category.id)}
                      className={`settings-hub-card group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border ${themeStyle.border} bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md ${themeStyle.hover} dark:bg-slate-900`}
                    >
                      {/* Top Laser Accent Streak */}
                      <div className={`card-laser-top bg-gradient-to-r ${themeStyle.laser}`} />

                      <div>
                        {/* Top Icon & Badge */}
                        <div className="flex items-start justify-between gap-2">
                          {isAppearance ? (
                            /* 3D Glowing Animated Icon Badge for Theme & Display */
                            <div className="settings-hub-icon-badge h-11 w-11 shrink-0 bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-md shadow-violet-500/25">
                              <svg className="w-6 h-6 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4 4 4 0 014-4c.7 0 1.37.18 1.95.49a5.98 5.98 0 018.1-8.1A6 6 0 1119 16c0 .41-.04.82-.12 1.22A4 4 0 0115 21H7z" />
                                <circle cx="12" cy="7" r="1.5" fill="#f59e0b" />
                                <circle cx="8" cy="11" r="1.5" fill="#06b6d4" />
                                <circle cx="15" cy="12" r="1.5" fill="#ec4899" />
                              </svg>
                            </div>
                          ) : (
                            <div className={`settings-hub-icon-badge h-11 w-11 shrink-0 border border-slate-200/60 dark:border-white/10 ${themeStyle.bg} text-xl shadow-2xs`}>
                              <span>{card.icon}</span>
                            </div>
                          )}

                          {/* Dynamic or static badge */}
                          {isAppearance ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="flex items-center gap-1.5 rounded-full border border-violet-300/80 bg-violet-100/90 dark:border-violet-700/60 dark:bg-violet-950/80 px-2 py-0.5 text-[9px] font-black uppercase text-violet-800 dark:text-violet-300 shadow-2xs">
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-ping" />
                                <span>{resolvedDisplayMode}</span>
                              </span>
                              <span className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">
                                {density}
                              </span>
                            </div>
                          ) : card.badge ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${themeStyle.border} ${themeStyle.bg} ${themeStyle.text}`}>
                              {card.badge}
                            </span>
                          ) : null}
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

                        {/* Live active preset chip for Theme card */}
                        {isAppearance && (
                          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50/90 p-2 border border-slate-100 dark:bg-slate-950/60 dark:border-slate-800/80">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-violet-500/30" style={{ backgroundColor: activeAccentObj.colorHex }} />
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate capitalize">{activeAccentObj.label}</span>
                            </div>
                            <span className="shrink-0 text-[9px] font-extrabold text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-200/60 dark:border-cyan-800/50">
                              {gradientEnabled ? gradientPreset : "Standard"}
                            </span>
                          </div>
                        )}
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
