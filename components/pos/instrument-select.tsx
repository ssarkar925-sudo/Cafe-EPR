"use client";

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

// Which account types a payment method can be fulfilled with. e.g. "Card" maps
// to debit + credit accounts. Used to show only applicable accounts per method.
export const METHOD_ACCOUNT_TYPES: Record<string, string[]> = {
  cash: ["cash"],
  upi: ["upi"],
  card: ["debit_card", "credit_card"],
  bank: ["bank"],
  wallet: ["wallet"],
  debit_card: ["debit_card"],
  credit_card: ["credit_card"],
};

type PosInstrument = { id: string; name: string; type: string };

export function instrumentLabel(method: string) {
  return INSTRUMENT_TYPES.find((t) => t.value === method)?.label ?? method;
}

// Build grouped options. Every enabled standard method type is offered: named
// accounts when they exist, otherwise a generic fallback entry for that method.
// When `enabled` is provided, only those methods are offered (Settings -> Payment Methods).
export function buildInstrumentOptions(instruments: PosInstrument[], enabled?: string[]) {
  return INSTRUMENT_TYPES.filter((t) => !enabled || enabled.includes(t.value)).map((t) => {
    const named = instruments.filter((i) => i.type === t.value);
    const options = named.map((i) => ({ value: i.id, label: i.name }));
    if (named.length === 0) {
      options.push({ value: "__gen__:" + t.value, label: t.label });
    }
    return { group: t.label, options };
  });
}

export function selectValueOf(pick: InstrumentPick) {
  if (pick.instrument_id) return pick.instrument_id;
  return pick.method ? "__gen__:" + pick.method : "";
}

export function parseInstrumentValue(
  value: string,
  instruments: PosInstrument[]
): InstrumentPick | null {
  if (value === "__add__") return null;
  if (value.startsWith("__gen__:")) {
    return { method: value.slice(8), instrument_id: "" };
  }
  const inst = instruments.find((i) => i.id === value);
  return { method: inst?.type ?? "cash", instrument_id: value };
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
  return (
    <select
      value={selectValueOf(pick)}
      onChange={(e) => onChange(parseInstrumentValue(e.target.value, instruments))}
      className={className}
    >
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
      {includeAdd && (
        <>
          <option value="" disabled>
            ───
          </option>
          <option value="__add__">+ Add card / account…</option>
        </>
      )}
    </select>
  );
}