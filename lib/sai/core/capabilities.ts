import type { SaiCapability } from "./types";

const registry = new Map<string, SaiCapability>();

export function registerSaiCapability(capability: SaiCapability): void {
  if (registry.has(capability.id)) throw new Error(`SAI capability already registered: ${capability.id}`);
  registry.set(capability.id, capability);
}

export function getSaiCapability(id: string): SaiCapability | undefined {
  return registry.get(id);
}

export function listSaiCapabilities(): SaiCapability[] {
  return [...registry.values()];
}

export function requireSaiCapability(id: string): SaiCapability {
  const capability = getSaiCapability(id);
  if (!capability) throw new Error(`Unknown SAI capability: ${id}`);
  return capability;
}