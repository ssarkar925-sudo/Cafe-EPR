/**
 * V1 greenfield application boundary — public surface for future phases.
 *
 * - v1-contracts: strict types derived from the G0–G13 baseline.
 * - v1-rpc: typed mutation/read callers (proxy for mutations, direct for reads).
 * - v1-auth-context: server-only session/profile/role/tenant context.
 * - legacy-boundary: what is NOT V1 (enforced by static contract test).
 */

export * from "./v1-contracts";
export * from "./v1-rpc";
export * from "./legacy-boundary";
export * from "./v1-device";
export * from "./v1-inventory-display";
export { getV1SessionContext, requireActiveV1Session } from "./v1-auth-context";
