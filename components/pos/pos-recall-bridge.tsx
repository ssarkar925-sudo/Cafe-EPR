"use client";

import { useEffect } from "react";

function buttonText(button: Element) {
  return (button.textContent || "").replace(/\s+/g, " ").trim();
}

export default function PosRecallBridge() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".pos-premium-root");
    if (!root) return;

    const sync = () => {
      const quick = Boolean(root.querySelector(".pos-cart-drawer"));
      const sharedRecall = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((button) => {
        return buttonText(button).startsWith("Recall") && !button.closest(".pos-billing-drawer");
      });

      sharedRecall?.style.setProperty("display", "none", "important");

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
        const recall = document.createElement("button");
        recall.type = "button";
        recall.dataset.localRecall = "standard";
        recall.className = "inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300";
        recall.textContent = "Recall";
        recall.title = "Recall held bills and drafts";
        recall.addEventListener("click", (event) => {
          event.preventDefault();
          sharedRecall?.click();
        });
        header.appendChild(recall);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
