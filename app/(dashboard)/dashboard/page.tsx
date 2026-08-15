import { createClient } from "@/lib/supabase/server";
import DashboardLive from "@/components/dashboard-live";

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ count: customers }, { count: products }, { count: services }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("services").select("id", { count: "exact", head: true }),
    ]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: todaysSales } = await supabase
    .from("invoices")
    .select("total")
    .eq("invoice_date", today)
    .in("status", ["paid", "partial"]);

  const salesToday = (todaysSales ?? []).reduce(
    (sum, inv) => sum + Number(inv.total),
    0
  );

  const { data: stockRows } = await supabase
    .from("products")
    .select("id, name, stock_qty, reorder_level")
    .eq("is_active", true);

  const lowStock = (stockRows ?? []).filter(
    (p) => Number(p.stock_qty) <= Number(p.reorder_level)
  );

  type RecentRow = {
    id: string;
    invoice_number: string;
    invoice_date: string;
    total: string;
    status: string;
    customers: { name: string | null } | null;
  };

  const recent = (
    await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, total, status, customers(name)")
      .order("created_at", { ascending: false })
      .limit(5)
  ).data as RecentRow[] | null;

  return (
    <DashboardLive>
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total Customers" value={String(customers ?? 0)} />
        <Card label="Products" value={String(products ?? 0)} />
        <Card label="Services" value={String(services ?? 0)} />
        <Card label="Sales Today" value={inr(salesToday)} sub={today} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <h2 className="font-medium text-slate-900">Recent Invoices</h2>
          {recent && recent.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Customer</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        {inv.customers?.name ?? "-"}
                      </td>
                      <td className="py-2 pr-4 text-slate-500">
                        {inv.invoice_date}
                      </td>
                      <td className="py-2 pr-4 text-slate-900">
                        {inr(Number(inv.total))}
                      </td>
                      <td className="py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No invoices yet.</p>
          )}
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="font-medium text-slate-900">Low Stock</h2>
          {lowStock.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="truncate text-sm text-slate-700">
                    {p.name}
                  </span>
                  <span className="text-sm text-red-600">
                    {p.stock_qty} left
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">All stock levels are fine.</p>
          )}
        </section>
      </div>
      </div>
    </DashboardLive>
  );
}
