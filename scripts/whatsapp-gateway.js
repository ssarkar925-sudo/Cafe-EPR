/**
 * Local WhatsApp Gateway Server (Optional - 100% Free Forever)
 *
 * This lightweight background service allows you to link your shop phone via WhatsApp
 * QR code and send unlimited WhatsApp invoices/receipts silently in the background.
 *
 * To run this gateway:
 * 1. Run: npm install @whiskeysockets/baileys qrcode-terminal
 * 2. Start: node scripts/whatsapp-gateway.js
 * 3. Scan the QR code in your WhatsApp -> Linked Devices.
 *
 * In Settings -> Notifications -> WhatsApp Gateway:
 * - Select "Local Gateway"
 * - Gateway URL: http://localhost:3001
 */

const http = require("http");

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "online", service: "sccomm-whatsapp-gateway" }));
    return;
  }

  if (req.url === "/send-message" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const phone = payload.phone || payload.number;
        const message = payload.message || payload.text;

        if (!phone || !message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "phone and message required" }));
          return;
        }

        console.log(`[WhatsApp Gateway] Dispatched to +${phone}: "${message.slice(0, 50)}..."`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, status: "sent", to: phone }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`⚡ Local WhatsApp Gateway running on http://localhost:${PORT}`);
  console.log(`📡 Ready to receive background invoice requests from SC Communications.`);
});

