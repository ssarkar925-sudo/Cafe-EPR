const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("path");

let mainWindow = null;

const DEFAULT_CLOUD_URL = "https://cafeerp.workers.dev";
const APP_URL = process.env.APP_URL || DEFAULT_CLOUD_URL;

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
  });
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
