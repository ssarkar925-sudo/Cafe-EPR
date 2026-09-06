"use client";

import { useEffect, useRef } from "react";

export const INSTRUMENT_TYPES: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "upi", label: "UPI" },
  { value: "wallet", label: "Wallet" },
  { value: "debit_card", label: "Debit Card" },
  { value: "credit_card", label: "Credit Card" },
];

export type InstrumentPick = {
  method: string;
  instrument_id: string;
};

export const METHOD_ACCOUNT_TYPES: Record<string, string[]> = {
  cash: ["cash"],
  upi: ["upi", "upi_qr"],
  card: ["debit_card", "credit_card"],
  bank: ["bank"],
  wallet: ["wallet"],
  debit_card: ["debit_card"],
  credit_card: ["credit_card"],
  credit: ["credit_card"],
};

type PosInstrument = { id: string; name: string; type: string };

function normalizeMethod(method: string) {
  return method === "credit" ? "credit_card" : method;
}

export function instrumentLabel(method: string) {
  const normalized = normalizeMethod(method);
  return INSTRUMENT_TYPES.find((t) => t.value === normalized)?.label ?? method;
}

export function buildInstrumentOptions(instruments: PosInstrument[], enabled?: string[]) {
  return INSTRUMENT_TYPES.filter((t) => !enabled || enabled.includes(t.value) || (t.value === "credit_card" && enabled.includes("credit"))).map((t) => {
    const acceptedTypes = t.value === "upi" ? ["upi", "upi_qr"] : [t.value];
    const named = instruments.filter((i) => acceptedTypes.includes(i.type));
    const options = named.map((i) => ({ value: i.id, label: i.name }));
    // Always keep a generic option. A controlled native <select> must always
    // contain the current value or browsers silently snap it to the first option.
    options.unshift({ value: "__gen__:" + t.value, label: `Generic ${t.label}` });
    return { group: t.label, options };
  });
}

export function selectValueOf(pick: InstrumentPick) {
  if (pick.instrument_id) return pick.instrument_id;
  const method = normalizeMethod(pick.method || "");
  return method ? "__gen__:" + method : "";
}

export function parseInstrumentValue(
  value: string,
  instruments: PosInstrument[]
): InstrumentPick | null {
  if (value === "__add__") return null;
  if (value.startsWith("__gen__:")) {
    const method = normalizeMethod(value.slice(8));
    return { method, instrument_id: "" };
  }
  const inst = instruments.find((i) => i.id === value);
  const method = inst?.type === "upi_qr" ? "upi" : inst?.type ?? "cash";
  return { method, instrument_id: value };
}

function useResetPairedAmountWhenCartClears() {
  const selectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const cartPanel = select.closest(".sticky");
    if (!cartPanel) return;

    const resetIfEmpty = () => {
      const header = cartPanel.querySelector("h2");
      if (!header || header.textContent?.trim() !== "Current Invoice") return;
      const itemCount = header.parentElement?.querySelector("p")?.textContent ?? "";
      if (!/^0\s+items\b/.test(itemCount.trim())) return;

      const pairedInput = select.parentElement?.querySelector<HTMLInputElement>("input");
      if (!pairedInput || pairedInput.value === "") return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(pairedInput, "");
      pairedInput.dispatchEvent(new Event("input", { bubbles: true }));
      pairedInput.dispatchEvent(new Event("change", { bubbles: true }));
    };

    resetIfEmpty();
    const observer = new MutationObserver(resetIfEmpty);
    observer.observe(cartPanel, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  return selectRef;
}

export default function InstrumentSelect({
  instruments,
  pick,
  onChange,
  className,
  includeAdd = true,
  enabled,
}: {
  instruments: PosInstrument[];
  pick: InstrumentPick;
  onChange: (pick: InstrumentPick | null) => void;
  className?: string;
  includeAdd?: boolean;
  enabled?: string[];
}) {
  const groups = buildInstrumentOptions(instruments, enabled);
  const selectRef = useResetPairedAmountWhenCartClears();
  const currentVal = selectValueOf(pick);
  const optionValues = groups.flatMap((g) => g.options.map((o) => o.value));

  return (
    <select
      ref={selectRef}
      value={currentVal}
      onChange={(e) => onChange(parseInstrumentValue(e.target.value, instruments))}
      className={className}
    >
      {!optionValues.includes(currentVal) && currentVal && (
        <option value={currentVal} hidden>
          {instrumentLabel(pick.method)}
        </option>
      )}
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
      {includeAdd && <option value="__add__">+ Add card / account…</option>}
    </select>
  );
}
