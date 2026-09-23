import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1Admin } from "@/lib/v1/v1-auth-context";
import { listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import V1AdminTable from "@/components/v1/v1-admin-table";
import { DeviceRevokeButton } from "./forms";

interface DeviceRow {
  id: string;
  owner_profile_id: string;
  device_epoch: number;
  last_watermark: number;
  status: string;
  revoked_at: string | null;
  registered_at: string;
}

interface OwnerRow {
  id: string;
  display_name: string;
}

/**
 * Device & enrollment admin (server + revoke island). Lists device status,
 * epoch, watermark, and owner; revocation supported via revoke_device.
 * Enrollment tokens are single-use and self-service (see V1 home); no full
 * sync workflow lives here.
 */
export default async function V1AdminDevices() {
  const session = await getV1SessionContext();
  if (!requireV1Admin(session)) return <V1Forbidden surface="Devices & enrollment" />;

  const supabase = await createClient();
  const [devices, owners] = await Promise.all([
    listTenantRows<DeviceRow>(
      supabase,
      "devices",
      "id, owner_profile_id, device_epoch, last_watermark, status, revoked_at, registered_at",
      session.tenantId,
      { column: "registered_at", ascending: false },
      200,
    ),
    listTenantRows<OwnerRow>(
      supabase,
      "profiles",
      "id, display_name",
      session.tenantId,
      { column: "display_name" },
      500,
    ),
  ]);

  const error = devices.error ?? owners.error;
  const ownerName = new Map(owners.rows.map((o) => [o.id, o.display_name]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">Devices & enrollment</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enrollment state per install. Revocation ends the epoch; the device re-enrolls at epoch+1
          with a fresh token.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : (
        <V1AdminTable
          columns={[
            { key: "owner", label: "Owner" },
            { key: "status", label: "Status" },
            { key: "device_epoch", label: "Epoch" },
            { key: "last_watermark", label: "Watermark" },
            { key: "registered_at", label: "Registered", mono: true },
            { key: "revoked_at", label: "Revoked", mono: true },
          ]}
          rows={devices.rows.map((d) => ({
            ...d,
            owner: ownerName.get(d.owner_profile_id) ?? d.owner_profile_id,
          }))}
          rowKey={(r) => String(r.id)}
          emptyText="No devices enrolled."
          actions={(row) => (
            <DeviceRevokeButton deviceId={String(row.id)} revoked={String(row.status) === "revoked"} />
          )}
        />
      )}
    </div>
  );
}
