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
    const max = services.reduce((m, s) => (s.is_quick_favorite && (s.quick_sort ?? 0) > m ? s.quick_sort ?? 0 : m), 0);
    const { error } = await supabase
      .from("services")
      .update({ is_quick_favorite: next, quick_sort: next ? max + 1 : 0 })
      .eq("id", row.id);
    setFavBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setServices((prev) => prev.map((x) => (x.id === row.id ? { ...x, is_quick_favorite: next, quick_sort: next ? max + 1 : 0 } : x)));
    showToast("success", next ? `${row.name} added to Quick Sale.` : `${row.name} removed from Quick Sale.`);
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
    const { error } = await supabase
      .from("services")
      .upsert([
        { id: row.id, quick_sort: b },
        { id: swapWith.id, quick_sort: a },
      ]);
    setFavBusyId(null);
    if (error) {
      showToast("error", error.message);
      return;
    }
    setServices((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, quick_sort: b } : x.id === swapWith.id ? { ...x, quick_sort: a } : x))
    );
  }

  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z"
        tone="amber"
        title="Quick Sale Favourites"
        desc='Choose which services show as big "Popular" buttons on the Quick Sale counter. Use the arrows to order them.'
      >
        <div className="space-y-2">
          {services.map((row) => {
            const fav = row.is_quick_favorite;
            const favs = services.filter((s) => s.is_quick_favorite).sort((a, b) => (a.quick_sort ?? 0) - (b.quick_sort ?? 0));
            const idx = favs.findIndex((s) => s.id === row.id);
            return (
              <div key={row.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-bold text-white">
                  {row.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{row.name}</span>
                  <span className="block text-[11px] text-slate-400">₹{Number(row.sale_price)}</span>
                </span>
                {fav && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => moveFavorite(row, -1)}
                      disabled={idx <= 0 || favBusyId === row.id}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                      title="Move up"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="m18 15-6-6-6 6" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveFavorite(row, 1)}
                      disabled={idx < 0 || idx >= favs.length - 1 || favBusyId === row.id}
                      className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700 disabled:opacity-30"
                      title="Move down"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => toggleFavorite(row)}
                  disabled={favBusyId === row.id}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    fav ? "bg-amber-500" : "bg-slate-300"
                  } disabled:opacity-50`}
                  title={fav ? "Remove from favourites" : "Add to favourites"}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      fav ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
          {services.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400 ring-1 ring-slate-100">
              No services yet — add some in Settings → Catalog → Services first.
            </p>
          )}
        </div>
      </SettingsSection>

      {toastView}
    </div>
  );
}