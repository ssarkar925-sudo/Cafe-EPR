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
  ["dmt", "DMT Float"],
  ["aeps", "AEPS Float"],
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
  redirect("/finance/accounts?saved=1");
}

async function deactivateAccount(formData: FormData) {
  "use server";
  const role = await getUserRole();
  if (role !== "admin") redirect("/dashboard");

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/finance/accounts?error=missing_id");

  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_payment_instrument", { p_instrument_id: id });
  if (error) redirect(`/finance/accounts?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/finance");
  revalidatePath("/finance/accounts");
  redirect("/finance/accounts?deactivated=1");
}

export default async function FinanceAccountsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: accounts, error },
    { data: cashEntries },
    { data: settlements },
    { data: transactions },
    { data: expenses },
    { data: purchases },
    { data: portals },
  ] = await Promise.all([
    supabase
      .from("payment_instruments")
      .select("id, name, type, is_active, opening_balance, details, created_at")
      .order("is_active", { ascending: false })
      .order("type")
      .order("name"),
    supabase.from("cash_entries").select("id, instrument_id, direction, amount, method, created_at").limit(2000),
    supabase.from("settlements").select("id, source_instrument_id, dest_instrument_id, from_pool, to_pool, amount, status, created_at").limit(1000),
    supabase.from("transactions").select("id, instrument_id, customer_instrument_id, funding_instrument_id, portal_id, service_type, total_amount, amount, pool_credit, pool_out, customer_pay_method, status, created_at").limit(2000),
    supabase.from("expenses").select("id, payment_instrument_id, payment_method, amount, status, created_at").limit(1000),
    supabase.from("purchases").select("id, payment_instrument_id, payment_method, paid_amount, amount, status, created_at").limit(1000),
    supabase.from("aeps_portals").select("id, payment_instrument_id").limit(100),
  ]);

  const reconciledBalances = calculateAccountBalances({
    instruments: (accounts ?? []) as any,
    cashEntries: (cashEntries ?? []) as any,
    settlements: (settlements ?? []) as any,
    transactions: (transactions ?? []) as any,
    expenses: (expenses ?? []) as any,
    purchases: (purchases ?? []) as any,
    portals: (portals ?? []) as any,
  });

  const params = searchParams ? await searchParams : {};
  const status = typeof params.saved === "string" ? "Account created successfully." :
    typeof params.deactivated === "string" ? "Account deactivated." :
    typeof params.error === "string" ? `Action failed: ${params.error}` : null;

  const normalAccounts = reconciledBalances.filter((a) => !a.isCreditCard && !a.isDebitCard);
  const creditCards = reconciledBalances.filter((a) => a.isCreditCard);
  const totalLiquid = normalAccounts.reduce((sum, a) => sum + Math.max(0, a.calculatedBalance), 0);
  const totalLimit = creditCards.reduce((sum, a) => sum + a.creditLimit, 0);
  const totalUsed = creditCards.reduce((sum, a) => sum + a.usedLimit, 0);
  const totalAvailable = creditCards.reduce((sum, a) => sum + a.availableCredit, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Finance / Payment Accounts</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Payment Accounts &amp; Treasury</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Canonical live account positions. Credit limits are fixed; utilization changes with charges and repayments.</p>
          </div>
          <a href="/finance" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200">← Finance Hub</a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Liquid Position</div>
            <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">₹{totalLiquid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="text-[11px] font-semibold text-slate-500">Cash / Bank / UPI / Float</div>
          </div>
          <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4 dark:border-purple-900/30 dark:bg-purple-950/20">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">Total Credit Limit</div>
            <div className="mt-1 text-xl font-black text-purple-900 dark:text-purple-100">₹{totalLimit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">Fixed configured facility limit</div>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Used Credit</div>
            <div className="mt-1 text-xl font-black text-rose-900 dark:text-rose-100">₹{totalUsed.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Outstanding utilization</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Available Credit</div>
            <div className="mt-1 text-xl font-black text-emerald-900 dark:text-emerald-100">₹{totalAvailable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Limit − Used</div>
          </div>
        </div>
      </header>

      {status && <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${status.startsWith("Action failed") ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{status}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Add payment account</h2>
        <form action={createAccount} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Account name<input name="name" required placeholder="e.g. ICICI Bank / HDFC Card" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Type<select name="type" defaultValue="bank" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950">{ACCOUNT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Opening balance<input name="opening_balance" type="number" min="0" step="0.01" defaultValue="0" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Credit limit<input name="credit_limit" type="number" min="0" step="0.01" placeholder="For Credit Card" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 md:col-span-2 lg:col-span-4">Notes / details<input name="details" placeholder="Account number, IFSC, UPI ID, or notes" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-white/10 dark:bg-slate-950" /></label>
          <div className="md:col-span-2 lg:col-span-4 flex justify-end"><button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700">+ Add Account</button></div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Configured Accounts &amp; Treasury Balances</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Normal accounts: Opening + Inflows − Outflows. Credit cards: Credit Limit − Used Credit = Available.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]"><tr><th className="px-6 py-3">Account</th><th className="px-6 py-3">Type</th><th className="px-6 py-3 text-right">Opening / Limit</th><th className="px-6 py-3 text-right">Inflow</th><th className="px-6 py-3 text-right">Outflow</th><th className="px-6 py-3 text-right">Current / Available</th><th className="px-6 py-3 text-center">Status</th><th className="px-6 py-3 text-center">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {reconciledBalances.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
                  <td className="px-6 py-4"><div className="font-bold text-slate-900 dark:text-white">{acc.name}</div>{acc.isCreditCard && <div className="text-[11px] text-slate-500">Used: ₹{acc.usedLimit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>}{acc.isDebitCard && <div className="text-[11px] text-indigo-500">{acc.parentBankName}</div>}</td>
                  <td className="px-6 py-4"><span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-white/10 dark:text-slate-300">{ACCOUNT_TYPES.find(([value]) => value === acc.type)?.[1] ?? acc.type}</span></td>
                  <td className="px-6 py-4 text-right font-mono">{acc.isCreditCard ? `₹${acc.creditLimit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `₹${acc.openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}</td>
                  <td className="px-6 py-4 text-right font-mono text-emerald-600">{acc.totalInflows > 0 ? `+₹${acc.totalInflows.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}</td>
                  <td className="px-6 py-4 text-right font-mono text-rose-600">{acc.totalOutflows > 0 ? `-₹${acc.totalOutflows.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}</td>
                  <td className="px-6 py-4 text-right font-mono font-black">{acc.isCreditCard ? <><div className="text-emerald-600">₹{acc.availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div><div className="text-[11px] font-semibold text-rose-600">Used ₹{acc.usedLimit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div></> : `₹${acc.calculatedBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}</td>
                  <td className="px-6 py-4 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${acc.isCreditCard ? "bg-purple-50 text-purple-700" : acc.statusVariant === "linked" ? "bg-indigo-50 text-indigo-700" : acc.isReconciled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{acc.isCreditCard ? `Available ₹${acc.availableCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : acc.statusLabel}</span></td>
                  <td className="px-6 py-4 text-center">{acc.isActive && role === "admin" ? <form action={deactivateAccount}><input type="hidden" name="id" value={acc.id} /><button className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50">Deactivate</button></form> : <span className="text-xs text-slate-400">—</span>}</td>
                </tr>
              ))}
              {!reconciledBalances.length && <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-500">No payment accounts configured.</td></tr>}
            </tbody>
          </table>
        </div>
        {error && <p className="px-6 py-4 text-xs text-rose-600">Unable to load accounts: {error.message}</p>}
      </section>
    </div>
  );
}
