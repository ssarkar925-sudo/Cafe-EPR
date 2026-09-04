"use client";

import { useEffect } from "react";

const RESET_MARKER = "sccomm_fresh_business_reset_20260904";
const LOCAL_OUTBOX_KEY = "sccomm_whatsapp_local_outbox";
const LOCAL_CONFIG_KEY = "sccomm_whatsapp_config";

export default function FreshWhatsAppResetClient() {
  useEffect(() => {
    try {
      if (localStorage.getItem(RESET_MARKER) === "1") return;

      localStorage.removeItem(LOCAL_OUTBOX_KEY);
      localStorage.removeItem(LOCAL_CONFIG_KEY);
      localStorage.setItem(RESET_MARKER, "1");

      // Clear this tab's stale React/browser state after the one-time reset.
      window.location.reload();
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }, []);

  return null;
}
