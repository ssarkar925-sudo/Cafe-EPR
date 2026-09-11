"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { QuickAccessItem } from "@/components/quick-access-registry";
import {
  loadQuickAccessDisplayMode,
  loadQuickAccessItems,
  saveQuickAccessDisplayMode,
  subscribeQuickAccess,
  type QuickAccessDisplayMode,
} from "@/components/quick-access-store";

const ICONS: Record<string, string> = {
  dashboard: "⌂",
  "new-sale": "▣",
  "quick-sale": "⚡",
  "customer-crm": "♙",
  "cash-book": "▤",
  aeps: "▥",
  dmt: "➤",
  expenses: "↘",
  "day-close": "◷",
  invoices: "▧",
  returns: "↶",
  products: "◇",
  services: "✦",
  categories: "▦",
  purchases: "🛒",
  suppliers: "▰",
  "bill-payment": "▣",
  recharge: "◉",
  "google-play": "▶",
  "utility-bills": "▤",
  upi: "⌁",
  whatsapp: "◌",
  "finance-hub": "▥",
  journal: "≣",
  "trial-balance": "⚖",
  settlements: "⇄",
  pnl: "↗",
  reconciliation: "⌕",
  opening: "⌂",
  reports: "▥",
  gst: "▧",
  "tax-prep": "▤",
  "audit-log": "◉",
  ai: "✦",
  "self-audit": "✓",
  staff: "♙",
  security: "⌘",
  settings: "⚙",
};

function matchesCurrentRoute(item: QuickAccessItem, pathname: string, searchParams: URLSearchParams) {
  const [hrefPath, hrefQuery = ""] = item.href.split("?");
  if (hrefPath !== pathname) return false;
  if (!hrefQuery) return true;

  const target = new URLSearchParams(hrefQuery);
  for (const [key, value] of target.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}

export default function GlobalQuickAccess() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const [items, setItems] = useState<QuickAccessItem[]>(() => loadQuickAccessItems());
  const [displayMode, setDisplayMode] = useState<QuickAccessDisplayMode>(() => loadQuickAccessDisplayMode());

  useEffect(() => {
    const sync = () => {
      setItems(loadQuickAccessItems());
      setDisplayMode(loadQuickAccessDisplayMode());
    };
    sync();
    return subscribeQuickAccess(sync);
  }, []);

  function changeDisplayMode(mode: QuickAccessDisplayMode) {
    setDisplayMode(mode);
    saveQuickAccessDisplayMode(mode);
  }

  return (
    <nav className="cafe-quick-access" aria-label="Quick Access">
      <div className="cafe-quick-access__inner">
        <div className="cafe-quick-access__label" aria-hidden="true">
          <span className="cafe-quick-access__label-icon">⌁</span>
          <span>Quick Access</span>
        </div>

        <div className="cafe-quick-access__scroll">
          {items.map((item) => {
            const active = matchesCurrentRoute(item, pathname, searchParams);
            const icon = ICONS[item.icon] || "•";
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`cafe-quick-access__item ${active ? "cafe-quick-access__item--active" : ""} ${displayMode === "icon" ? "cafe-quick-access__item--icon-only" : ""}`}
              >
                <span className="cafe-quick-access__icon" aria-hidden="true">{icon}</span>
                {displayMode === "full" && <span className="cafe-quick-access__text">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <div className="cafe-quick-access__mode" role="group" aria-label="Quick Access display mode">
          <button
            type="button"
            aria-pressed={displayMode === "full"}
            onClick={() => changeDisplayMode("full")}
            title="Show icon and full name"
            className={`cafe-quick-access__mode-button ${displayMode === "full" ? "is-active" : ""}`}
          >
            <span aria-hidden="true">▤</span>
            <span>Names</span>
          </button>
          <button
            type="button"
            aria-pressed={displayMode === "icon"}
            onClick={() => changeDisplayMode("icon")}
            title="Show icons only"
            className={`cafe-quick-access__mode-button ${displayMode === "icon" ? "is-active" : ""}`}
          >
            <span aria-hidden="true">◈</span>
            <span>Icons</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
