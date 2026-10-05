/**
 * apps/chrome-extension/content-scripts/passbook-sync.js
 * Floating 1-Click "Sync This Tab to CafeERP" button for passbook / ledger history pages.
 */

(function () {
  // Inject floating button
  const button = document.createElement("button");
  button.id = "cafeerp-sync-tab-btn";
  button.innerHTML = "📥 Sync This Tab to ERP";
  button.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    padding: 10px 18px;
    background: #0f172a;
    color: #ffffff;
    border: 2px solid #38bdf8;
    border-radius: 9999px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
  `;

  button.onmouseover = () => {
    button.style.background = "#0284c7";
    button.style.transform = "scale(1.05)";
  };
  button.onmouseout = () => {
    button.style.background = "#0f172a";
    button.style.transform = "scale(1)";
  };

  button.onclick = () => {
    button.innerText = "⏳ Scraping Tab...";
    const tables = document.querySelectorAll("table");
    const extractedRows = [];

    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row, idx) => {
        if (idx === 0) return; // Skip header
        const text = row.innerText.trim();
        if (text) {
          extractedRows.push(text);
        }
      });
    });

    if (extractedRows.length === 0) {
      alert("No transaction table found on this page.");
      button.innerHTML = "📥 Sync This Tab to ERP";
      return;
    }

    button.innerText = `Syncing ${extractedRows.length} rows...`;

    chrome.runtime.sendMessage(
      {
        type: "PORTAL_TRANSACTION_CAPTURED",
        payload: {
          source: "CHROME_EXTENSION",
          portalOrAppName: window.location.hostname,
          serviceType: "BATCH_PASSBOOK_SYNC",
          grossAmountPaisa: "0",
          timestamp: new Date().toISOString(),
          rawPayload: { rows: extractedRows },
        },
      },
      (res) => {
        if (res && res.success) {
          button.innerHTML = `✓ Synced ${extractedRows.length} Txns!`;
          button.style.background = "#059669";
          button.style.borderColor = "#34d399";
          setTimeout(() => {
            button.innerHTML = "📥 Sync This Tab to ERP";
            button.style.background = "#0f172a";
            button.style.borderColor = "#38bdf8";
          }, 3000);
        } else {
          button.innerHTML = "⚠️ Queued Locally";
          setTimeout(() => {
            button.innerHTML = "📥 Sync This Tab to ERP";
          }, 3000);
        }
      }
    );
  };

  document.body.appendChild(button);
})();
