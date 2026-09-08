"use client";

import { useEffect } from "react";

const WHATSAPP_QUERY = /\bwhatsapp\b/i;
const ALERT_KEY = "cafe-epr-whatsapp-alert";

export default function AIWhatsAppBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/api/ai/agent") && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          if (typeof payload?.message === "string" && WHATSAPP_QUERY.test(payload.message)) return originalFetch("/api/ai/whatsapp", init);
        } catch {
          // Fall through to the normal AI endpoint for malformed/non-JSON requests.
        }
      }
      return originalFetch(input, init);
    };
    window.fetch = wrappedFetch;

    const check = async () => {
      try {
        const response = await originalFetch("/api/ai/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "automatic WhatsApp health check; reconnect if safely possible" }),
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.connected) {
          if (data?.connected) window.localStorage.removeItem(ALERT_KEY);
          return;
        }
        const alertText = String(data?.message || "WhatsApp gateway is disconnected or unhealthy.");
        const previous = window.localStorage.getItem(ALERT_KEY);
        if (previous !== alertText) {
          window.localStorage.setItem(ALERT_KEY, alertText);
          if ("Notification" in window && Notification.permission === "granted") new Notification("Cafe ERP — WhatsApp Alert", { body: alertText });
        }
      } catch {
        // Monitoring must never block the AI UI.
      }
    };

    void check();
    const timer = window.setInterval(() => { void check(); }, 5 * 60 * 1000);
    return () => {
      window.fetch = originalFetch;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
