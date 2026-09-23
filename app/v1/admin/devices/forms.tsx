"use client";

/** Device revocation island. Revocation is terminal for the device epoch; re-enrollment mints epoch+1. */
import { useV1Mutation, V1Confirm } from "@/components/v1/v1-mutation";

export function DeviceRevokeButton({
  deviceId,
  revoked,
}: {
  deviceId: string;
  revoked: boolean;
}) {
  const mutation = useV1Mutation();
  if (revoked) return null;
  return (
    <V1Confirm
      label="Revoke"
      title="Revoke device"
      body="The device epoch ends here; its queued work stops being accepted. Re-enrollment starts a new epoch."
      confirmLabel="Revoke device"
      onConfirm={() => mutation.run("revoke_device", { p_device_id: deviceId })}
      disabled={mutation.pending}
    />
  );
}
