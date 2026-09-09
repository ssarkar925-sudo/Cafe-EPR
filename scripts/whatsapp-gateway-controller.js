const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const PROXY_PORT = Number(process.env.GATEWAY_PROXY_PORT || 3001);
const CHILD_PORT = Number(process.env.GATEWAY_CHILD_PORT || 3002);
const childScript = path.join(__dirname, "whatsapp-gateway.js");
let child = null;
let restarting = false;
let restartTimer = null;

function startChild() {
  if (child) return;
  child = spawn(process.execPath, [childScript], {
    env: { ...process.env, PORT: String(CHILD_PORT) },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", (code, signal) => {
    child = null;
    if (!restarting) {
      console.warn(`[WhatsApp Gateway Controller] gateway exited (${code ?? ""}${signal ? `/${signal}` : ""}); restarting in 2s`);
      restartTimer = setTimeout(startChild, 2000);
    }
  });
}

function restartChild() {
  if (restarting) return;
  restarting = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  if (child) {
    try { child.kill(); } catch {}
    const waitUntilGone = () => {
      if (child) return setTimeout(waitUntilGone, 100);
      startChild();
      setTimeout(() => { restarting = false; }, 5000);
    };
    waitUntilGone();
  } else {
    startChild();
    setTimeout(() => { restarting = false; }, 5000);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "").split("?")[0].replace(/\/$/, "") || "/";
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Access-Control-Request-Private-Network, Bypass-Tunnel-Reminder",
      "Access-Control-Allow-Private-Network": "true",
    });
    return res.end();
  }

  if (req.method === "POST" && (urlPath === "/reconnect" || urlPath === "/api/reconnect" || urlPath === "/restart-socket")) {
    restartChild();
    return sendJson(res, 202, {
      success: true,
      status: "restarting",
      message: "WhatsApp gateway restart requested. Existing authentication files are preserved; a QR is required only if the saved session is no longer valid.",
    });
  }

  const proxy = http.request({
    hostname: "127.0.0.1",
    port: CHILD_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${CHILD_PORT}` },
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", () => sendJson(res, 502, { error: "WhatsApp gateway child process is not reachable yet." }));
  req.pipe(proxy);
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[WhatsApp Gateway Controller] proxy listening on http://localhost:${PROXY_PORT}; child gateway on ${CHILD_PORT}`);
  startChild();
});

function shutdown() {
  restarting = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child) { try { child.kill(); } catch {} }
  try { server.close(); } catch {}
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
