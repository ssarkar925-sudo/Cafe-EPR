import Link from "next/link";

export default function Sidebar({
  name,
  email,
  role,
  shopName,
  logoUrl,
}: {
  name: string;
  email: string;
  role: string;
  shopName: string;
  logoUrl: string | null;
}) {
  const isStaff = role === "staff";
  const isAdmin = role === "admin";

  const linkClass =
    "block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white";

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-900 text-slate-200 lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Shop logo"
            className="h-8 w-8 rounded-lg object-cover"
          />
        )}
        <span className="truncate font-semibold text-white">{shopName}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <Link href="/dashboard" className={linkClass}>
          Dashboard
        </Link>
        <Link href="/pos" className={linkClass}>
          Point of Sale
        </Link>
        <Link href="/invoices" className={linkClass}>
          Invoices
        </Link>
        <Link href="/customers" className={linkClass}>
          Customers
        </Link>

        <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Catalog
        </p>
        <Link href="/catalog/products" className={linkClass}>
          Products
        </Link>
        <Link href="/catalog/services" className={linkClass}>
          Services
        </Link>
        <Link href="/catalog/categories" className={linkClass}>
          Categories
        </Link>

        {!isStaff && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
              Finance
            </p>
            <Link href="/finance/expenses" className={linkClass}>
              Expenses
            </Link>
            <Link href="/finance/cashbook" className={linkClass}>
              Cash Book
            </Link>
            <Link href="/finance/ledger" className={linkClass}>
              Ledger
            </Link>
            <Link href="/reports" className={linkClass}>
              Reports
            </Link>
          </>
        )}

        {isAdmin && (
          <>
            <Link href="/staff" className={linkClass}>
              Staff
            </Link>
            <Link href="/settings" className={linkClass}>
              Settings
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm text-slate-200">{name}</p>
        <p className="truncate text-xs text-slate-400">
          {email} &middot; {role}
        </p>
        <form action="/logout" method="post" className="mt-3">
          <button
            type="submit"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
