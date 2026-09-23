"use client";

import { useState } from "react";
import { DirectIntakeForm, PurchaseDocumentForm, type ProductOption, type SupplierOption } from "../intake";

/** Intake entry (client tabs). Two documented paths, labeled exactly. */
export default function IntakeTabs({
  suppliers,
  products,
}: {
  suppliers: SupplierOption[];
  products: ProductOption[];
}) {
  const [tab, setTab] = useState<"document" | "direct">("document");
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label="Intake mode">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "document"}
          onClick={() => setTab("document")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "document"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          }`}
        >
          Purchase document
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "direct"}
          onClick={() => setTab("direct")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "direct"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          }`}
        >
          Direct lot intake
        </button>
      </div>
      {tab === "document" ? (
        <PurchaseDocumentForm suppliers={suppliers} products={products} />
      ) : (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            Direct intake creates stock lots without a purchase document (e.g. non-supplier
            receipts). Prefer the purchase document for supplier buys so payables stay complete.
          </p>
          <DirectIntakeForm suppliers={suppliers} products={products} />
        </div>
      )}
    </div>
  );
}
