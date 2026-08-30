"use client";

import { useEffect } from "react";
import RechargeWorkspace from "@/components/business/recharge-workspace";
import type {
  CustomerRow,
  PaymentInstrument,
  RechargeProvider,
  RechargeSlab,
  Txn,
} from "@/components/business/recharge-workspace";

type Props = {
  initialTransactions: Txn[];
  initialCustomers: CustomerRow[];
  initialRechargeProviders: RechargeProvider[];
  initialRechargeSlabs: RechargeSlab[];
  initialPaymentInstruments: PaymentInstrument[];
};

type LookupResponse = {
  ok: boolean;
  configured?: boolean;
  operatorCode?: string;
  operatorName?: string;
  circleId?: string | null;
  circleName?: string | null;
  connectionType?: string | null;
  error?: string;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/vodafone\\s*idea/g, "vi")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const operatorAliases: Record<string, string[]> = {
  airtel: ["airtel", "bharti airtel"],
  jio: ["jio", "reliance jio"],
  vi: ["vi", "vodafone idea", "vodafone", "idea"],
  bsnl: ["bsnl", "bharat sanchar nigam limited"],
};

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function pickOperator(select: HTMLSelectElement | undefined, name?: string, code?: string) {
  if (!select) return false;
  const wanted = [name, code].filter(Boolean).map((v) => normalize(String(v)));
  if (!wanted.length) return false;

  const options = Array.from(select.options);
  const match = options.find((option) => {
    const value = normalize(option.value);
    const text = normalize(option.textContent || "");
    if (!value && !text) return false;

    for (const candidate of wanted) {
      if (value === candidate || text === candidate || value.includes(candidate) || text.includes(candidate)) return true;
      for (const [aliasKey, aliases] of Object.entries(operatorAliases)) {
        const candidateIsAlias = candidate === normalize(aliasKey) || aliases.some((alias) => candidate === normalize(alias));
        if (candidateIsAlias && (value === aliasKey || text === normalize(aliasKey) || aliases.some((alias) => value.includes(normalize(alias)) || text.includes(normalize(alias))))) {
          return true;
        }
      }
    }
    return false;
  });

  if (!match || !match.value) return false;
  if (select.value !== match.value) setNativeSelectValue(select, match.value);
  return true;
}

function pickCircle(select: HTMLSelectElement | undefined, name?: string) {
  if (!select || !name) return false;
  const wanted = normalize(name);
  const options = Array.from(select.options);
  const match = options.find((option) => {
    const text = normalize(option.textContent || "");
    const value = normalize(option.value);
    return text === wanted || value === wanted || text.includes(wanted) || wanted.includes(text);
  });

  if (!match || !match.value) return false;
  if (select.value !== match.value) setNativeSelectValue(select, match.value);
  return true;
}

function findControls() {
  const mobile = document.querySelector<HTMLInputElement>('input[placeholder="Enter 10-digit mobile number"]');
  if (!mobile) return null;

  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select"));
  const operator = selects.find((select) =>
    Array.from(select.options).some((option) => option.textContent?.includes("Choose Operator")),
  );
  const circle = selects.find((select) =>
    Array.from(select.options).some((option) => option.textContent?.trim() === "West Bengal"),
  );

  return { mobile, operator, circle };
}

export default function RechargeWorkspaceLive(props: Props) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let lastLookup = "";

    const runLookup = () => {
      const controls = findControls();
      if (!controls) return;
      const mobile = controls.mobile.value.replace(/\\D/g, "");
      if (mobile.length !== 10 || mobile === lastLookup) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        controller?.abort();
        controller = new AbortController();

        try {
          const response = await fetch(`/api/recharge/operator-circle?mobile=${encodeURIComponent(mobile)}`, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          });
          const result = (await response.json()) as LookupResponse;
          if (!result.ok) {
            if (response.status === 503) {
              console.info("[Recharge] Live operator lookup is not configured yet.");
            } else {
              console.warn("[Recharge] Live operator lookup failed:", result.error);
            }
            return;
          }

          lastLookup = mobile;
          const freshControls = findControls();
          if (!freshControls) return;
          pickOperator(freshControls.operator, result.operatorName, result.operatorCode);
          pickCircle(freshControls.circle, result.circleName || undefined);

          // React re-renders controlled selects after the native change event; bind again after that render.
          window.setTimeout(() => {
            const latest = findControls();
            if (!latest) return;
            pickOperator(latest.operator, result.operatorName, result.operatorCode);
            pickCircle(latest.circle, result.circleName || undefined);
          }, 75);
        } catch (error) {
          if ((error as Error)?.name !== "AbortError") {
            console.warn("[Recharge] Live operator lookup request failed.", error);
          }
        }
      }, 450);
    };

    const observer = new MutationObserver(runLookup);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", runLookup, true);
    document.addEventListener("change", runLookup, true);
    runLookup();

    return () => {
      if (timer) clearTimeout(timer);
      controller?.abort();
      observer.disconnect();
      document.removeEventListener("input", runLookup, true);
      document.removeEventListener("change", runLookup, true);
    };
  }, []);

  return <RechargeWorkspace {...props} />;
}
