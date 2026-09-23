import Link from "next/link";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";

const SECTIONS = [
  { href: "/v1/masters/customers", title: "Customers", desc: "Khata customers, credit limits, active state." },
  { href: "/v1/masters/suppliers", title: "Suppliers", desc: "Purchase counterparties and active state." },
  { href: "/v1/masters/products", title: "Products", desc: "Catalog, barcodes, prices, dormant HSN links." },
  { href: "/v1/masters/instruments", title: "Instruments", desc: "Cash, bank, UPI QR, wallet, card, portals." },
];

/** Masters hub (server). Back-office (admin/manager); RPCs enforce per-call. */
export default async function V1MastersHub() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Master data" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Master data</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tenant-owned masters via the V1 upsert contracts. Deactivation keeps history; nothing is deleted.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
          >
            <p className="text-sm font-extrabold">{s.title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
