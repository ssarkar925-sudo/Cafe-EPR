import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["upi_qr", "UPI / QR"],
  ["wallet", "Wallet"],
  ["credit_card", "Credit Card"],
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
  const detailsText = String(formData.get("details") ?? "").trim();

  if (!name || !ACCOUNT_TYPES.some(([value]) => value === type) || !Number.isFinite(openingBalance) || openingBalance < 0) {
    redirect("/finance/accounts?error=invalid");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let details: Record<string, string> = {};
  if (detailsText) details = { notes: detailsText };

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
  const { data: accounts, error } = await supabase
    .from("payment_instruments")
    .select("id, name, type, is_active, opening_balance, details, created_at")
    .order("is_active", { ascending: false })
    .order("type")
    .order("name");

  const params = searchParams ? await searchParams : {};
  const status = typeof params.saved === "string" ? "Account created successfully." :
    typeof params.deactivated === "string" ? "Account deactivated." :
    typeof params.error === "string" ? `Action failed: ${params.error}` : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Finance / Payment Accounts</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Payment Accounts</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage the cash, bank, UPI, wallet and service-float instruments used by every financial workflow.</p>
          </div>
          <a href="/finance" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">← Finance Hub</a>
        </div>
      </header>

      {status && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${status.startsWith("Action failed") ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {status}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Add payment account</h2>
        <form action={createAccount} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Account name
            <input name="name" required placeholder="e.g. SBI Current Account" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Type
            <select name="type" defaultValue="cash" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950">
              {ACCOUNT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Opening balance
            <input name="opening_balance" type="number" min="0" step="0.01" defaultValue="0" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950" />
          </label>
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Notes
            <input name="details" placeholder="Optional account details" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-950" />
          </label>
          <div className="md:col-span-2 lg:col-span-4 flex justify-end">
            <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700">+ Add Account</button>
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Configured accounts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-white/[0.03]">
              <tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Type</th><th className="px-6 py-3">Opening</th><th className="px-6 py-3">Status</th><th className="px-6 py-3">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {(accounts ?? []).map((account: any) => (
                <tr key={account.id}>
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{account.name}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{ACCOUNT_TYPES.find(([value]) => value === account.type)?.[1] ?? account.type}</td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-200">₹{Number(account.opening_balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${account.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{account.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="px-6 py-4">
                    {account.is_active && role === "admin" ? (
                      <form action={deactivateAccount}><input type="hidden" name="id" value={account.id} /><button className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">Deactivate</button></form>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
              {!accounts?.length && <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No payment accounts configured.</td></tr>}
            </tbody>
          </table>
        </div>
        {error && <p className="px-6 py-4 text-xs text-rose-600">Unable to load accounts: {error.message}</p>}
      </section>
    </div>
  );
}
