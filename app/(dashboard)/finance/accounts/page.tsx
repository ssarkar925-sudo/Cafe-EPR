import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { calculateAccountBalances } from "@/lib/finance/account-balances";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["upi_qr", "UPI / QR"],
  ["wallet", "Wallet"],
  ["credit_card", "Credit Card"],
  ["debit_card", "Debit Card"],
  ["dmt_portal", "DMT Float"],
  ["aeps_portal", "AEPS Float"],
] as const;

async function createAccount(formData: FormData) {
  "use server";
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const openingBalance = Number(formData.get("opening_balance") ?? 0);
  const creditLimit = Number(formData.get("credit_limit") ?? 0);
  const detailsText = String(formData.get("details") ?? "").trim();

  if (!name || !ACCOUNT_TYPES.some(([value]) => value === type) || !Number.isFinite(openingBalance) || openingBalance < 0 || !Number.isFinite(creditLimit) || creditLimit < 0) {
    redirect("/finance/accounts?error=invalid");
  }

  const supabase = await createClient();
  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) user = data.user;
  } catch {
    user = null;
  }
  if (!user) redirect("/login");

  const details: Record<string, unknown> = {};
  if (detailsText) details.notes = detailsText;
  if (type === "credit_card") details.credit_limit = creditLimit;

  const { error } = await supabase.from("payment_instruments").insert({
    name,
    type,
    opening_balance: openingBalance,
    details,
    created_by: user.id,
    is_active: true,
  });

  if (error) redirect(`/finance/accounts?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/finance");
  revalidatePath("/finance/accounts");
  redirect("/finance/accounts?created=1");
}

export default async function AccountsPage() {
  const supabase = await createClient();
  const [{ data: instruments }, { data: cashEntries }, { data: settlements }, { data: transactions }, { data: expenses }, { data: purchases }, { data: portals }] = await Promise.all([
    supabase.from("payment_instruments").select("*").order("created_at", { ascending: true }),
    supabase.from("cash_entries").select("id,ref_id,instrument_id,direction,amount,method,created_at"),
    supabase.from("settlements").select("*"),
    supabase.from("transactions").select("*"),
    supabase.from("expenses").select("*"),
    supabase.from("purchases").select("*"),
    supabase.from("aeps_portals").select("id,payment_instrument_id"),
  ]);

  const accounts = calculateAccountBalances({
    instruments: instruments ?? [],
    cashEntries: cashEntries ?? [],
    settlements: settlements ?? [],
    transactions: transactions ?? [],
    expenses: expenses ?? [],
    purchases: purchases ?? [],
    portals: portals ?? [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Payment Accounts</h1>
        <p className="text-sm text-slate-500">Canonical balances from payment instruments and their money movements.</p>
      </div>

      <form action={createAccount} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Account name" className="rounded-xl border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800" />
          <select name="type" required className="rounded-xl border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800">
            {ACCOUNT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input name="opening_balance" type="number" min="0" step="0.01" placeholder="Opening balance" className="rounded-xl border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800" />
          <input name="credit_limit" type="number" min="0" step="0.01" placeholder="Credit limit (CC)" className="rounded-xl border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800" />
        </div>
        <div className="mt-3 flex gap-3">
          <input name="details" placeholder="Notes (optional)" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800" />
          <button type="submit" className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white">Create Account</button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black">{account.name}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{account.type}</div>
              </div>
              <span className="text-xs font-bold text-slate-500">{account.statusLabel}</span>
            </div>
            <div className="mt-5 text-2xl font-black">₹{account.displayedBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div><div className="text-slate-500">Opening</div><div className="font-bold">₹{account.openingBalance.toFixed(2)}</div></div>
              <div><div className="text-slate-500">In</div><div className="font-bold">₹{account.totalInflows.toFixed(2)}</div></div>
              <div><div className="text-slate-500">Out</div><div className="font-bold">₹{account.totalOutflows.toFixed(2)}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
