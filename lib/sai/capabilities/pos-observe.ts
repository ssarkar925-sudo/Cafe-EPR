import { registerSaiCapability } from "@/lib/sai/core/capabilities";
import type { SaiCapabilityResult, SaiEvent } from "@/lib/sai/core/types";
import { dispatchSaiEvent } from "@/lib/sai/cognition/dispatcher";

const REQUIRED_SALE_FIELDS = ["saleId", "invoiceNumber", "totalAmount", "paymentStatus"] as const;

export async function handlePosSaleCreated(event: SaiEvent): Promise<SaiCapabilityResult> {
  const missing = REQUIRED_SALE_FIELDS.filter((field) => event.payload[field] === undefined || event.payload[field] === null);
  if (missing.length) {
    return {
      ok: false,
      error: "POS_SALE_INCOMPLETE",
      output: { saleId: event.entityId ?? null, missingFields: missing },
    };
  }

  return {
    ok: true,
    output: {
      saleId: event.payload.saleId,
      invoiceNumber: event.payload.invoiceNumber,
      totalAmount: event.payload.totalAmount,
      paymentStatus: event.payload.paymentStatus,
      observed: true,
      verified: false,
      verificationRequired: ["invoice", "payment", "inventory", "customer_ledger"],
    },
    evidenceIds: event.evidenceIds ?? [event.eventId],
  };
}

export function registerPosObserveCapability(): void {
  try {
    registerSaiCapability({
      id: "pos.observe_sale",
      description: "Observe a completed POS sale and identify the authoritative facts required for downstream verification.",
      risk: "read",
      requiresApproval: false,
      execute: async (input): Promise<SaiCapabilityResult> => {
        const event = input.event as SaiEvent | undefined;
        if (!event || event.type !== "sale.created") {
          return { ok: false, error: "INVALID_POS_EVENT" };
        }
        return handlePosSaleCreated(event);
      },
    });
  } catch {
    // Safe for repeated module initialization.
  }
}

registerPosObserveCapability();

export async function observePosSale(event: SaiEvent): Promise<void> {
  if (event.type !== "sale.created") throw new Error("Expected sale.created event");
  await dispatchSaiEvent(event);
}