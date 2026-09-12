"use client";

import { useEffect } from "react";

/**
 * The POS is now a single standard billing workspace.
 * Block the legacy F2 mode switch so the retired Quick Sale UI cannot be reopened.
 */
export default function PosStandardOnlyLock() {
  useEffect(() => {
    const blockLegacyModeKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockLegacyModeKey, true);
    return () => window.removeEventListener("keydown", blockLegacyModeKey, true);
  }, []);

  return null;
}
