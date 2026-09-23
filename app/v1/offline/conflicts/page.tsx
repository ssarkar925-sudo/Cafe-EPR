import Link from "next/link";
import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { V1SyncConflicts } from "@/components/v1/v1-sync-panel";

/**
 * Sync exceptions (server gate + client list). Resolution calls
 * resolve_conflict, which the server restricts to back-office; other
 * roles see the exception and the escalation notice instead.
 */
export default async function V1OfflineConflicts() {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="Sync exceptions" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/v1/offline" className="text-xs font-bold text-slate-500 underline dark:text-slate-400">
          ← Offline sync
        </Link>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight">Sync exceptions</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Failed and conflicted operations stay visible here until resolved or explicitly discarded. Server truth
          wins every dispute.
        </p>
      </div>
      <V1SyncConflicts />
    </div>
  );
}
