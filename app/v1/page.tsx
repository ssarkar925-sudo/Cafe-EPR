import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import { v1NavForRole } from "@/components/v1/v1-nav";
import V1EnrollmentCard from "@/components/v1/v1-enrollment-card";

/**
 * V1 home (Phase 2 live surface): session summary, device enrollment
 * foundation, and the planned navigation map. No business logic; future
 * sections render through V1Placeholder in their own phases.
 */
export default async function V1Home() {
  const session = await getV1SessionContext();
  if (!session) return null;
  const items = v1NavForRole(session.role);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section
        aria-label="Session summary"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h1 className="text-lg font-extrabold tracking-tight">
          {session.profile.display_name}
        </h1>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Role</dt>
            <dd className="font-mono font-bold">{session.role}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Tenant</dt>
            <dd className="font-mono text-xs">{session.tenantId}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Profile</dt>
            <dd className="font-mono text-xs">{session.profile.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Back-office</dt>
            <dd className="font-mono font-bold">{session.isBackOffice ? "yes" : "no"}</dd>
          </div>
        </dl>
      </section>

      <V1EnrollmentCard />

      <section
        aria-label="Planned sections"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Planned sections</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-white/5"
            >
              <span className={item.href ? "font-semibold" : "text-slate-400 dark:text-slate-500"}>
                {item.label}
              </span>
              {item.phase !== null && (
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10">
                  P{item.phase}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
