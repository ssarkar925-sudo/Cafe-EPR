/**
 * V1 primary navigation map (display only — never access control).
 *
 * `phase: null` = live now. `phase: N` = renders disabled until that
 * application phase ships (no route, no logic). Backend RPC gates are the
 * real security; hiding a nav item implies no permission.
 */

import type { V1Role } from "@/lib/v1/v1-contracts";

export interface V1NavItem {
  key: string;
  label: string;
  href: string | null;
  roles: V1Role[];
  phase: number | null;
}

export const v1NavItems: V1NavItem[] = [
  { key: "home", label: "Home", href: "/v1", roles: ["admin", "manager", "staff", "cashier"], phase: null },
  { key: "masters", label: "Masters", href: "/v1/masters", roles: ["admin", "manager"], phase: null },
  { key: "admin", label: "Admin", href: "/v1/admin", roles: ["admin"], phase: null },
  { key: "pos", label: "POS", href: null, roles: ["admin", "manager", "staff", "cashier"], phase: 4 },
  { key: "inventory", label: "Inventory", href: null, roles: ["admin", "manager", "staff", "cashier"], phase: 4 },
  { key: "purchases", label: "Purchases", href: null, roles: ["admin", "manager"], phase: 4 },
  { key: "customers", label: "Customers & Khata", href: null, roles: ["admin", "manager", "staff", "cashier"], phase: 4 },
  { key: "services", label: "Services", href: null, roles: ["admin", "manager"], phase: 4 },
  { key: "returns", label: "Returns", href: "/v1/returns", roles: ["admin", "manager", "staff", "cashier"], phase: null },
  { key: "dayclose", label: "Day Close", href: null, roles: ["admin", "manager"], phase: 4 },
  { key: "approvals", label: "Approvals", href: null, roles: ["admin", "manager", "staff", "cashier"], phase: 4 },
  { key: "backentry", label: "Back-entry", href: null, roles: ["admin"], phase: 4 },
];

export function v1NavForRole(role: V1Role): V1NavItem[] {
  return v1NavItems.filter((item) => item.roles.includes(role));
}
