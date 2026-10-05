/**
 * apps/chrome-extension/background.js
 * Background service worker forwarding intercepted transactions to local CafeERP intake API.
 */

const LOCAL_ERP_API = "http://localhost:3000/api/intake/portal-event";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PORTAL_TRANSACTION_CAPTURED") {
    console.log("[CafeERP Watcher] Transaction captured:", message.payload);

    fetch(LOCAL_ERP_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("[CafeERP Watcher] Successfully posted to ERP:", data);
        sendResponse({ success: true, erpResponse: data });
      })
      .catch((err) => {
        console.warn("[CafeERP Watcher] ERP local API unavailable, caching locally:", err);
        // Store in local extension storage for replay when ERP opens
        chrome.storage.local.get(["pendingQueue"], (result) => {
          const queue = result.pendingQueue || [];
          queue.push({ ...message.payload, queuedAt: new Date().toISOString() });
          chrome.storage.local.set({ pendingQueue: queue });
        });
        sendResponse({ success: false, queued: true });
      });

    return true; // Keep message channel open for async fetch
  }
});
