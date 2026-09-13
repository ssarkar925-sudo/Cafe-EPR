"use client";

// Compatibility bridge: maps legacy pos-client to modern pos-shell
export { default } from "./pos-shell";
export * from "./pos-shell";

// Hardening invariant guard
export function posClientGuard(busy: boolean, e?: KeyboardEvent) {
  if (busy) return;
  if (e && (e.key === "F2" || e.key === "F4")) {
    return true;
  }
}
