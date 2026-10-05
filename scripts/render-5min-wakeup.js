#!/usr/bin/env node
/**
 * Render 5-Minute Wakeup Pinger (Keep-Alive Cron Engine)
 * Runs 24/7 to ping your Render WhatsApp Gateway service every 5 minutes (300,000 ms),
 * preventing Render's free tier from spinning down into sleep mode.
 */

const https = require("https");
const http = require("http");

// Configure your target service URL. Can be passed via RENDER_SERVICE_URL env or fallback.
const TARGET_URL = process.env.RENDER_SERVICE_URL || "https://sccomm-whatsapp-gateway.onrender.com/health";
const INTERVAL_MS = 5 * 60 * 1000; // Exactly 5 minutes

console.log("========================================================");
console.log("⚡ WhatsApp Gateway 5-Minute Wakeup Service Started");
console.log(`🎯 Target URL: ${TARGET_URL}`);
console.log(`⏰ Interval: Every 5 minutes (300 seconds)`);
console.log("========================================================");

function pingService() {
  const isHttps = TARGET_URL.startsWith("https://");
  const client = isHttps ? https : http;
  const start = Date.now();

  const req = client.get(TARGET_URL, {
    headers: {
      "User-Agent": "DigitalCafe-ERP-Wakeup-Bot/1.0",
      "Bypass-Tunnel-Reminder": "true"
    },
    timeout: 30000
  }, (res) => {
    const elapsed = Date.now() - start;
    console.log(`[${new Date().toISOString()}] 💓 Wakeup Ping OK -> Status ${res.statusCode} (${elapsed}ms)`);
    res.resume();
  });

  req.on("error", (err) => {
    console.warn(`[${new Date().toISOString()}] ⚠️ Wakeup Ping Failed: ${err.message}`);
  });

  req.on("timeout", () => {
    req.destroy();
    console.warn(`[${new Date().toISOString()}] ⚠️ Wakeup Ping Request Timed Out (30s)`);
  });
}

// Initial ping immediately on launch
pingService();

// Ping every 5 minutes continuously
setInterval(pingService, INTERVAL_MS);
