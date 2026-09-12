"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, MoreHorizontal, Pause, ReceiptText, RotateCcw, Trash2, X } from "lucide-react";

export type PosHeldLine = {
  key: string;
  id: string;
  kind: "product" | "service";
  name: string;
  code?: string | null;
  rate: number;
  qty: number;
  costPrice: number;
  categoryName: string;
  gstRate: number;
  hsnSac: string | null;
  stockQty: number | null;
  unit: string;
};

type HeldDraft = {
  id: string;
  heldAt: string;
  itemCount: number;
  totalQty: number;
  total: number;
  customerId: string;
  customerName: string;
  discount: string;
  paymentChoice: string;
  cashReceived: string;
  splitRows: { id: string; instrumentId: string; amount: string }[];
  cart: PosHeldLine[];
};

type TodaySale = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total: number;
  paid: number;
  due: number;
  status?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
};

const STORAGE_KEY = "cafeerp-pos-held-bills-v1";

function readHeldBills(): HeldDraft[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function money(value: number) {
  return `₹${(Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2)}`;
}

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function customerName(value: any) {
  if (!value) return "Walk-in Customer";
  if (Array.isArray(value)) return value[0]?.name || "Walk-in Customer";
  return value.name || "Walk-in Customer";
}

export default function PosOperations({
  cart,
  total,
  discount,
  customerId,
  customerName: selectedCustomerName,
  paymentChoice,
  cashReceived,
  splitRows,
  supabase,
  onRestore,
  onReset,
}: {
  cart: PosHeldLine[];
  total: number;
  discount: string;
  customerId: string;
  customerName: string;
  paymentChoice: string;
  cashReceived: string;
  splitRows: { id: string; instrumentId: string; amount: string }[];
  supabase: any;
  onRestore: (draft: HeldDraft) => void;
  onReset: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"recall" | "today" | null>(null);
  const [heldBills, setHeldBills] = useState<HeldDraft[]>([]);
  const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (panel === "recall") setHeldBills(readHeldBills());
  }, [panel]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [message]);

  const hasCart = cart.length > 0;

  const itemSummary = useMemo(() => {
    const qty = cart.reduce((sum, line) => sum + line.qty, 0);
    return `${qty} item${qty === 1 ? "" : "s"}`;
  }, [cart]);

  function holdBill() {
    if (!hasCart) {
      setMessage("Add at least one item before holding the bill.");
      setMenuOpen(false);
      return;
    }

    const draft: HeldDraft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      heldAt: new Date().toISOString(),
      itemCount: cart.length,
      totalQty: cart.reduce((sum, line) => sum + line.qty, 0),
      total,
      customerId,
      customerName: selectedCustomerName || "Walk-in Customer",
      discount,
      paymentChoice,
      cashReceived,
      splitRows,
      cart,
    };

    const next = [draft, ...readHeldBills()].slice(0, 30);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setHeldBills(next);
    setMenuOpen(false);
    setPanel(null);
    onReset();
    setMessage("Bill held successfully.");
  }

  function recallBill(draft: HeldDraft) {
    const next = readHeldBills().filter((entry) => entry.id !== draft.id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setHeldBills(next);
    setPanel(null);
    setMenuOpen(false);
    onRestore(draft);
    setMessage("Held bill restored.");
  }

  function deleteHeldBill(id: string) {
    const next = readHeldBills().filter((entry) => entry.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setHeldBills(next);
  }

  async function openTodaySales() {
    setMenuOpen(false);
    setPanel("today");
    setLoadingSales(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, paid, due, status, customers(name, phone)")
      .eq("invoice_date", indiaToday())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setTodaySales([]);
      setMessage(error.message || "Unable to load today's sales.");
    } else {
      setTodaySales(
        ((data ?? []) as any[]).map((row) => ({
          id: String(row.id),
          invoice_number: String(row.invoice_number ?? ""),
          invoice_date: String(row.invoice_date ?? ""),
          total: Number(row.total ?? 0),
          paid: Number(row.paid ?? 0),
          due: Number(row.due ?? 0),
          status: row.status ?? null,
          customer: Array.isArray(row.customers)
            ? row.customers[0] ?? null
            : row.customers ?? null,
        }))
      );
    }
    setLoadingSales(false);
  }

  function closeAll() {
    setMenuOpen(false);
    setPanel(null);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="POS operations"
        aria-expanded={menuOpen}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${menuOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"} dark:border-white/10 dark:bg-slate-800 dark:text-slate-300`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[140] w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-900/10 dark:border-white/10 dark:bg-slate-900">
          <button
            type="button"
            onClick={holdBill}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[10px] font-black text-slate-700 hover:bg-amber-50 hover:text-amber-800 dark:text-slate-200 dark:hover:bg-amber-500/10 dark:hover:text-amber-200"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="flex-1">Hold Bill</span>
            <kbd className="text-[8px] text-slate-400">F6</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setPanel("recall");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[10px] font-black text-slate-700 hover:bg-blue-50 hover:text-blue-800 dark:text-slate-200 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="flex-1">Recall Held Bills</span>
            {heldBills.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] dark:bg-slate-800">{heldBills.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => void openTodaySales()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[10px] font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-slate-200 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
          >
            <ReceiptText className="h-3.5 w-3.5" />
            <span className="flex-1">Today's Sales</span>
          </button>
        </div>
      )}

      {message && (
        <div className="absolute right-0 top-[calc(100%+58px)] z-[145] min-w-52 rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-[9px] font-bold text-white shadow-xl dark:border-white/10">
          {message}
        </div>
      )}

      {panel === "recall" && (
        <div className="fixed inset-0 z-[160] bg-slate-950/35" onMouseDown={closeAll}>
          <aside className="absolute right-0 top-0 flex h-full w-[min(420px,100vw)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-white/10">
              <div>
                <div className="text-sm font-black">Recall Held Bills</div>
                <div className="text-[9px] font-semibold text-slate-400">Saved on this billing terminal</div>
              </div>
              <button type="button" onClick={closeAll} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {!heldBills.length ? (
                <div className="flex h-full min-h-52 items-center justify-center text-center">
                  <div>
                    <Pause className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-xs font-black text-slate-500">No held bills</p>
                    <p className="mt-1 text-[9px] text-slate-400">Hold a bill from the POS menu to see it here.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {heldBills.map((draft, index) => (
                    <div key={draft.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black">Hold #{heldBills.length - index}</div>
                          <div className="mt-0.5 text-[9px] font-semibold text-slate-500">{draft.customerName} · {draft.itemCount} lines · {draft.totalQty} qty</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-blue-600">{money(draft.total)}</div>
                          <div className="mt-0.5 flex items-center justify-end gap-1 text-[8px] font-semibold text-slate-400"><Clock3 className="h-3 w-3" />{new Date(draft.heldAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_34px] gap-2">
                        <button type="button" onClick={() => recallBill(draft)} className="h-8 rounded-lg bg-blue-600 text-[9px] font-black uppercase tracking-wide text-white hover:bg-blue-700">Recall Bill</button>
                        <button type="button" onClick={() => deleteHeldBill(draft.id)} className="flex h-8 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900" aria-label="Delete held bill"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {panel === "today" && (
        <div className="fixed inset-0 z-[160] bg-slate-950/35" onMouseDown={closeAll}>
          <aside className="absolute right-0 top-0 flex h-full w-[min(500px,100vw)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-white/10">
              <div>
                <div className="text-sm font-black">Today's Sales</div>
                <div className="text-[9px] font-semibold text-slate-400">Latest 50 invoices for today</div>
              </div>
              <button type="button" onClick={closeAll} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingSales ? (
                <div className="flex h-40 items-center justify-center text-[10px] font-bold text-slate-400">Loading today's sales…</div>
              ) : !todaySales.length ? (
                <div className="flex h-48 items-center justify-center text-center">
                  <div>
                    <ReceiptText className="mx-auto h-6 w-6 text-slate-300" />
                    <p className="mt-2 text-xs font-black text-slate-500">No sales recorded today</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {todaySales.map((sale) => (
                    <div key={sale.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.025]">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"><ReceiptText className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-black">{sale.invoice_number || "Invoice"}</div>
                        <div className="truncate text-[8px] font-semibold text-slate-400">{customerName(sale.customer)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-blue-600">{money(sale.total)}</div>
                        <div className={`text-[8px] font-bold ${sale.due > 0 ? "text-rose-600" : "text-emerald-600"}`}>{sale.due > 0 ? `Due ${money(sale.due)}` : "Paid"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
