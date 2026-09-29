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
  | "finance"
  | "system";

export type SaiCapabilityKind = "observe" | "query" | "execute";

export type SaiCapabilityDefinition = SaiCapability & {
  domain?: SaiCapabilityDomain;
  kind?: SaiCapabilityKind;
  mutates?: boolean;
  verificationRequired?: boolean;
  allowedRoles?: string[];
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
  allowedRoles: string[];
  version: 1;
};

type RegisteredSaiCapability = SaiCapability & {
  domain: SaiCapabilityDomain;
  kind: SaiCapabilityKind;
  mutates: boolean;
  verificationRequired: boolean;
  allowedRoles: string[];
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
  const allowedRoles = [...new Set((capability.allowedRoles ?? ["admin", "manager", "staff"]).map((role) => role.trim()).filter(Boolean))];
  if (allowedRoles.length === 0) throw new Error(`SAI capability requires at least one allowed role: ${capability.id}`);

  if (capability.risk === "read" && mutates) {
    throw new Error(`SAI read capability cannot mutate: ${capability.id}`);
  }
  if ((capability.risk === "high" || capability.risk === "critical") && !capability.requiresApproval) {
    throw new Error(`SAI consequential capability must require approval: ${capability.id}`);
  }
  if (mutates && !verificationRequired) {
    throw new Error(`SAI mutating capability requires verification: ${capability.id}`);
  }
  if (mutates && !capability.simulate) {
    throw new Error(`SAI mutating capability requires simulation: ${capability.id}`);
  }

  registry.set(capability.id, {
    ...capability,
    id: capability.id.trim(),
    domain,
    kind,
    mutates,
    verificationRequired,
    allowedRoles,
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
  return listSaiCapabilities().map(({ execute: _execute, simulate: _simulate, ...descriptor }) => descriptor);
}

export function requireSaiCapability(id: string): RegisteredSaiCapability {
  const capability = getSaiCapability(id);
  if (!capability) throw new Error(`Unknown SAI capability: ${id}`);
  return capability;
}

export function authorizeSaiCapability(capability: RegisteredSaiCapability, actor: { userId: string; businessId: string; role?: string }): void {
  if (!actor.userId || !actor.businessId) throw new Error("SAI_ACTOR_CONTEXT_REQUIRED");
  const role = actor.role?.trim();
  if (!role || !capability.allowedRoles.includes(role)) {
    throw new Error(`SAI_CAPABILITY_ROLE_FORBIDDEN:${capability.id}`);
  }
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
    if (capability.mutates && !capability.simulate) {
      throw new Error(`SAI mutating capability requires simulation: ${capability.id}`);
    }
  }
}

function inferDomain(id: string): SaiCapabilityDomain {
  const prefix = id.split(".")[0] as SaiCapabilityDomain;
  return ["business", "pos", "inventory", "customer", "payments", "aeps", "dmt", "recharge", "finance"].includes(prefix)
    ? prefix
    : "system";
}
