import Link from "next/link";

export default function Sidebar({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-slate-900 text-slate-200 lg:flex">
      <div className="flex h-16 items-center border-b border-slate-800 px-5">
        <span className="font-semibold text-white">SCC OMM Cafe ERP</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <Link
          href="/dashboard"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Dashboard
        </Link>
        <Link
          href="/pos"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Point of Sale
        </Link>
        <Link
          href="/invoices"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Invoices
        </Link>
        <Link
          href="/customers"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Customers
        </Link>
        <p className="px-3 pb-1 pt-4 text-xs font-medium uppercase tracking-wider text-slate-500">
          Catalog
        </p>
        <Link
          href="/catalog/products"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Products
        </Link>
        <Link
          href="/catalog/services"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Services
        </Link>
        <Link
          href="/catalog/categories"
          className="block rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          Categories
        </Link>
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
