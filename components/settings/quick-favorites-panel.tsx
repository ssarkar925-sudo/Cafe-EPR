"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { useToast } from "@/components/ui/use-toast";
import SettingsSection from "@/components/settings/settings-section";
import { type ServiceFavRow } from "@/components/settings/settings-config";

export default function QuickFavoritesPanel({
  initialServices,
  active,
}: {
  initialServices: ServiceFavRow[];
  active: boolean;
}) {
  const supabase = createClient();
  const { showToast, toastView } = useToast();
  const [services, setServices] = useState<ServiceFavRow[]>(initialServices);
  const [favBusyId, setFavBusyId] = useState<string | null>(null);

  async function toggleFavorite(row: ServiceFavRow) {
    const next = !row.is_quick_favorite;
    setFavBusyId(row.id);
    const max = services.reduce(
      (m, s) => (s.is_quick_favorite && (s.quick_sort ?? 0) > m ? s.quick_sort ?? 0 : m),
      0
    );
    const { error } = await supabase
      .from("services")
      .update({ is_quick_favorite: next, quick_sort: next ? max + 1 : 0 })
      .eq("id", row.id);
    setFavBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setServices((prev) =>
      prev.map((x) =>
        x.id === row.id ? { ...x, is_quick_favorite: next, quick_sort: next ? max + 1 : 0 } : x
      )
    );
    showToast(
      "success",
      next ? `Added "${row.name}" to POS Quick Favorites.` : `Removed "${row.name}" from Quick Favorites.`
    );
    logAudit({
      action: next ? "favorite" : "unfavorite",
      entity: "service",
      entity_id: row.id,
      description: `Quick Sale ${next ? "favourite added" : "favourite removed"}: ${row.name}`,
    });
  }

  async function moveFavorite(row: ServiceFavRow, dir: -1 | 1) {
    const favs = services
      .filter((s) => s.is_quick_favorite)
      .sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0));
    const idx = favs.findIndex((s) => s.id === row.id);
    const swapWith = favs[idx + dir];
    if (!swapWith) return;
    setFavBusyId(row.id);
    const a = row.quick_sort ?? 0;
    const b = swapWith.quick_sort ?? 0;
    const { error } = await supabase.from("services").upsert([
      { id: row.id, quick_sort: b },
      { id: swapWith.id, quick_sort: a },
    ]);
    setFavBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setServices((prev) =>
      prev.map((x) =>
        x.id === row.id
          ? { ...x, quick_sort: b }
          : x.id === swapWith.id
          ? { ...x, quick_sort: a }
          : x
      )
    );
  }

  const favoriteCount = services.filter((s) => s.is_quick_favorite).length;

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"
        tone="amber"
        title="Point of Sale Quick Favorites"
        desc="Pin your most frequent services to the POS fast-counter tab. Use the up/down controls to arrange their button order."
      >
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div>
            <p className="text-xs font-extrabold text-slate-900 dark:text-white">
              {favoriteCount} Active POS Fast-Key Buttons
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Pinned services appear prominently at the top of the Point of Sale counter.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {favoriteCount} Pinned
          </span>
        </div>

        <div className="space-y-2.5">
          {services.map((row) => {
            const fav = row.is_quick_favorite;
            const favs = services
              .filter((s) => s.is_quick_favorite)
              .sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0));
            const idx = favs.findIndex((s) => s.id === row.id);

            return (
              <div
                key={row.id}
                className={`flex items-center gap-3.5 rounded-2xl border p-3.5 transition ${
                  fav
                    ? "border-amber-400/80 bg-amber-50/30 shadow-xs dark:border-amber-500/40 dark:bg-amber-950/10"
                    : "border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-black text-white shadow-sm">
                  {row.name.slice(0, 1).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                    {row.name}
                  </p>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    ₹ {Number(row.sale_price).toFixed(2)}
                  </p>
                </div>

                {fav && (
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/10">
                    <button
                      type="button"
                      onClick={() => moveFavorite(row, -1)}
                      disabled={idx <= 0 || favBusyId === row.id}
                      className="rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      title="Move up in POS order"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveFavorite(row, 1)}
                      disabled={idx < 0 || idx >= favs.length - 1 || favBusyId === row.id}
                      className="rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                      title="Move down in POS order"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Toggle Button */}
                <button
                  type="button"
                  onClick={() => toggleFavorite(row)}
                  disabled={favBusyId === row.id}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                    fav ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                  title={fav ? "Remove from POS Fast-Keys" : "Add to POS Fast-Keys"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      fav ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}

          {services.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">
              No services found. Add services in Settings → Catalog first.
            </div>
          )}
        </div>
      </SettingsSection>

      {toastView}
    </div>
  );
}