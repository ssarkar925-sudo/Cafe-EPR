import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { V1SyncPanel } from "@/components/v1/v1-sync-panel";

/**
 * Offline sync overview (server gate + client panel). Any active profile
 * may inspect sync state; every mutation stays server-authoritative
 * (flush/conflict RPCs enforce device ownership and back-office rules).
 * The outbox itself lives in this browser's IndexedDB — per install,
 * never shared across devices.
 */
export default async function V1OfflineOverview() {
  const session = await getV1SessionContext();
  if (!session || !session.isActive) return <V1Forbidden surface="Offline sync" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Offline sync</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {session.profile.display_name} · <span className="font-mono">{session.role}</span> · operations queued on
          this device sync in order; the server decides every outcome.
        </p>
      </div>
      <V1SyncPanel />
    </div>
  );
}
