import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1Placeholder from "@/components/v1/v1-placeholder";

const POS_DESIGN_DOCS = [
  "docs/architecture/v1-pos-workflow-spec.md",
  "docs/architecture/v1-pos-state-component-spec.md",
  "docs/architecture/v1-thermal-receipt-spec.md",
  "docs/architecture/v1-offline-arch-mapping.md",
  "docs/architecture/v1-system-test-plan.md",
  "docs/architecture/v1-owner-decision-register.md",
];

/**
 * POS design preview (server). Phase-5 placeholder only: renders the
 * "implementation pending" notice plus pointers to the design/spec
 * documents. No cart, no checkout, no RPC calls, no business logic.
 * Visible to every V1 role; the session gate mirrors other V1 surfaces.
 */
export default async function V1PosDesignPreview() {
  const session = await getV1SessionContext();
  if (!session) return <V1Forbidden surface="POS design preview" />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <V1Placeholder title="POS counter" phase={6} />
      <section
        aria-label="POS design documents"
        className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]"
      >
        <h2 className="text-sm font-extrabold tracking-tight">Design specifications</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Implementation pending. The counter workflow, receipt format, and offline
          behavior are specified in:
        </p>
        <ul className="mt-3 space-y-1.5">
          {POS_DESIGN_DOCS.map((doc) => (
            <li key={doc} className="font-mono text-xs text-slate-600 dark:text-slate-300">
              {doc}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
