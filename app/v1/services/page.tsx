import Link from "next/link";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";

const SERVICES = [
  { href: "/v1/services/aeps", title: "AEPS", desc: "Cash-out, balance enquiry, mini statement. Aadhaar last-4 maximum." },
  { href: "/v1/services/dmt", title: "DMT", desc: "Sender/beneficiary refs. No funding-source or settlement logic." },
  { href: "/v1/services/upi", title: "UPI", desc: "UPI id + merchant QR refs. No bank integration." },
  { href: "/v1/services/recharge", title: "Recharge", desc: "Provider + receiver refs. No telecom API." },
  { href: "/v1/services/bbps", title: "BBPS", desc: "Biller + consumer + bill amount. Frozen field set." },
];

/** Services hub (server). Back-office (admin/manager) per the V1 role
 *  matrix; the record RPC itself additionally requires an active profile
 *  and reversal RPCs require back-office server-side. */
export default async function V1ServicesHub() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Services" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Services</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Record-only service transactions. Recording here creates a local record only — no provider is contacted,
          and nothing is settled automatically.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SERVICES.map((s) => (
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
