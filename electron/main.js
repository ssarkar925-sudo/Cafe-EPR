const { app, BrowserWindow, ipcMain, Notification, clipboard } = require("electron");
const path = require("path");
const { AepsWatcher } = require("./aeps-watcher");

let mainWindow = null;
let clipboardTimer = null;
let lastClipboardText = "";
const aepsWatcher = new AepsWatcher();

const DEFAULT_CLOUD_URL = "https://cafeerp.ssarkar925.workers.dev";
const APP_URL = process.env.APP_URL || DEFAULT_CLOUD_URL;

function isCafeErpOrigin(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
}

function configureMediaPermissions(webContentsSession) {
  const ses = webContentsSession;

  // Electron's media permission object exposes the requesting frame origin via
  // securityOrigin. Bind the handlers to the exact session used by the
  // CafeERP BrowserWindow rather than assuming defaultSession ownership.
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin =
      details?.securityOrigin ||
      webContents?.getURL?.() ||
      "";

    const allowedOrigin = isCafeErpOrigin(origin);
    const mediaTypes = Array.isArray(details?.mediaTypes)
      ? details.mediaTypes
      : [];
    const requestsAudio = mediaTypes.length === 0 || mediaTypes.includes("audio");

    if (permission === "media" && allowedOrigin && requestsAudio) {
      callback(true);
      return;
    }

    callback(false);
  });

  ses.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      const origin =
        details?.securityOrigin ||
        requestingOrigin ||
        webContents?.getURL?.() ||
        "";

      if (permission === "media" && isCafeErpOrigin(origin)) {
        const mediaType = details?.mediaType;
        return !mediaType || mediaType === "audio" || mediaType === "unknown";
      }

      return false;
    },
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "CafeERP - Enterprise Cyber Cafe & Retail ERP",
    icon: path.join(__dirname, "../public/app-icon.png"),
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Remove default window menu for modern app feel
  mainWindow.setMenuBarVisibility(false);

  // Configure microphone permissions on the exact session used by this window
  // before any remote CafeERP page is loaded.
  configureMediaPermissions(mainWindow.webContents.session);

  // Load Cloudflare Worker URL for instant over-the-air updates
  mainWindow.loadURL(APP_URL);

  // Handle load failures gracefully (e.g. offline)
  mainWindow.webContents.on("did-fail-load", () => {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>CafeERP - Connecting...</title>
        <style>
          body { background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { text-align: center; max-width: 420px; padding: 32px; border: 1px solid #334155; border-radius: 24px; background: #1e293b; }
          h2 { margin: 0 0 12px; font-size: 20px; font-weight: 800; }
          p { color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 24px; }
          button { background: #4f46e5; color: #fff; border: none; padding: 10px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 13px; }
          button:hover { background: #4338ca; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Network Connection Needed</h2>
          <p>CafeERP could not reach the server. Please check your internet connection and try again.</p>
          <button onclick="window.location.href='${APP_URL}'">Retry Connection</button>
        </div>
      </body>
      </html>
    `)}`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (clipboardTimer) {
      clearInterval(clipboardTimer);
      clipboardTimer = null;
    }
    void aepsWatcher.stop();
  });

  // Background Smart Clipboard Automation:
  // Detects any copied AEPS / DigiPay / Spice Money slip text from ANY external window or app.
  // Sends a transaction event directly to the ERP workspace to auto-fill the form instantly.
  startClipboardWatcher();
}

function startClipboardWatcher() {
  if (clipboardTimer) clearInterval(clipboardTimer);
  clipboardTimer = setInterval(() => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const text = String(clipboard.readText() || "").trim();
      if (!text || text === lastClipboardText || text.length < 20 || text.length > 5000) return;

      const isAepsSlip =
        /\b(?:rrn|bank\s*ref|utr|transaction\s*id|txn\s*id)\b/i.test(text) &&
        /\b(?:₹|rs\.?|inr|amount|withdrawal|balance)\b/i.test(text);

      if (isAepsSlip) {
        lastClipboardText = text;
        const refMatch =
          text.match(/\b(?:rrn|bank\s*ref(?:\.?\s*(?:no|number))?)\s*[:#=\-]?\s*([0-9A-Za-z]{6,35})/i) ||
          text.match(/\b(?:transaction\s*id|txn\s*id)\s*[:#=\-]?\s*([0-9A-Za-z]{6,35})/i);
        const amtMatch = text.match(
          /\b(?:amount|amt|withdrawal\s*amount)\s*[:#=\-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
        ) || text.match(/(?:₹|Rs\.?|INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
        const bankMatch = text.match(
          /\b(?:bank\s*name|issuer\s*bank|customer\s*bank)\s*[:#=\-]?\s*([A-Za-z][A-Za-z .&'-]{2,60})/i
        ) || text.match(/\b(State\s+Bank\s+of\s+India|SBI|Bank\s+of\s+India|Bank\s+of\s+Baroda|Punjab\s+National\s+Bank|PNB|Canara\s+Bank|HDFC|ICICI|Axis|Union\s+Bank)\b/i);
        const aadhaarMatch = text.match(
          /\b(?:customer\s*id|aadhaar|aadhar)\s*(?:last\s*4|no|number)?\s*[:#=\-]?\s*(?:[xX*#\s-]*)(\d{4})\b/i
        );
        const mobileMatch = text.match(/\b(?:mobile|phone|contact)\s*[:#=\-]?\s*([6-9]\d{9})/i) ||
          text.match(/\b([6-9]\d{9})\b/);

        const ref = refMatch ? refMatch[1].trim() : "";
        const rawAmt = amtMatch ? amtMatch[1].replace(/,/g, "") : "";
        const amountNum = rawAmt ? Number(rawAmt) : null;

        if (ref && amountNum && amountNum > 0) {
          const transaction = {
            externalTransactionId: ref,
            externalReference: ref,
            reference: ref,
            amount: amountNum.toFixed(2),
            bankName: bankMatch ? bankMatch[1].trim() : null,
            aadhaarLast4: aadhaarMatch ? aadhaarMatch[1].trim() : null,
            customerMobile: mobileMatch ? mobileMatch[1].trim() : null,
            transactionType: "cash_out",
            status: "success",
            rawText: text,
          };

          mainWindow.webContents.send("aeps-watcher-event", {
            type: "transaction",
            portalId: "clipboard-auto",
            portalName: "Automated Clipboard Capture",
            sourceId: "clipboard",
            sourceUrl: "clipboard://live",
            fingerprint: `clipboard|${ref}|${transaction.amount}`,
            transaction,
            detectedAt: new Date().toISOString(),
          });

          // Focus main window to show populated transaction
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      }
    } catch {}
  }, 1000);
}

// IPC Handlers for native hardware printing
ipcMain.handle("get-printers", async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle("print-thermal", async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  try {
    return await new Promise((resolve) => {
      mainWindow.webContents.print(
        {
          silent: options.silent ?? true,
          printBackground: true,
          deviceName: options.deviceName || undefined,
          margins: { marginType: "none" },
          pageSize: options.pageSize || { width: 80000, height: 297000 }, // 80mm thermal receipt
        },
        (success, failureReason) => {
          if (!success) {
            resolve({ success: false, error: failureReason });
          } else {
            resolve({ success: true });
          }
        }
      );
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC handlers for the desktop AEPS Watcher.
// The watcher uses an in-memory Electron session and never receives provider credentials.
// It only reads visible portal transaction data and sends normalized candidates to the renderer.
ipcMain.handle("aeps-watcher-collect-sources", async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: "No active CafeERP window." };
  try {
    return await aepsWatcher.collectSources({
      portalId: options.portalId,
      portalName: options.portalName,
      sources: options.sources,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("aeps-watcher-snapshot-sources", async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: "No active CafeERP window." };

  try {
    return await aepsWatcher.snapshotLiveSources({
      portalId: options.portalId,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("aeps-watcher-start-all", async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: "No active CafeERP window." };

  try {
    const result = await aepsWatcher.startAll(
      {
        portalId: options.portalId,
        portalName: options.portalName,
        sources: options.sources,
        intervalSeconds: options.intervalSeconds,
      },
      (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("aeps-watcher-event", payload);
        }
      }
    );
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("aeps-watcher-start", async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: "No active CafeERP window." };

  try {
    const result = await aepsWatcher.start(
      {
        portalId: options.portalId,
        portalName: options.portalName,
        sourceUrl: options.sourceUrl,
        intervalSeconds: options.intervalSeconds,
      },
      (payload) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("aeps-watcher-event", payload);
        }
      }
    );

    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("aeps-watcher-status", async () => {
  try {
    return { success: true, ...(aepsWatcher.getStatus ? aepsWatcher.getStatus() : { active: false, sourceCount: 0 }) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("aeps-watcher-stop", async () => {
  try {
    await aepsWatcher.stop();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// IPC Handler for Windows Native Toast Notifications
ipcMain.handle("show-notification", async (_event, options = {}) => {
  try {
    if (!Notification.isSupported()) {
      return { success: false, error: "Native notifications are not supported on this system." };
    }

    const toast = new Notification({
      title: options.title || "CafeERP Notification",
      body: options.message || options.body || "",
      icon: options.icon || path.join(__dirname, "../public/app-icon.png"),
      silent: options.silent ?? false,
    });

    toast.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    toast.show();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
