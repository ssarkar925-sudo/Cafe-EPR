"use client";

/**
 * Service reversal action — V1 Services milestone (client island).
 *
 * Calls reverse_service_txn through the V1 mutation wrapper with a
 * caller-supplied idempotency key. The contract takes no reason
 * parameter, so none is invented or sent. Rendered only on back-office
 * surfaces for rows still in 'recorded' state; the RPC re-enforces both.
 */

import { useState } from "react";
import { useV1Mutation, V1Confirm } from "@/components/v1/v1-mutation";

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function ReverseServiceAction({ serviceId, transactionNumber }: { serviceId: string; transactionNumber: string }) {
  const mutation = useV1Mutation();
  const [reversed, setReversed] = useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    const data = await mutation.run("reverse_service_txn", {
      p_service_id: serviceId,
      p_idempotency_key: newKey(),
    });
    if (data && typeof data === "object" && "id" in data) {
      setReversed(String((data as { id: string }).id));
    }
  }

  if (reversed) {
    return (
      <p role="status" className="text-xs font-bold text-teal-700 dark:text-teal-300">
        Reversed. The list refreshes automatically.
      </p>
    );
  }

  return (
    <span>
      <V1Confirm
        label="Reverse"
        title={`Reverse ${transactionNumber}?`}
        body="Creates a linked mirror reversal record. The original stays visible; this cannot be undone from here."
        confirmLabel="Reverse transaction"
        onConfirm={onConfirm}
        disabled={mutation.pending}
      />
      {mutation.error && (
        <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">
          {mutation.error}
        </span>
      )}
    </span>
  );
}
