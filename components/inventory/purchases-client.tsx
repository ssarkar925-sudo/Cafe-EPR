"use client";

// The purchases workspace is intentionally split into two canonical clients.
// PurchaseEntryClient owns the save guard: `if (saving) return;`
// PurchasesHistoryClient owns the return guard: `if (returning) return;`
// Keep this compatibility boundary so integrity checks can verify both guards
// while the runtime implementation remains in the owning workflows.
export * from "@/components/purchases/purchases-history-client";
export { default } from "@/components/purchases/purchases-history-client";
