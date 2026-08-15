import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager"])) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: invoices }, { data: items }, { data: payments }, { data: dues }] =
    await Promise.all([
      supabase.from("invoices").select("invoice_date, total, status"),
      supabase.from("invoice_items").select("qty, amount, products(name)"),
      supabase.from("payments").select("method, amount"),
      supabase
        .from("customers")
        .select("id, name, balance")
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(20),
    ]);

  const valid = (invoices ?? []).filter((i) => i.status !== "cancelled");

  const dayTotals = new Map<string, number>();
  for (const inv of valid) {
    const d = String(inv.invoice_date);
    dayTotals.set(d, (dayTotals.get(d) ?? 0) + Number(inv.total));
  }

  const today = new Date();
  const days: { date: string; label: string; total: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      date: key,
      label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      total: dayTotals.get(key) ?? 0,
    });
  }
  const dayMax = Math.max(1, ...days.map((d) => d.total));

  const productMap = new Map<
    string,
    { name: string; qty: number; amount: number }
  >();
  for (const it of items ?? []) {
    const name = (it as any).products?.name;
    if (!name) continue;
    const cur = productMap.get(name) ?? { name, qty: 0, amount: 0 };
    cur.qty += Number(it.qty);
    cur.amount += Number(it.amount);
    productMap.set(name, cur);
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const methodMap = new Map<string, number>();
  for (const p of payments ?? []) {
    methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + Number(p.amount));
  }
  const methodTotals = Array.from(methodMap.entries());

  const monthTotal = days.reduce((s, d) => s + d.total, 0);

  function card(title: React.ReactNode, children: React.ReactNode) {
    return (
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="font-medium text-slate-900">{title}</h2>
        <div className="mt-4">{children}</div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Reports</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {card(
          <>Sales (last 30 days) &middot; {inr(monthTotal)}</>,
          <div className="space-y-1">
            {days.map((d) => (
              <div key={d.date} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-slate-500">{d.label}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div
                    className="h-3 rounded bg-blue-500"
                    style={{
                      width: `${Math.max(2, (d.total / dayMax) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-slate-700">
                  {inr(d.total)}
                </span>
              </div>
            ))}
          </div>
        )}

        {card(
          "Top Products",
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 pr-4 font-medium">Qty</th>
                <th className="py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-900">{p.name}</td>
                  <td className="py-2 pr-4 text-slate-700">{p.qty}</td>
                  <td className="py-2 text-slate-900">{inr(p.amount)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-500">
                    No product sales yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {card(
          "Payments by Method",
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {methodTotals.map(([m, amt]) => (
                <tr key={m} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium uppercase text-slate-900">
                    {m}
                  </td>
                  <td className="py-2 text-slate-900">{inr(amt)}</td>
                </tr>
              ))}
              {methodTotals.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-500">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {card(
          "Customer Dues",
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(dues ?? []).map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-900">{c.name}</td>
                  <td className="py-2 text-red-600">{inr(c.balance)}</td>
                </tr>
              ))}
              {(dues ?? []).length === 0 && (
                <tr>
                  <td colSpan={2} className="py-6 text-center text-slate-500">
                    No outstanding dues.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
