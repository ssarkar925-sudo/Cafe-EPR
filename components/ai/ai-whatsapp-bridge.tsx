"use client";

import { useEffect } from "react";

const WHATSAPP_QUERY = /\bwhatsapp\b/i;

export default function AIWhatsAppBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/api/ai/agent") && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          if (typeof payload?.message === "string" && WHATSAPP_QUERY.test(payload.message)) {
            return originalFetch("/api/ai/whatsapp", init);
          }
        } catch {
          // Fall through to the normal AI endpoint for malformed/non-JSON requests.
        }
      }
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
