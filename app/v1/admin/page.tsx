import Link from "next/link";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";

const SECTIONS = [
  { href: "/v1/admin/users", title: "Users & roles", desc: "V1 profiles: display name, role, tenant, active state. Read-only." },
  { href: "/v1/admin/finance", title: "Chart of Accounts & mapping", desc: "CoA heads (rename/activate) and instrument→account mapping." },
  { href: "/v1/admin/tax", title: "Dormant tax masters", desc: "HSN / SAC / rates. Dormant: view only, no computation." },
  { href: "/v1/admin/retention", title: "Retention & legal holds", desc: "Policies, holds, purge dry-run/execute, purge log." },
  { href: "/v1/admin/audit", title: "Audit trail", desc: "Audit logs and archive. Append-only, read-only here." },
  { href: "/v1/admin/approvals", title: "Approvals", desc: "Inspect pending / consumed / rejected approval records." },
  { href: "/v1/admin/devices", title: "Devices & enrollment", desc: "Device status, epoch, watermark, revocation." },
];

/** Admin hub (server). Admin-only; every destination re-checks the role. */
export default async function V1AdminHub() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Admin" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Backend authorization remains authoritative; every action below runs through the V1 RPC contracts.
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
