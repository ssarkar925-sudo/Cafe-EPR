/**
 * V1 client session mirror (React Context only — no state-management lib).
 *
 * The value is resolved ONCE on the server (app/v1/layout.tsx via
 * getV1SessionContext) and passed as initial state. Gating (redirect,
 * inactive-profile block) happens server-side; this context only mirrors
 * the session for navigation visibility and display. Backend/RPC
 * authorization remains authoritative for every mutation.
 */

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { V1SessionContext } from "@/lib/v1/v1-contracts";

const V1SessionReactContext = createContext<V1SessionContext | null>(null);

export function V1SessionProvider({
  initial,
  children,
}: {
  initial: V1SessionContext;
  children: ReactNode;
}) {
  const [session] = useState<V1SessionContext>(initial);
  return <V1SessionReactContext.Provider value={session}>{children}</V1SessionReactContext.Provider>;
}

/** Mirror-only session. Null outside the V1 shell (never a security input). */
export function useV1Session(): V1SessionContext | null {
  return useContext(V1SessionReactContext);
}
