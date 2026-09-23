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
  { key: "pos", label: "POS", href: "/v1/pos", roles: ["admin", "manager", "staff", "cashier"], phase: null },
  { key: "inventory", label: "Inventory", href: "/v1/inventory", roles: ["admin", "manager", "staff", "cashier"], phase: null },
  { key: "purchases", label: "Purchases", href: "/v1/purchases", roles: ["admin", "manager"], phase: null },
  { key: "customers", label: "Customers & Khata", href: "/v1/masters/customers", roles: ["admin", "manager", "staff", "cashier"], phase: null },
  { key: "services", label: "Services", href: "/v1/services", roles: ["admin", "manager"], phase: null },
  { key: "returns", label: "Returns", href: null, roles: ["admin", "manager", "staff", "cashier"], phase: 4 },
  { key: "dayclose", label: "Day Close", href: "/v1/day-close", roles: ["admin", "manager"], phase: null },
  { key: "approvals", label: "Approvals", href: "/v1/admin/approvals", roles: ["admin"], phase: null },
  { key: "backentry", label: "Back-entry", href: "/v1/back-entry", roles: ["admin"], phase: null },
];

export function v1NavForRole(role: V1Role): V1NavItem[] {
  return v1NavItems.filter((item) => item.roles.includes(role));
}
