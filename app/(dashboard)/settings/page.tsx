import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole, hasRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

type Card = { title: string; description: string; href: string; group: string };

const CARDS: Card[] = [
  { group: "POS", title: "Quick Sale Favorites", description: "Configure the fast-access services used directly at the billing counter.", href: "/pos" },
  { group: "POS", title: "Payment Methods", description: "Manage counter tender options and checkout behavior from the POS workflow.", href: "/pos" },
  { group: "Finance", title: "Payment Accounts", description: "Cash, bank, UPI, wallet and card instruments belong to Finance.", href: "/finance/accounts" },
  { group: "Finance", title: "Opening Balances", description: "Opening liquid balances and float seeds are controlled in Finance.", href: "/finance/opening-balances" },
  { group: "Finance", title: "Settlements & Float", description: "Move money between bank, wallet and service floats from Finance.", href: "/finance/settlements" },
  { group: "Finance", title: "Reconciliation", description: "Verify instrument balances and financial invariants in Finance.", href: "/finance/reconciliation" },
  { group: "Bill Payment", title: "Recharge Providers & Slabs", description: "Operator providers and retailer commission slabs belong to Bill Payment.", href: "/business/bill-payment" },
  { group: "Bill Payment", title: "BBPS Commissions", description: "Utility commission and surcharge rules belong to Bill Payment.", href: "/business/bill-payment" },
  { group: "Bill Payment", title: "Recharge Plans", description: "Manage live prepaid tariff packs from the recharge module.", href: "/business/bill-payment/mobile-recharge/plans" },
  { group: "Bill Payment", title: "Google Play Margins", description: "Configure voucher margins and customer fees from Bill Payment.", href: "/business/bill-payment/google-play" },
  { group: "AEPS / Digital", title: "AEPS Banks", description: "Commercial bank masters used by AEPS are managed in the Business Hub.", href: "/business/banks" },
  { group: "AEPS / Digital", title: "Service Portals", description: "Portal connections and float mappings belong to the Business Hub.", href: "/business/portals" },
  { group: "AEPS / Digital", title: "Merchant QRs", description: "Counter UPI QR profiles belong to the Business Hub.", href: "/business/merchant-qrs" },
  { group: "Inventory", title: "Products & Services", description: "Catalog masters are managed from the Catalog/Inventory workspace.", href: "/catalog" },
  { group: "Inventory", title: "Stock Controls", description: "Inventory behavior and stock operations belong to Inventory.", href: "/inventory" },
  { group: "Business", title: "Store Identity & Tax", description: "Business identity, GST and invoice configuration are surfaced with the operational business workflows.", href: "/invoices" },
];

const SYSTEM = [
  { title: "Security", description: "Credentials, 2FA and terminal security.", href: "/security" },
  { title: "Staff", description: "Users, roles and permissions.", href: "/staff" },
  { title: "Audit", description: "Immutable operational audit history.", href: "/audit" },
  { title: "AI Control Center", description: "Diagnostics and automated financial checks.", href: "/ai" },
];

export default async function SettingsPage() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin"])) redirect("/dashboard");

  const groups = Array.from(new Set(CARDS.map((c) => c.group)));

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">System Control</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">Settings are now owned by their Hubs</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Operational configuration is no longer a second navigation system. Open a module below and continue working in its owning Hub. System-only controls remain here.</p>
      </header>

      {groups.map((group) => (
        <section key={group}>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{group}</h2>
              <p className="text-xs text-slate-500">Configuration is kept beside the workflow it controls.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.filter((c) => c.group === group).map((card) => (
              <Link key={card.title} href={card.href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/40">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-extrabold text-slate-900 dark:text-white">{card.title}</h3>
                  <span className="text-blue-600 transition group-hover:translate-x-1">→</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{card.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-3 text-lg font-black text-slate-900 dark:text-white">System-only controls</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SYSTEM.map((item) => (
            <Link key={item.title} href={item.href} className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900">
              <h3 className="font-extrabold text-slate-900 dark:text-white">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
