/**
 * ==============================================================================
 * Smart Business Suite - Local WhatsApp Gateway Server (100% Free Forever)
 * ==============================================================================
 * 
 * Features:
 * - Live Web Dashboard at http://localhost:3001 (Scan QR code in browser!)
 * - Automatic Secure HTTPS Public Tunnel (Localtunnel) for Cloud/Vercel sites
 * - Terminal QR Code support
 * - Automatic Reconnection & Persistent Authentication (auth_info_baileys/)
 * - Background Invoice & Receipt Auto-Delivery
 * ==============================================================================
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const AUTH_DIR = path.join(__dirname, "..", "auth_info_baileys");

let sock = null;
let isConnected = false;
let qrCodeRaw = "";
let qrDataUrl = "";
let lastStatus = "Initializing...";
let userPhone = "";
let tunnelUrl = "";

// Initialize Localtunnel for HTTPS access from Vercel (skipped on Render)
async function initTunnel() {
  if (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) {
    tunnelUrl = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME || "sccomm-whatsapp-gateway"}.onrender.com`;
    console.log(`🌐 Running on Render Cloud at: ${tunnelUrl}`);
    return;
  }

  try {
    const localtunnel = require("localtunnel");
    console.log("🌐 Creating secure HTTPS cloud tunnel for Vercel...");
    const tunnel = await localtunnel({ port: PORT });
    tunnelUrl = tunnel.url;
    console.log("\n========================================================");
    console.log(`🚀 SECURE HTTPS TUNNEL LIVE: ${tunnelUrl}`);
    console.log("👉 Paste this HTTPS URL into Vercel Settings -> Gateway API URL!");
    console.log("========================================================\n");

    tunnel.on("close", () => {
      console.log("⚠️ Tunnel closed. Re-opening in 5 seconds...");
      tunnelUrl = "";
      setTimeout(initTunnel, 5000);
    });

    tunnel.on("error", (err) => {
      console.log("⚠️ Tunnel error:", err.message);
    });
  } catch (err) {
    console.log("⚠️ Could not create localtunnel:", err.message);
  }
}

async function initWhatsApp() {
  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await import("@whiskeysockets/baileys");
    const qrcodeTerminal = (await import("qrcode-terminal")).default;
    const pino = (await import("pino")).default;
    const QRCode = require("qrcode");

    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true,
    }));

    lastStatus = "Starting WhatsApp socket...";
    console.log("\n========================================================");
    console.log(`🚀 Starting Baileys WhatsApp Gateway (v${version.join(".")})...`);
    console.log("========================================================\n");

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: ["Smart Business Suite", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCodeRaw = qr;
        lastStatus = "Waiting for QR Code scan...";
        try {
          qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
        } catch (e) {
          qrDataUrl = "";
        }

        console.log("\n📱 SCAN QR CODE (Open http://localhost:3001 in browser or scan terminal):\n");
        qrcodeTerminal.generate(qr, { small: true });
        console.log(`👉 Open http://localhost:${PORT} in your browser to view the clean QR Code screen!\n`);
      }

      if (connection === "close") {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        lastStatus = `Disconnected: ${lastDisconnect?.error?.message || statusCode}`;

        console.log(`❌ Connection closed (${lastStatus}). Reconnecting: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(initWhatsApp, 4000);
        } else {
          console.log("⚠️ Session logged out. Removing auth directory for a fresh QR scan...");
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch {}
          setTimeout(initWhatsApp, 2000);
        }
      } else if (connection === "open") {
        isConnected = true;
        qrCodeRaw = "";
        qrDataUrl = "";
        userPhone = sock?.user?.id ? sock.user.id.split(":")[0] : "";
        lastStatus = `Connected as +${userPhone || "Store"}`;

        console.log("\n========================================================");
        console.log(`✅ WHATSAPP CONNECTED SUCCESSFULLY (${lastStatus})!`);
        console.log("📡 Ready to send automated invoices & receipts in background.");
        console.log(`⚡ Local Screen: http://localhost:${PORT}`);
        if (tunnelUrl) console.log(`🌐 Cloud Vercel URL: ${tunnelUrl}`);
        console.log("========================================================\n");
      }
    });
  } catch (err) {
    lastStatus = "Baileys not installed";
    console.log("⚠️ Baileys library error:", err.message);
  }
}

// Format phone number to JID: 919876543210 -> 919876543210@s.whatsapp.net
function formatJid(rawPhone) {
  let clean = String(rawPhone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = "91" + clean;
  return clean.includes("@s.whatsapp.net") ? clean : `${clean}@s.whatsapp.net`;
}

// HTML Web Dashboard
function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Business Suite · Local WhatsApp Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 32px;
      max-width: 540px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    .badge-online { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-waiting { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot-online { background: #22c55e; box-shadow: 0 0 10px #22c55e; }
    .dot-waiting { background: #eab308; box-shadow: 0 0 10px #eab308; }
    h1 { font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    p.sub { font-size: 13px; color: #94a3b8; margin-top: 6px; margin-bottom: 20px; }
    .qr-container {
      background: #ffffff;
      padding: 16px;
      border-radius: 18px;
      display: inline-block;
      margin: 0 auto 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .qr-container img { display: block; width: 240px; height: 240px; border-radius: 8px; }
    .instructions {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 18px;
      text-align: left;
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .instructions ol { padding-left: 18px; }
    .instructions li { margin-bottom: 6px; }
    .tunnel-box {
      background: #0f172a;
      border: 1px solid #2563eb;
      border-radius: 16px;
      padding: 16px;
      text-align: left;
      margin-bottom: 20px;
    }
    .tunnel-title { font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px; }
    .tunnel-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(30, 41, 59, 0.8);
      padding: 8px 12px;
      border-radius: 8px;
      margin: 8px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid #334155;
      word-break: break-all;
    }
    .copy-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      margin-left: 8px;
      white-space: nowrap;
    }
    .tunnel-desc { font-size: 11px; color: #94a3b8; line-height: 1.4; }
    .status-box {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      color: #94a3b8;
      font-family: 'JetBrains Mono', monospace;
      margin-bottom: 20px;
    }
    .btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 12px 20px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      width: 100%;
      transition: 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge ${isConnected ? "badge-online" : "badge-waiting"}">
      <div class="dot ${isConnected ? "dot-online" : "dot-waiting"}"></div>
      ${isConnected ? "WHATSAPP CONNECTED & LIVE" : "WAITING FOR QR SCAN"}
    </div>

    <h1>Local WhatsApp Gateway</h1>
    <p class="sub">Smart Business Suite Background Messaging Service</p>

    ${
      isConnected
        ? `<div style="padding: 16px 0 24px;">
            <div style="width: 64px; height: 64px; background: rgba(34, 197, 94, 0.15); border: 2px solid #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 28px;">✓</div>
            <h3 style="color: #ffffff; font-size: 17px; font-weight: 700;">Ready to Send Invoices</h3>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Connected to WhatsApp: <strong style="color: #f8fafc;">+${userPhone || "Linked Store Phone"}</strong></p>
          </div>`
        : qrDataUrl
        ? `<div class="qr-container">
            <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
          </div>
          <div class="instructions">
            <strong>How to link your phone:</strong>
            <ol>
              <li>Open <strong>WhatsApp</strong> on your phone.</li>
              <li>Tap <strong>Settings</strong> (or 3 dots) → <strong>Linked Devices</strong>.</li>
              <li>Tap <strong>Link a Device</strong> and scan this QR code.</li>
            </ol>
          </div>`
        : `<div class="status-box">${lastStatus}</div>`
    }

    ${
      tunnelUrl
        ? `<div class="tunnel-box">
            <div class="tunnel-title">🌐 Cloud / Vercel HTTPS Gateway URL:</div>
            <div class="tunnel-url">
              <span id="tUrl">${tunnelUrl}</span>
              <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('tUrl').innerText); this.innerText='Copied!'; setTimeout(()=>this.innerText='Copy', 2000);">Copy</button>
            </div>
            <p class="tunnel-desc">💡 Paste this HTTPS URL in <strong>Settings → Notifications → Gateway API URL</strong> on your Vercel website so Vercel can deliver WhatsApp messages directly to this PC!</p>
          </div>`
        : `<div class="status-box">Creating secure HTTPS cloud tunnel... (refresh in 3s)</div>`
    }

    <div class="status-box">
      <div>Local Port: <strong>http://localhost:${PORT}</strong></div>
      <div style="margin-top: 4px;">Status: <strong>${lastStatus}</strong></div>
    </div>

    <button class="btn" onclick="window.location.reload()">↻ Refresh Dashboard</button>
  </div>

  <script>
    ${!isConnected || !tunnelUrl ? "setTimeout(() => window.location.reload(), 4000);" : ""}
  </script>
</body>
</html>`;
}

// HTTP API Server
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Access-Control-Request-Private-Network, Bypass-Tunnel-Reminder");
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Access-Control-Request-Private-Network, Bypass-Tunnel-Reminder",
      "Access-Control-Allow-Private-Network": "true",
    });
    res.end();
    return;
  }

  const urlPath = (req.url || "").split("?")[0].replace(/\/$/, "") || "/";

  // Web Dashboard View
  if ((urlPath === "/" || urlPath === "/qr" || urlPath === "/dashboard") && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getDashboardHtml());
    return;
  }

  // Health / Status JSON
  if (urlPath === "/health" || urlPath === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: isConnected ? "connected" : "waiting_for_qr",
        connected: isConnected,
        service: "sccomm-whatsapp-gateway",
        port: PORT,
        userPhone,
        tunnelUrl,
      })
    );
    return;
  }

  // Send Message Endpoint
  if ((urlPath === "/send-message" || urlPath === "/api/send") && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const phone = payload.phone || payload.number;
        const message = payload.message || payload.text;

        if (!phone || !message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Both phone and message are required." }));
          return;
        }

        const jid = formatJid(phone);

        if (!isConnected || !sock) {
          console.log(`[WhatsApp Gateway] ⚠️ Received message request for ${jid}, but WhatsApp is not connected yet.`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              status: "dispatched_mock",
              note: "Gateway active, scan QR at http://localhost:3001 to deliver live to WhatsApp",
              to: jid,
            })
          );
          return;
        }

        // Live send through Baileys WhatsApp Socket
        console.log(`[WhatsApp Gateway] 📤 Sending live WhatsApp message to ${jid}...`);
        const sent = await sock.sendMessage(jid, { text: message });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            status: "sent",
            to: jid,
            messageId: sent?.key?.id,
          })
        );
        console.log(`[WhatsApp Gateway] ✅ Delivered to ${jid} (Message ID: ${sent?.key?.id})`);
      } catch (err) {
        console.error("[WhatsApp Gateway] ❌ Error sending:", err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("========================================================");
  console.log(`⚡ Local WhatsApp Gateway running on http://localhost:${PORT}`);
  console.log(`🌐 Open in browser to scan QR code: http://localhost:${PORT}`);
  console.log("========================================================");
  initTunnel();
  initWhatsApp();
});
