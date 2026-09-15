const http = require("http");
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");

// Render requires the public web process to bind to its injected PORT.
// Locally, fall back to the historical 3001 gateway port.
const PROXY_PORT = Number(process.env.PORT || process.env.GATEWAY_PROXY_PORT || 3001);
const configuredChildPort = Number(process.env.GATEWAY_CHILD_PORT || (PROXY_PORT + 1));
const CHILD_PORT = configuredChildPort === PROXY_PORT ? PROXY_PORT + 1 : configuredChildPort;
const childScript = path.join(__dirname, "whatsapp-gateway.js");
let child = null;
let restarting = false;
let restartTimer = null;

// Short-lived in-memory PDF handoff between the public controller and the child
// gateway. This lets the ERP send PDF bytes directly instead of requiring the
// child gateway to fetch a signed URL through a separate network hop.
const pendingDocuments = new Map();
const DOCUMENT_TTL_MS = 2 * 60 * 1000;
const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

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
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function cleanupDocuments() {
  const now = Date.now();
  for (const [token, entry] of pendingDocuments) {
    if (entry.expiresAt <= now) pendingDocuments.delete(token);
  }
}
setInterval(cleanupDocuments, 30 * 1000).unref();

function storeDocument(buffer) {
  const token = crypto.randomBytes(32).toString("hex");
  pendingDocuments.set(token, { buffer, expiresAt: Date.now() + DOCUMENT_TTL_MS });
  return token;
}

function servePendingDocument(res, token) {
  const entry = pendingDocuments.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    pendingDocuments.delete(token);
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Document expired.");
    return;
  }

  // One-time read: the child gateway consumes the bytes and the token becomes
  // unusable immediately afterwards.
  pendingDocuments.delete(token);
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": String(entry.buffer.length),
    "Cache-Control": "no-store, max-age=0",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(entry.buffer);
}

function proxyRequest(req, res) {
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: CHILD_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${CHILD_PORT}` },
  }, (upstream) => {
    const urlPath = (req.url || "").split("?")[0].replace(/\/$/, "") || "/";
    const isHealth = req.method === "GET" && ["/health", "/status", "/ping", "/keepalive"].includes(urlPath);
    if (!isHealth) {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
      return;
    }

    let body = "";
    upstream.setEncoding("utf8");
    upstream.on("data", (chunk) => { body += chunk; });
    upstream.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        sendJson(res, upstream.statusCode || 502, {
          ...payload,
          controller: "cafeerp-whatsapp-gateway-controller-v1",
          reconnectSupported: true,
          reconnectEndpoint: "/reconnect",
          controllerPort: PROXY_PORT,
          childPort: CHILD_PORT,
        });
      } catch {
        sendJson(res, 502, { error: "WhatsApp gateway returned an invalid health response." });
      }
    });
  });
  proxy.on("error", (error) => sendJson(res, 502, { error: `WhatsApp gateway child process is not reachable: ${error?.message || "connection failed"}` }));
  req.pipe(proxy);
}

function proxyJsonToChild(req, res, pathName, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "host": `127.0.0.1:${CHILD_PORT}`,
  };
  if (req.headers["x-api-key"]) headers["x-api-key"] = req.headers["x-api-key"];

  const proxy = http.request({
    hostname: "127.0.0.1",
    port: CHILD_PORT,
    path: pathName,
    method: "POST",
    headers,
  }, (upstream) => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", (error) => sendJson(res, 502, { success: false, error: `WhatsApp gateway child process is not reachable: ${error?.message || "connection failed"}` }));
  proxy.end(body);
}

function readJsonBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(new Error("Request body exceeds the maximum allowed size."));
        try { req.destroy(); } catch {}
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

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
    return res.end();
  }

  const urlPath = (req.url || "").split("?")[0].replace(/\/$/, "") || "/";

  // Internal one-time PDF handoff used only by the child gateway on localhost.
  if (req.method === "GET" && urlPath.startsWith("/__internal/pdf/")) {
    const token = urlPath.slice("/__internal/pdf/".length);
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      res.writeHead(404);
      return res.end("Document not found.");
    }
    return servePendingDocument(res, token);
  }

  if (req.method === "POST" && (urlPath === "/reconnect" || urlPath === "/api/reconnect" || urlPath === "/restart-socket")) {
    restartChild();
    return sendJson(res, 202, {
      success: true,
      status: "restarting",
      message: "WhatsApp gateway restart requested. Existing authentication files are preserved; a QR is required only if the saved session is no longer valid.",
      controller: "cafeerp-whatsapp-gateway-controller-v1",
      reconnectSupported: true,
    });
  }

  // Accept the ERP's direct PDF payload and hand it to the child gateway through
  // a short-lived one-time localhost URL. This avoids signed-URL fetch failures
  // caused by Deployment Protection, tunnels, or gateway egress restrictions.
  if (req.method === "POST" && (urlPath === "/send-document" || urlPath === "/api/send-document")) {
    try {
      const payload = await readJsonBody(req);
      const rawBase64 = String(payload?.documentBase64 || payload?.pdfBase64 || "").trim();
      if (rawBase64) {
        const encoded = rawBase64.replace(/^data:application\/pdf;base64,/i, "");
        const buffer = Buffer.from(encoded, "base64");
        if (!buffer.length) throw new Error("Invoice PDF payload is empty.");
        if (buffer.length > DOCUMENT_MAX_BYTES) throw new Error("Invoice PDF exceeds 15 MB.");
        if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Invoice PDF payload is not a valid PDF.");

        const token = storeDocument(buffer);
        const childPayload = {
          ...payload,
          documentUrl: `http://127.0.0.1:${PROXY_PORT}/__internal/pdf/${token}`,
          document: `http://127.0.0.1:${PROXY_PORT}/__internal/pdf/${token}`,
        };
        delete childPayload.documentBase64;
        delete childPayload.pdfBase64;
        return proxyJsonToChild(req, res, "/send-document", childPayload);
      }
    } catch (error) {
      return sendJson(res, 400, { success: false, error: error?.message || "Invalid PDF document payload." });
    }
  }

  proxyRequest(req, res);
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[WhatsApp Gateway Controller] proxy listening on port ${PROXY_PORT}; child gateway on ${CHILD_PORT}`);
  startChild();
});

function shutdown() {
  restarting = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (child) { try { child.kill(); } catch {} }
  try { server.close(); } catch {}
  pendingDocuments.clear();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
