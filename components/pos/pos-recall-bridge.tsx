"use client";

import { useEffect, useRef, useState } from "react";
import { inr } from "@/lib/format";

function buttonText(button: Element) {
  return (button.textContent || "").replace(/\s+/g, " ").trim();
}

type HeldLine = {
  name?: string;
  qty?: number | string;
  amount?: number | string;
  rate?: number | string;
};

type HeldBill = {
  savedAt: string;
  label?: string;
  cart?: HeldLine[];
  customerId?: string;
  discount?: string | number;
  payments?: { instrument_id?: string; method?: string; amount?: string | number }[];
};

type RecallKind = "standard" | "quick";

type RecallState = {
  kind: RecallKind;
  bills: HeldBill[];
};

const STANDARD_HELD_KEY = "pos_held_bills";
const QUICK_HELD_KEY = "quick_held";

function readHeld(key: string): HeldBill[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as HeldBill[]) : [];
  } catch {
    return [];
  }
}

function savedLabel(savedAt: string) {
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return savedAt;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function billValue(b: HeldBill) {
  return Number(
    (b.cart ?? []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0) - (Number(b.discount) || 0)
  );
}

function itemCount(b: HeldBill) {
  return (b.cart ?? []).reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
}

function paymentSummary(b: HeldBill) {
  return (b.payments ?? [])
    .filter((p) => Number(p.amount) > 0)
    .map((p) => `${p.method || "Payment"} ${inr(Number(p.amount) || 0)}`)
    .join(" · ");
}

function findExactButtons(root: Element | Document, text: string) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter((button) => buttonText(button) === text);
}

export default function PosRecallBridge() {
  const [recall, setRecall] = useState<RecallState | null>(null);
  const suppressRef = useRef(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pos-premium-root");
    if (!root) return;

    const findSharedRecall = () =>
      Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
        if (button.closest("[data-pos-recall-bridge='true']")) return false;
        return buttonText(button).startsWith("Recall") && !button.closest(".pos-billing-drawer");
      });

    const findTopHoldBill = () =>
      Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
        if (button.closest("[data-pos-recall-bridge='true']")) return false;
        return buttonText(button) === "Hold Bill" && !button.closest(".pos-billing-drawer");
      });

    const sync = () => {
      const quick = Boolean(root.querySelector(".pos-cart-drawer"));
      const sharedRecall = findSharedRecall();

      sharedRecall?.style.setProperty("display", "none", "important");
      findTopHoldBill()?.style.setProperty("display", "none", "important");

      const billing = root.querySelector<HTMLElement>(".pos-billing-drawer:not(.pos-cart-drawer)");
      const card = billing?.querySelector<HTMLElement>('[data-sticky-drawer="true"]');
      const header = card?.firstElementChild as HTMLElement | null;
      if (!header) return;

      const old = header.querySelector<HTMLElement>('[data-local-recall="standard"]');
      if (quick) {
        old?.remove();
        return;
      }

      if (!old) {
        const recallButton = document.createElement("button");
        recallButton.type = "button";
        recallButton.dataset.localRecall = "standard";
        recallButton.className = "inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300";
        recallButton.textContent = "Recall";
        recallButton.title = "Recall held bills and drafts";
        header.appendChild(recallButton);
      }
    };

    const openRecall = (kind: RecallKind) => {
      const key = kind === "quick" ? QUICK_HELD_KEY : STANDARD_HELD_KEY;
      const raw = readHeld(key);
      setRecall({
        kind,
        bills: kind === "quick" ? raw.slice().reverse() : raw,
      });
    };

    const onClick = (event: MouseEvent) => {
      if (suppressRef.current) return;
      const target = event.target as Element | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button || !root.contains(button)) return;
      if (button.closest("[data-pos-recall-bridge='true']")) return;

      const text = buttonText(button);
      if (!text.startsWith("Recall")) return;

      const kind: RecallKind = button.closest(".pos-cart-drawer") ? "quick" : "standard";
      event.preventDefault();
      event.stopPropagation();
      openRecall(kind);
    };

    sync();
    root.addEventListener("click", onClick, true);
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      root.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, []);

  const performOriginalAction = (kind: RecallKind, index: number, action: "recall" | "discard") => {
    const root = document.querySelector<HTMLElement>(".pos-premium-root");
    if (!root) return;

    const sharedRecall = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
      if (button.closest("[data-pos-recall-bridge='true']")) return false;
      return buttonText(button).startsWith("Recall") && !button.closest(".pos-billing-drawer");
    });

    const originalRecall =
      kind === "standard"
        ? sharedRecall
        : Array.from(root.querySelectorAll<HTMLButtonElement>(".pos-cart-drawer button")).find((button) => buttonText(button).startsWith("Recall"));

    if (!originalRecall) {
      setRecall(null);
      return;
    }

    suppressRef.current = true;
    originalRecall.click();
    suppressRef.current = false;

    let attempts = 0;
    const poll = () => {
      attempts += 1;
      const title = Array.from(document.querySelectorAll<HTMLElement>("h2")).find((h) =>
        kind === "standard" ? buttonText(h).includes("Held Bills & Drafts") : buttonText(h) === "Held Sales"
      );

      const dialog = title?.parentElement?.parentElement ?? null;
      const buttonSet =
        kind === "standard"
          ? findExactButtons(dialog ?? document, action === "recall" ? "Resume" : "Discard")
          : findExactButtons(dialog ?? document, action === "recall" ? "Recall" : "Discard");
      const chosen = buttonSet[index];

      if (chosen) {
        suppressRef.current = true;
        chosen.click();
        suppressRef.current = false;
        setRecall(null);
        return;
      }

      if (attempts < 15) {
        window.setTimeout(poll, 40);
      } else {
        setRecall(null);
      }
    };

    window.setTimeout(poll, 30);
  };

  return (
    recall && (
      <div
        data-pos-recall-bridge="true"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRecall(null);
        }}
      >
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                Recall {recall.kind === "quick" ? "Quick Sales" : "Held Bills"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Check the bill details first, then recall the exact sale you need.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRecall(null)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Close
            </button>
          </div>

          {recall.bills.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">No held bills found.</div>
          ) : (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-5">
              {recall.bills.map((bill, index) => {
                const lines = bill.cart ?? [];
                const shownLines = lines.slice(0, 6);
                const more = Math.max(0, lines.length - shownLines.length);
                const value = billValue(bill);
                const payment = paymentSummary(bill);
                return (
                  <div
                    key={`${bill.savedAt}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {bill.label || (recall.kind === "quick" ? "Held Quick Sale" : "Held Bill")}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-white/10">
                            {itemCount(bill)} items
                          </span>
                          {bill.customerId ? (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              Customer linked
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              Walk-in
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">Saved {savedLabel(bill.savedAt)}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Value</p>
                        <p className="text-lg font-black text-blue-600">{inr(Math.max(0, value))}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bill items</p>
                      <div className="mt-2 space-y-1.5">
                        {shownLines.map((line, lineIndex) => (
                          <div key={`${line.name}-${lineIndex}`} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700 dark:text-slate-200">
                              {line.name || "Item"}
                              <span className="ml-1 text-slate-400">× {Number(line.qty) || 0}</span>
                            </span>
                            <span className="shrink-0 font-bold text-slate-800 dark:text-white">{inr(Number(line.amount) || 0)}</span>
                          </div>
                        ))}
                        {more > 0 && <p className="pt-1 text-[11px] font-semibold text-slate-400">+ {more} more item{more === 1 ? "" : "s"}</p>}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="space-y-0.5 text-slate-400">
                        {Number(bill.discount) > 0 && <p>Discount: {inr(Number(bill.discount))}</p>}
                        {payment && <p>Saved payment: {payment}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => performOriginalAction(recall.kind, index, "discard")}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={() => performOriginalAction(recall.kind, index, "recall")}
                          className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-black text-white shadow-sm hover:bg-blue-700"
                        >
                          Recall This Bill
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    )
  );
}
