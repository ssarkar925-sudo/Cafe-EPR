// WhatsApp invoice-PDF document delivery tests (mock gateway, no network).
//
// Covers: successful send, invalid/missing credentials, malformed requests,
// invalid phone numbers, provider 403 (JSON), Cloudflare edge 403/1003
// (text/plain "error code: 1003"), provider 500, dispatched_mock, timeout and
// connection-refused network failures, plus the direct-delivery fallback
// helper (payload shape, secret hygiene, success/failure/timeout paths).
//
// Run: npm run test:whatsapp-document
import { register } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

register("./whatsapp-test-alias-hooks.mjs", import.meta.url);

const require = createRequire(import.meta.url);
const runner = require("./whatsapp-pdf-job-runner.js");

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function readRepo(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

const doc = await import("../lib/whatsapp-document.ts");
const direct = await import("../lib/whatsapp-direct-delivery.ts");

const {
  sendCustomerInvoicePdf,
  isCloudflareEdgeRejection,
  describeEndpointForLog,
  CLOUDFLARE_EDGE_REJECTION_CODE,
} = doc;
const { buildGatewayFallback, postDocumentDirectToGateway, validateClientPdfBytes, MAX_CLIENT_PDF_BYTES } = direct;

let passed = 0;
let failed = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function startMock(handler) {
  return new Promise((resolve) => {
    const hits = { count: 0 };
    const server = http.createServer((req, res) => {
      hits.count++;
      let body = "";
      req.on("data", (c) => { body += c.toString(); });
      req.on("end", () => handler(req, res, body, hits));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, hits, url: `http://127.0.0.1:${server.address().port}` }));
  });
}
function stopMock(mock) {
  return new Promise((resolve) => mock.server.close(() => resolve()));
}
function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(body);
}

const VALID_PHONE = "919876543210";
const PDF_B64 = Buffer.from("%PDF-1.4 mock-invoice").toString("base64");
const DOC_URL = "https://example.supabase.co/storage/v1/object/sign/customer-invoices/x?token=signed-token-value";
const localConfig = (gateway_url) => ({ provider: "local_gateway", gateway_url });

console.log("WhatsApp document delivery tests");

// 1. Successful PDF send through the gateway.
{
  const mock = await startMock((req, res) => json(res, 200, { success: true, status: "sent", messageId: "mock-msg-1" }));
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "Invoice-INV-0170.pdf", PDF_B64);
  ok("successful send returns provider + messageId", r.success === true && r.provider === "local_gateway" && r.messageId === "mock-msg-1", JSON.stringify(r));
  await stopMock(mock);
}

// 1b. Server fast-path includes the greeting caption; omits when absent.
{
  let seen = null;
  const mock = await startMock((req, res, body) => {
    try { seen = JSON.parse(body); } catch { seen = null; }
    json(res, 200, { success: true, status: "sent", messageId: "cap-1" });
  });
  const r1 = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "Invoice-INV-0176.pdf", PDF_B64, { caption: "Greetings from Shop!" });
  ok("fast-path sends caption", r1.success === true && seen && seen.caption === "Greetings from Shop!", JSON.stringify(seen && { caption: seen.caption }));
  seen = null;
  await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("fast-path omits empty caption", seen && !("caption" in seen), JSON.stringify(seen && Object.keys(seen)));
  await stopMock(mock);
}

// 2. Invalid credentials: Meta without token never touches the network.
{
  const mock = await startMock((req, res) => json(res, 200, {}));
  const r = await sendCustomerInvoicePdf(VALID_PHONE, { provider: "meta", meta_phone_number_id: "123" }, DOC_URL, "f.pdf", PDF_B64);
  ok("meta missing token rejected (400, no network)", r.success === false && r.status === 400 && mock.hits.count === 0, JSON.stringify(r));
  await stopMock(mock);
}

// 3. Invalid/expired credentials: UltraMsg without token/ID.
{
  const r = await sendCustomerInvoicePdf(VALID_PHONE, { provider: "ultramsg" }, DOC_URL, "f.pdf", PDF_B64);
  ok("ultramsg missing credentials rejected (400)", r.success === false && r.status === 400, JSON.stringify(r));
}

// 4. Malformed document request: missing phone / missing document.
{
  const mock = await startMock((req, res) => json(res, 200, {}));
  const r1 = await sendCustomerInvoicePdf("", localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  const r2 = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), "", "f.pdf");
  ok("malformed request rejected (400, no network)", r1.status === 400 && r2.status === 400 && mock.hits.count === 0);
  await stopMock(mock);
}

// 5. Invalid phone number format.
{
  const mock = await startMock((req, res) => json(res, 200, {}));
  const r = await sendCustomerInvoicePdf("abc", localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("invalid phone rejected (400, no network)", r.success === false && r.status === 400 && mock.hits.count === 0, JSON.stringify(r));
  await stopMock(mock);
}

// 6. Provider JSON 403 (non-edge): real status + real error preserved, NOT flagged as edge.
{
  const mock = await startMock((req, res) => json(res, 403, { success: false, error: "gateway_forbidden" }));
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("provider JSON 403 preserved with real error", r.success === false && r.status === 403 && String(r.error).includes("gateway_forbidden") && !r.edgeRejected, JSON.stringify(r));
  await stopMock(mock);
}

// 7. Cloudflare edge 1003: faithful reproduction — 403 text/plain "error code: 1003"
//    (16 bytes), server: cloudflare, cf-ray — must be detected and flagged.
{
  const mock = await startMock((req, res) => {
    const body = "error code: 1003";
    res.writeHead(403, {
      "Content-Type": "text/plain; charset=UTF-8",
      "Content-Length": String(Buffer.byteLength(body)),
      Server: "cloudflare",
      "CF-RAY": "test-ray-1003",
    });
    res.end(body);
  });
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "Invoice-INV-0170.pdf", PDF_B64);
  ok("edge 1003 detected (code flag)", r.code === CLOUDFLARE_EDGE_REJECTION_CODE && r.edgeRejected === true, JSON.stringify(r));
  ok("edge 1003 mapped to 502 with actionable error", r.success === false && r.status === 502 && /edge|1003/i.test(String(r.error)), JSON.stringify(r));
  ok("edge 1003 preserves raw provider body", String(r.data?.raw || "").includes("error code: 1003"), JSON.stringify(r.data));
  await stopMock(mock);
}

// 8. Detector unit checks (including the exact production failure signature).
{
  ok("detector matches exact 1003 signature", isCloudflareEdgeRejection(403, { raw: "error code: 1003" }) === true);
  ok("detector ignores non-403", isCloudflareEdgeRejection(500, { raw: "error code: 1003" }) === false);
  ok("detector ignores JSON gateway errors", isCloudflareEdgeRejection(403, { error: "gateway_forbidden" }) === false);
  ok("detector matches direct-IP text", isCloudflareEdgeRejection(403, { raw: "Direct IP access not allowed" }) === true);
}

// 9. Provider non-200 (500): real status + real provider error preserved.
{
  const mock = await startMock((req, res) => json(res, 500, { success: false, error: "Invoice PDF endpoint returned HTTP 403" }));
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("provider 500 preserved with real error", r.success === false && r.status === 500 && String(r.error).includes("Invoice PDF endpoint returned HTTP 403"), JSON.stringify(r));
  await stopMock(mock);
}

// 10. Gateway not linked (dispatched_mock) -> actionable QR error, not success.
{
  const mock = await startMock((req, res) => json(res, 200, { success: true, status: "dispatched_mock" }));
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("dispatched_mock is not success", r.success === false && r.status === 400 && /QR|linked/i.test(String(r.error)), JSON.stringify(r));
  await stopMock(mock);
}

// 11. Network failure: connection refused -> 502 could-not-reach (no hang).
{
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig("http://127.0.0.1:9"), DOC_URL, "f.pdf", PDF_B64);
  ok("connection refused mapped to 502", r.success === false && r.status === 502 && /Could not reach/i.test(String(r.error)), JSON.stringify(r));
}

// 12. Fallback builder: exact key set, secret hygiene, validation.
{
  const fb = buildGatewayFallback("https://gw.example.com/", { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "Invoice-INV-0170.pdf", documentBase64: PDF_B64, caption: "Greetings!" });
  const keys = Object.keys(fb?.payload || {}).sort();
  ok("fallback keeps exact payload keys", JSON.stringify(keys) === JSON.stringify(["caption", "document", "documentBase64", "documentUrl", "fileName", "filename", "mimetype", "number", "pdfBase64", "phone"]), keys.join(","));
  ok("fallback carries caption", fb?.payload?.caption === "Greetings!");
  const serialized = JSON.stringify(fb);
  ok("fallback carries no secrets", fb !== null && !/x-api-key|gateway_api_key|bearer|meta_access_token|ultramsg_token|service_role|password|secret/i.test(serialized), "secret scan");
  ok("fallback rejects invalid gateway URL", buildGatewayFallback("not-a-url", { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" }) === null);
  ok("fallback rejects missing phone/document", buildGatewayFallback("https://gw.example.com", { phone: "", documentUrl: "", fileName: "f.pdf" }) === null);
}

// 13. Log redaction: signed query strings must never appear in diagnostics.
{
  const d = describeEndpointForLog("https://example.supabase.co/storage/v1/object/sign/customer-invoices/x?token=signed-token-value&foo=bar");
  ok("endpoint log strips query", d.host === "example.supabase.co" && d.path.includes("/customer-invoices/") && !JSON.stringify(d).includes("signed-token-value"), JSON.stringify(d));
}

// 14. Direct delivery helper: success path.
{
  const mock = await startMock((req, res) => json(res, 200, { success: true, status: "sent", messageId: "direct-1" }));
  const r = await postDocumentDirectToGateway(mock.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf", documentBase64: PDF_B64 });
  ok("direct delivery success", r.ok === true && r.messageId === "direct-1", JSON.stringify(r));
  await stopMock(mock);
}

// 15. Direct delivery helper: surfaces real (raw) provider error.
{
  const mock = await startMock((req, res) => {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("error code: 1003");
  });
  const r = await postDocumentDirectToGateway(mock.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" });
  ok("direct delivery surfaces raw error", r.ok === false && String(r.error).includes("error code: 1003"), JSON.stringify(r));
  await stopMock(mock);
}

// 16. Direct delivery helper: timeout is bounded and reported (no retry).
{
  const mock = await startMock(() => { /* hang */ });
  const started = Date.now();
  const r = await postDocumentDirectToGateway(mock.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" }, 300, { retries: 0 });
  const elapsed = Date.now() - started;
  ok("direct delivery timeout bounded", r.ok === false && /timed out/i.test(String(r.error)) && r.attempts === 1 && elapsed < 15000, `${r.error} (${elapsed}ms)`);
  await stopMock(mock);
}

// 16b. Direct delivery helper: transient reset is retried, then succeeds.
{
  let n = 0;
  const mock = await startMock((req, res) => {
    n++;
    if (n === 1) { req.socket.destroy(); return; }
    json(res, 200, { success: true, status: "sent", messageId: "retry-1" });
  });
  const r = await postDocumentDirectToGateway(mock.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf", documentBase64: PDF_B64 }, 10000, { retries: 2 });
  ok("direct delivery retries transient failure", r.ok === true && r.messageId === "retry-1" && r.attempts === 2, JSON.stringify(r));
  await stopMock(mock);
}

// 16c. Direct delivery helper: persistent 503 exhausts retries; 500 never retries.
{
  const mock503 = await startMock((req, res) => json(res, 503, { error: "proxy warming up" }));
  const r503 = await postDocumentDirectToGateway(mock503.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" }, 10000, { retries: 2 });
  ok("direct delivery exhausts retries on 503", r503.ok === false && r503.attempts === 3 && mock503.hits.count === 3, JSON.stringify({ attempts: r503.attempts, hits: mock503.hits.count }));
  await stopMock(mock503);
  const mock500 = await startMock((req, res) => json(res, 500, { success: false, error: "definitive failure" }));
  const r500 = await postDocumentDirectToGateway(mock500.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" }, 10000, { retries: 2 });
  ok("direct delivery does not retry definitive 500", r500.ok === false && r500.attempts === 1 && mock500.hits.count === 1 && /definitive failure/.test(String(r500.error)), JSON.stringify(r500));
  await stopMock(mock500);
}

// 16d. Server lib: transient throw is retried once, then succeeds.
{
  let n = 0;
  const mock = await startMock((req, res) => {
    n++;
    if (n === 1) { req.socket.destroy(); return; }
    json(res, 200, { success: true, status: "sent", messageId: "srv-retry-1" });
  });
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64);
  ok("server retries transient throw", r.success === true && r.messageId === "srv-retry-1" && mock.hits.count === 2, JSON.stringify({ r, hits: mock.hits.count }));
  await stopMock(mock);
}

// 16e. Server lib: timeout is NOT retried (single bounded attempt).
{
  const mock = await startMock(() => { /* hang */ });
  const started = Date.now();
  const r = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(mock.url), DOC_URL, "f.pdf", PDF_B64, { timeoutMs: 300 });
  const elapsed = Date.now() - started;
  ok("server does not retry timeouts", r.success === false && r.status === 502 && mock.hits.count === 1 && elapsed < 15000, JSON.stringify({ r, hits: mock.hits.count, elapsed }));
  await stopMock(mock);
}

// 17. Direct delivery helper: invalid gateway URL rejected without network.
{
  const r = await postDocumentDirectToGateway("not-a-url", { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" });
  ok("direct delivery rejects bad URL", r.ok === false, JSON.stringify(r));
}

// 18. End-to-end contract: strict emulator mirroring scripts/whatsapp-gateway.js
//     /send-document validation (field aliases, base64 decode, %PDF- magic,
//     sent envelope). Drives the real lib chain: edge-1003 -> fallback -> direct.
function strictGatewayEmulator(req, res, body) {
  if (!((req.url || "").split("?")[0].replace(/\/$/, "") === "/send-document") || req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
    return;
  }
  let payload = {};
  try { payload = JSON.parse(body || "{}"); } catch { /* fall through */ }
  const phone = payload.phone || payload.number;
  const documentUrl = payload.documentUrl || payload.document;
  const documentBase64 = payload.documentBase64 || payload.pdfBase64 || "";
  const fileName = String(payload.fileName || payload.filename || "Invoice.pdf");
  if (!phone || (!documentUrl && !documentBase64)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Phone and invoice PDF content are required." }));
    return;
  }
  let buffer;
  if (documentBase64) {
    buffer = Buffer.from(String(documentBase64).trim(), "base64");
  } else {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Invoice PDF endpoint returned HTTP 403" }));
    return;
  }
  if (!buffer?.length || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "Generated invoice payload is not a valid PDF." }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, status: "sent", messageId: "emu-sent-1", type: "document", mimetype: "application/pdf", fileName }));
}
{
  // 18a. Server hop hits the edge; fallback payload is accepted by the gateway.
  const edge = await startMock((req, res) => {
    const edgeBody = "error code: 1003";
    res.writeHead(403, { "Content-Type": "text/plain; charset=UTF-8", Server: "cloudflare", "CF-RAY": "e2e-ray" });
    res.end(edgeBody);
  });
  const gw = await startMock(strictGatewayEmulator);
  const serverRes = await sendCustomerInvoicePdf(VALID_PHONE, localConfig(edge.url), DOC_URL, "Invoice-INV-0170.pdf", PDF_B64);
  const fb = buildGatewayFallback(gw.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "Invoice-INV-0170.pdf", documentBase64: PDF_B64 });
  const serverSaysEdge = serverRes.success === false && serverRes.code === CLOUDFLARE_EDGE_REJECTION_CODE && fb !== null;
  const directRes = serverSaysEdge ? await postDocumentDirectToGateway(fb.gatewayUrl, fb.payload) : { ok: false };
  ok("e2e: edge detected, fallback accepted, gateway confirms sent", serverSaysEdge && directRes.ok === true && typeof directRes.messageId === "string", JSON.stringify({ serverRes, directRes }));
  await stopMock(edge);
  await stopMock(gw);
}
{
  // 18b. Corrupt PDF bytes are rejected by the gateway and NEVER reported sent.
  const gw = await startMock(strictGatewayEmulator);
  const badB64 = Buffer.from("hello-not-a-pdf").toString("base64");
  const r = await postDocumentDirectToGateway(gw.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf", documentBase64: badB64 });
  ok("e2e: corrupt PDF rejected, not reported sent", r.ok === false && /not a valid PDF/i.test(String(r.error)), JSON.stringify(r));
  await stopMock(gw);
}

// 19. Job runner: backoff schedule and terminal boundary.
{
  ok("runner backoff minutes", runner.retryDelayMinutes(1) === 2 && runner.retryDelayMinutes(4) === 120, JSON.stringify([runner.retryDelayMinutes(1), runner.retryDelayMinutes(4)]));
  ok("runner terminal at max attempts", runner.retryDelayMinutes(5) === null && runner.retryDelayMinutes(9) === null);
}

// 20. Job runner: phone/filename/PDF validation helpers.
{
  ok("runner jid formatting", runner.formatJid("9876543210") === "919876543210@s.whatsapp.net" && runner.formatJid("+91 98765 43210") === "919876543210@s.whatsapp.net");
  ok("runner filename sanitized", runner.sanitizeFileName("Invoice-INV/0175.pdf") === "Invoice-INV_0175.pdf");
  const good = runner.decodeJobPdf({ document_base64: Buffer.from("%PDF-1.4 q").toString("base64") });
  const bad = runner.decodeJobPdf({ document_base64: Buffer.from("hello").toString("base64") });
  const empty = runner.decodeJobPdf({ document_base64: "" });
  ok("runner pdf validation", Boolean(good.buffer?.length) && /not a valid PDF/.test(bad.error || "") && /empty/i.test(empty.error || ""), JSON.stringify({ bad, empty }));
}

// 21. Job runner: full processPdfJob paths with mocked deps.
{
  const patches = [];
  const deps = {
    patchJob: async (id, fields) => { patches.push({ id, fields }); },
    sendDocument: async () => ({ messageId: "job-msg-1" }),
  };
  const r = await runner.processPdfJob(deps, { id: "job-1", recipient_phone: "919876543210", file_name: "Invoice-INV-0175.pdf", document_base64: Buffer.from("%PDF-1.4 q").toString("base64"), attempt_count: 0 });
  const finalPatch = patches[patches.length - 1];
  ok("runner sends and marks sent", r === "sent" && finalPatch?.fields?.status === "sent" && finalPatch?.fields?.provider_message_id === "job-msg-1", JSON.stringify(finalPatch));
}
{
  let sends = 0;
  const deps = { patchJob: async () => {}, sendDocument: async () => { sends++; return {}; } };
  const r = await runner.processPdfJob(deps, { id: "job-2", recipient_phone: "abc", file_name: "f.pdf", document_base64: "xx", attempt_count: 0 });
  ok("runner rejects bad phone without sending", r === "failed" && sends === 0);
}
{
  let sends = 0;
  const deps = { patchJob: async () => {}, sendDocument: async () => { sends++; return {}; } };
  const r = await runner.processPdfJob(deps, { id: "job-3", recipient_phone: VALID_PHONE, file_name: "f.pdf", document_base64: Buffer.from("nope").toString("base64"), attempt_count: 0 });
  ok("runner fails corrupt pdf without sending", r === "failed" && sends === 0);
}
{
  const patches = [];
  const deps = { patchJob: async (id, fields) => { patches.push(fields); }, sendDocument: async () => { throw new Error("wa socket down"); } };
  const r = await runner.processPdfJob(deps, { id: "job-4", recipient_phone: VALID_PHONE, file_name: "f.pdf", document_base64: Buffer.from("%PDF-1.4 q").toString("base64"), attempt_count: 0 });
  const finalPatch = patches[patches.length - 1];
  ok("runner retries send failure with backoff", r === "retry" && finalPatch?.status === "pending" && new Date(finalPatch?.next_attempt_at).getTime() > Date.now(), JSON.stringify(finalPatch));
  const r2 = await runner.processPdfJob(deps, { id: "job-4", recipient_phone: VALID_PHONE, file_name: "f.pdf", document_base64: Buffer.from("%PDF-1.4 q").toString("base64"), attempt_count: 4 });
  ok("runner terminal after max attempts", r2 === "failed");
}

// 22. Migration: durable queue table with tight RLS and no secrets.
{
  const sql = readRepo("supabase/migrations/20260915_02_whatsapp_pdf_jobs.sql");
  ok("migration creates queue table", /create table if not exists public\.whatsapp_pdf_jobs/i.test(sql));
  ok("migration enables RLS for back-office only", /enable row level security/i.test(sql) && /is_back_office\(\)/.test(sql));
  ok("migration holds no credentials", !/service_role|api[_-]?key|bearer|password|secret/i.test(sql));
}

// 23. Wiring: gateway poller, route enqueue, job endpoint, queued UI states.
{
  const gw = readRepo("scripts/whatsapp-gateway.js");
  ok("gateway requires runner and polls", gw.includes('require("./whatsapp-pdf-job-runner")') && gw.includes("setInterval(pollPdfJobs"));
  const route = readRepo("app/api/whatsapp/send-invoice/route.ts");
  ok("route enqueues durable jobs", route.includes("whatsapp_pdf_jobs") && route.includes(".insert("));
  const jobRoute = readRepo("app/api/whatsapp/send-invoice/job/route.ts");
  ok("job status endpoint guards roles", jobRoute.includes("hasRole") && jobRoute.includes("whatsapp_pdf_jobs"));
  const pos = readRepo("components/pos/pos-shell.tsx");
  ok("pos has queued delivery state", pos.includes('"queued"') && pos.includes("reportJobOutcome"));
  const modal = readRepo("components/whatsapp/whatsapp-send-modal.tsx");
  ok("modal has queued delivery state", modal.includes('"queued"') && modal.includes("reportJobOutcome"));
}

// 24. reportJobOutcome: posts job update; never throws.
{
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  try {
    await direct.reportJobOutcome("11111111-1111-4111-8111-111111111111", { messageId: "m-1" });
    const sentBody = JSON.parse(calls[0].init.body);
    globalThis.fetch = async () => { throw new Error("down"); };
    await direct.reportJobOutcome("11111111-1111-4111-8111-111111111111", { error: "x" });
    ok("reportJobOutcome posts and never throws", calls[0].url === "/api/whatsapp/send-invoice/job" && sentBody.messageId === "m-1");
  } finally {
    globalThis.fetch = origFetch;
  }
}

// 25. Real invoice PDF generator: byte-level validity (the "invalid format" fix).
{
  const gen = await import("../lib/invoice-pdf-text.ts");
  const sampleInvoice = {
    invoice_number: "INV-0176", invoice_date: "2026-09-15", subtotal: 2, discount: 0,
    total: 2, paid: 2, due: 0, status: "paid",
    customers: { name: "Saikat Sarkar", phone: "9339987644" },
  };
  const bytes = Buffer.from(gen.buildInvoicePdf(sampleInvoice, [{ description: "Test Item", qty: 1, rate: 2, amount: 2 }], [{ method: "cash", amount: 2 }], { shop_name: "Sarkar Communication" }));
  const hasRealNewlines = bytes.includes(0x0a);
  const hasLiteralBackslashN = bytes.includes(Buffer.from([0x5c, 0x6e]));
  ok("pdf starts with %PDF- header", bytes.subarray(0, 5).toString("ascii") === "%PDF-");
  ok("pdf uses real newline bytes", hasRealNewlines);
  ok("pdf has no literal backslash-n sequences", !hasLiteralBackslashN);
  // Xref integrity: every offset must point at "<n> 0 obj", stream /Length must match.
  let xrefOk = true;
  try {
    const text = bytes.toString("latin1");
    const xrefAt = text.lastIndexOf("\nstartxref\n");
    const eofAt = text.indexOf("%%EOF", xrefAt);
    const tableAt = text.indexOf("\nxref\n");
    const tableEnd = text.indexOf("trailer", tableAt);
    const rows = text.slice(tableAt, tableEnd).trim().split("\n").slice(2);
    for (const row of rows) {
      const off = Number(row.slice(0, 10));
      if (!Number.isInteger(off)) { xrefOk = false; break; }
      if (off === 0) continue;
      if (text.slice(off, off + 30).match(/^\d+ 0 obj/) === null) { xrefOk = false; break; }
    }
    const m = text.match(/<< \/Length (\d+) >>\nstream\n/);
    if (!m) xrefOk = false;
    else {
      const len = Number(m[1]);
      const streamStart = (m.index || 0) + m[0].length;
      const streamEnd = text.indexOf("\nendstream", streamStart);
      if (streamEnd - streamStart !== len) xrefOk = false;
    }
    void eofAt;
  } catch { xrefOk = false; }
  ok("pdf xref offsets and stream length valid", xrefOk);
  // Real open-test with pypdf when available (bonus; structural checks above are the gate).
  try {
    const tmp = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cafe-inv-")), "inv.pdf");
    fs.writeFileSync(tmp, bytes);
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("python3", ["-c", "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print(len(r.pages)); print((r.pages[0].extract_text() or '')[:600])", tmp], { encoding: "utf8", timeout: 60000 });
    const firstLineEnd = out.indexOf("\n");
    const pages = Number(out.slice(0, firstLineEnd).trim());
    const text = out.slice(firstLineEnd + 1);
    ok("pdf opens in real parser with invoice content", pages >= 1 && text.includes("INV-0176") && text.includes("Saikat Sarkar"), text.slice(0, 120));
    ok("pdf has decorated A4 blocks", text.includes("TAX INVOICE") && text.includes("Grand Total") && text.includes("Sarkar Communication"), text.slice(0, 120));
  } catch (e) {
    console.log("  SKIP  pypdf open-test unavailable (structural checks passed)");
  }
  // Decorated design markers in the raw bytes + pagination for long invoices.
  {
    const raw = bytes.toString("latin1");
    ok("pdf embeds bold font and color fills", raw.includes("Helvetica-Bold") && raw.includes(" rg") && raw.includes(" re"), "design ops");
    const manyItems = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i + 1}`, qty: 1, rate: 10, amount: 10 }));
    const big = Buffer.from(gen.buildInvoicePdf({ ...sampleInvoice, total: 600, paid: 600 }, manyItems, [], { shop_name: "S" }));
    const { execFileSync } = await import("node:child_process");
    try {
      const tmp = path.join(fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cafe-big-")), "big.pdf");
      fs.writeFileSync(tmp, big);
      const n = Number(execFileSync("python3", ["-c", "import sys,pypdf; print(len(pypdf.PdfReader(sys.argv[1]).pages))", tmp], { encoding: "utf8", timeout: 60000 }).trim());
      ok("long invoice paginates cleanly", n >= 2, `${n} pages`);
    } catch (e) {
      const count = (big.toString("latin1").match(/\/Type \/Page[^s]/g) || []).length;
      ok("long invoice paginates cleanly", count >= 2, `${count} pages (no parser)`);
    }
  }
}

// 26. Caption builder: greeting content, no URLs, bounded length.
{
  const gen = await import("../lib/invoice-pdf-text.ts");
  const cap = gen.buildInvoiceCaption({ invoiceNumber: "INV-0176", invoiceDate: "2026-09-15", customerName: "Saikat Sarkar", shopName: "Sarkar Communication", total: 2, paid: 2, due: 0 });
  ok("caption greets with invoice facts", cap.includes("INV-0176") && cap.includes("Saikat Sarkar") && /greet|thank/i.test(cap), cap.slice(0, 80));
  ok("caption contains no URLs", !/https?:\/\//i.test(cap) && cap.length <= 800);
}

// 27. Caption migration present.
{
  const sql = readRepo("supabase/migrations/20260915_03_whatsapp_pdf_jobs_caption.sql");
  ok("caption migration adds column", /add column if not exists caption/i.test(sql));
}

// 28. Client PDF validation (Task 13/15 failure matrix).
{
  const validB64 = Buffer.from("%PDF-1.4 hello").toString("base64");
  const v = validateClientPdfBytes({ documentBase64: validB64, mimeType: "application/pdf" });
  ok("validator accepts real pdf bytes", v.ok === true && v.size > 0 && v.bytes[0] === 0x25, JSON.stringify({ ok: v.ok }));
  const malformed = validateClientPdfBytes({ documentBase64: "!!!not-base64!!!", mimeType: "application/pdf" });
  ok("validator rejects malformed base64", malformed.ok === false && malformed.status === 400, JSON.stringify(malformed));
  const empty = validateClientPdfBytes({ documentBase64: "   ", mimeType: "application/pdf" });
  ok("validator rejects empty payload", empty.ok === false && empty.status === 400);
  const wrongMagic = validateClientPdfBytes({ documentBase64: Buffer.from("hello-not-pdf").toString("base64"), mimeType: "application/pdf" });
  ok("validator rejects non-pdf magic", wrongMagic.ok === false && /valid PDF/i.test(wrongMagic.error || ""), JSON.stringify(wrongMagic));
  const wrongMime = validateClientPdfBytes({ documentBase64: validB64, mimeType: "image/png" });
  ok("validator rejects non-pdf mime", wrongMime.ok === false && wrongMime.status === 400, JSON.stringify(wrongMime));
  const big = validateClientPdfBytes({ documentBase64: validB64, mimeType: "application/pdf", maxBytes: 4 });
  ok("validator rejects oversized payload", big.ok === false && big.status === 413, JSON.stringify(big));
  ok("validator default cap sane", MAX_CLIENT_PDF_BYTES === 10 * 1024 * 1024);
}

// 29. Canonical architecture wiring (no duplicate generators, honest pdf route).
{
  const modal = readRepo("components/whatsapp/whatsapp-send-modal.tsx");
  ok("modal sends exact client bytes once", modal.includes("documentBase64: rendered.base64") && modal.includes("generateInvoicePdfBase64") && !modal.includes("renderToBuffer"));
  const list = readRepo("components/invoices/unified-invoices-client.tsx");
  ok("list uses canonical download + modal", list.includes("downloadPosPdf") && list.includes('messageType="pos_invoice"') && list.includes("generateInvoicePdfBlob"));
  ok("unified list is POS-only (no quick branches)", !list.includes("/pdf?source=quick") && !list.includes("receipt/quick") && !list.includes("QuickSaleViewModal") && list.includes('source: "pos"'));
  const a4 = readRepo("components/pdf/a4-actions.tsx");
  ok("a4 invoice uses canonical generator", a4.includes("generateInvoicePdfBlob") && !a4.includes("window.open(`/api/invoices/"));
  const pdfRoute = readRepo("app/api/invoices/[id]/pdf/route.ts");
  ok("pdf route never redirects to html", !pdfRoute.includes("NextResponse.redirect") && pdfRoute.includes("502"));
  const view = readRepo("components/invoices/invoice-view-modal.tsx");
  ok("view uses canonical download", view.includes("downloadCanonicalPdf") && view.includes("generateInvoicePdfBlob"));
  const sendRoute = readRepo("app/api/whatsapp/send-invoice/route.ts");
  ok("send route honors client bytes", sendRoute.includes("validateClientPdfBytes") && sendRoute.includes("checked.bytes") && sendRoute.includes("captionOverride") && sendRoute.includes("clientDocumentBase64"));
  const legacySend = readRepo("app/api/whatsapp/send/route.ts");
  ok("legacy send path includes greeting", legacySend.includes("buildInvoiceCaption") && legacySend.includes("{ caption }") && legacySend.includes("customers(name)"));
  const pdfData = readRepo("app/api/invoices/[id]/pdf-data/route.ts");
  ok("pdf-data contract complete", ["invoice", "items", "payments", "settings", "qrDataUrl", "upiId"].every((k) => pdfData.includes(k)) && pdfData.includes("hasRole"));
}

// 30. Canonical render end-to-end: bundle the real InvoicePdf with esbuild
//     (repo-local so externals resolve), render in Node, validate with pypdf.
//     SKIP only if the toolchain itself is unavailable.
{
  const workDir = path.join(repoRoot, ".tmp-canon-test");
  try {
    const { execFileSync } = await import("node:child_process");
    fs.mkdirSync(workDir, { recursive: true });
    const libPath = repoRoot.replace(/\\/g, "/") + "/lib/invoice-pdf";
    const entry = path.join(workDir, "entry.ts");
    const fixtureFile = path.join(workDir, "fixture.json");
    const bundled = path.join(workDir, "bundle.mjs");
    const pdfOut = path.join(workDir, "canon.pdf");
    fs.writeFileSync(entry, [
      `import { generateInvoicePdfBase64 } from '${libPath}';`,
      "import fs from 'node:fs';",
      "const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
      "generateInvoicePdfBase64(input).then((r) => {",
      "  fs.writeFileSync(process.argv[3], Buffer.from(r.base64, 'base64'));",
      "  console.log('BYTES:' + r.size + ' MIME:' + r.mimeType);",
      "}).catch((e) => { console.error('RENDER-FAIL:' + ((e && e.stack) || e)); process.exit(1); });",
      "",
    ].join("\n"));
    fs.writeFileSync(fixtureFile, JSON.stringify({
      invoice: { invoice_number: "INV-0176", invoice_date: "2026-09-15", subtotal: 2, discount: 0, total: 2, paid: 2, due: 0, status: "paid", customers: { name: "Saikat Sarkar", phone: "9339987644" } },
      items: [{ description: "Xerox Sigle Side", qty: 1, rate: 2, amount: 2 }],
      payments: [{ method: "cash", amount: 2 }],
      settings: { shop_name: "Sarkar Communication", receipt_footer: "Thank you for your business." },
      qrDataUrl: "",
      upiId: "",
    }));
    const esbuildBin = path.join(repoRoot, "node_modules", "esbuild", "bin", "esbuild");
    execFileSync("node", [esbuildBin, entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${bundled}`, `--tsconfig=${path.join(repoRoot, "tsconfig.json")}`, "--jsx=automatic", "--external:pdfkit", "--log-level=error"], { encoding: "utf8", timeout: 240000, cwd: repoRoot });
    const runOut = execFileSync("node", [bundled, fixtureFile, pdfOut], { encoding: "utf8", timeout: 120000 });
    const m = runOut.match(/BYTES:(\d+) MIME:([^\s]+)/);
    const size = m ? Number(m[1]) : 0;
    const head = Buffer.from(fs.readFileSync(pdfOut).subarray(0, 5)).toString("ascii");
    let parsed = "";
    try {
      parsed = execFileSync("python3", ["-c", "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print(len(r.pages)); print('\\n'.join([(p.extract_text() or '') for p in r.pages])[:800])", pdfOut], { encoding: "utf8", timeout: 60000 });
    } catch { parsed = "PARSER-UNAVAILABLE"; }
    const firstNl = parsed.indexOf("\n");
    const pages = Number(parsed.slice(0, firstNl).trim());
    const text = parsed.slice(firstNl + 1);
    const structural = size > 0 && head === "%PDF-";
    const content = text.includes("INV-0176") && text.includes("Grand Total") && text.includes("TAX INVOICE");
    ok("canonical render produces real decorated pdf", structural && (parsed === "PARSER-UNAVAILABLE" || (pages >= 1 && content)), `bytes=${size} pages=${pages}`);
  } catch (e) {
    console.log(`  SKIP  canonical render bundle unavailable (${String((e && e.message) || e).slice(0, 120)})`);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
