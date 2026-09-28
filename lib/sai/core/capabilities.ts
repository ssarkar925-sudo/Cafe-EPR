import type { SaiCapability, SaiRiskLevel } from "./types";

export type SaiCapabilityDomain =
  | "business"
  | "pos"
  | "inventory"
  | "customer"
  | "payments"
  | "aeps"
  | "dmt"
  | "recharge"
  | "system";

export type SaiCapabilityKind = "observe" | "query" | "execute";

export type SaiCapabilityDefinition = SaiCapability & {
  domain?: SaiCapabilityDomain;
  kind?: SaiCapabilityKind;
  mutates?: boolean;
  verificationRequired?: boolean;
  version?: 1;
};

export type SaiCapabilityDescriptor = {
  id: string;
  description: string;
  domain: SaiCapabilityDomain;
  kind: SaiCapabilityKind;
  risk: SaiRiskLevel;
  requiresApproval: boolean;
  mutates: boolean;
  verificationRequired: boolean;
  version: 1;
};

type RegisteredSaiCapability = SaiCapability & {
  domain: SaiCapabilityDomain;
  kind: SaiCapabilityKind;
  mutates: boolean;
  verificationRequired: boolean;
  version: 1;
};

const registry = new Map<string, RegisteredSaiCapability>();

export function registerSaiCapability(capability: SaiCapabilityDefinition): void {
  if (!capability.id?.trim()) throw new Error("SAI capability id is required");
  if (registry.has(capability.id)) throw new Error(`SAI capability already registered: ${capability.id}`);

  const domain = capability.domain ?? inferDomain(capability.id);
  const kind = capability.kind ?? (capability.risk === "read" ? "observe" : "execute");
  const mutates = capability.mutates ?? kind === "execute";
  const verificationRequired = capability.verificationRequired ?? (mutates || capability.risk !== "read");

  if (capability.risk === "read" && mutates) {
    throw new Error(`SAI read capability cannot mutate: ${capability.id}`);
  }
  if ((capability.risk === "high" || capability.risk === "critical") && !capability.requiresApproval) {
    throw new Error(`SAI consequential capability must require approval: ${capability.id}`);
  }
  if (mutates && !verificationRequired) {
    throw new Error(`SAI mutating capability requires verification: ${capability.id}`);
  }

  registry.set(capability.id, {
    ...capability,
    id: capability.id.trim(),
    domain,
    kind,
    mutates,
    verificationRequired,
    version: 1,
  });
}

export function getSaiCapability(id: string): RegisteredSaiCapability | undefined {
  return registry.get(id);
}

export function listSaiCapabilities(): RegisteredSaiCapability[] {
  return [...registry.values()];
}

export function listSaiCapabilityDescriptors(): SaiCapabilityDescriptor[] {
  return listSaiCapabilities().map(({ execute: _execute, ...descriptor }) => descriptor);
}

export function requireSaiCapability(id: string): RegisteredSaiCapability {
  const capability = getSaiCapability(id);
  if (!capability) throw new Error(`Unknown SAI capability: ${id}`);
  return capability;
}

export function validateSaiCapabilityRegistry(): void {
  for (const capability of registry.values()) {
    if (capability.risk === "read" && capability.mutates) {
      throw new Error(`SAI read capability cannot mutate: ${capability.id}`);
    }
    if ((capability.risk === "high" || capability.risk === "critical") && !capability.requiresApproval) {
      throw new Error(`SAI consequential capability must require approval: ${capability.id}`);
    }
    if (capability.mutates && !capability.verificationRequired) {
      throw new Error(`SAI mutating capability requires verification: ${capability.id}`);
    }
  }
}

function inferDomain(id: string): SaiCapabilityDomain {
  const prefix = id.split(".")[0] as SaiCapabilityDomain;
  return ["business", "pos", "inventory", "customer", "payments", "aeps", "dmt", "recharge"].includes(prefix)
    ? prefix
    : "system";
}
