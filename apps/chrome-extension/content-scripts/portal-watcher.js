/**
 * apps/chrome-extension/content-scripts/portal-watcher.js
 * Scans portal pages for transaction success receipts & modal alerts.
 */

(function () {
  console.log("[CafeERP Watcher] Content script active on:", window.location.hostname);

  const getPortalName = () => {
    const host = window.location.hostname;
    if (host.includes("paynearby")) return "PayNearby";
    if (host.includes("spicemoney")) return "SpiceMoney";
    if (host.includes("csc")) return "CSC";
    if (host.includes("rapipay")) return "Rapipay";
    return "GenericPortal";
  };

  // Helper to extract amounts like "₹ 3,000.00" or "Rs. 3000"
  const parseAmountPaisa = (text) => {
    if (!text) return 0n;
    const clean = text.replace(/[^0-9.]/g, "");
    const val = parseFloat(clean);
    return isNaN(val) ? 0n : BigInt(Math.round(val * 100));
  };

  // Observe DOM for transaction success modals
  const observer = new MutationObserver(() => {
    // Look for success receipt elements
    const successIndicators = document.querySelectorAll(
      ".receipt-container, .success-modal, [class*='success'], [class*='receipt'], [id*='receipt']"
    );

    for (const el of successIndicators) {
      if (el.getAttribute("data-cafeerp-scanned")) continue;

      const text = el.innerText || "";
      if (
        (text.includes("Transaction Successful") || text.includes("Txn Success") || text.includes("Success")) &&
        (text.includes("RRN") || text.includes("Txn ID") || text.includes("Amount"))
      ) {
        el.setAttribute("data-cafeerp-scanned", "true");

        // Extract RRN regex
        const rrnMatch = text.match(/(?:RRN|Txn ID|Reference No|Ref No)[:\s]+([A-Za-z0-9]+)/i);
        const rrn = rrnMatch ? rrnMatch[1] : "";

        // Extract Amount regex
        const amountMatch = text.match(/(?:Amount|Txn Amount)[:\s]+(?:₹|Rs\.?)?\s*([\d,]+\.?\d*)/i);
        const amountPaisa = amountMatch ? parseAmountPaisa(amountMatch[1]) : 0n;

        // Detect Service
        let serviceType = "OTHER";
        if (text.toLowerCase().includes("aeps") || text.toLowerCase().includes("cash withdrawal")) {
          serviceType = "AEPS_CASH_OUT";
        } else if (text.toLowerCase().includes("dmt") || text.toLowerCase().includes("money transfer")) {
          serviceType = "DMT";
        } else if (text.toLowerCase().includes("recharge")) {
          serviceType = "RECHARGE";
        } else if (text.toLowerCase().includes("bill") || text.toLowerCase().includes("bbps")) {
          serviceType = "BILL_PAYMENT";
        }

        if (amountPaisa > 0n) {
          console.log("[CafeERP Watcher] Detected success transaction:", {
            portal: getPortalName(),
            serviceType,
            amountPaisa: amountPaisa.toString(),
            rrn,
          });

          chrome.runtime.sendMessage({
            type: "PORTAL_TRANSACTION_CAPTURED",
            payload: {
              source: "CHROME_EXTENSION",
              portalOrAppName: getPortalName(),
              serviceType,
              grossAmountPaisa: amountPaisa.toString(),
              rrnOrUtr: rrn,
              timestamp: new Date().toISOString(),
              rawText: text.substring(0, 300),
            },
          });
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
