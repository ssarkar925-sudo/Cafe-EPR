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

register("./whatsapp-test-alias-hooks.mjs", import.meta.url);

const doc = await import("../lib/whatsapp-document.ts");
const direct = await import("../lib/whatsapp-direct-delivery.ts");

const {
  sendCustomerInvoicePdf,
  isCloudflareEdgeRejection,
  describeEndpointForLog,
  CLOUDFLARE_EDGE_REJECTION_CODE,
} = doc;
const { buildGatewayFallback, postDocumentDirectToGateway } = direct;

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
  const fb = buildGatewayFallback("https://gw.example.com/", { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "Invoice-INV-0170.pdf", documentBase64: PDF_B64 });
  const keys = Object.keys(fb?.payload || {}).sort();
  ok("fallback keeps exact payload keys", JSON.stringify(keys) === JSON.stringify(["document", "documentBase64", "documentUrl", "fileName", "filename", "mimetype", "number", "pdfBase64", "phone"]), keys.join(","));
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

// 16. Direct delivery helper: timeout is bounded and reported.
{
  const mock = await startMock(() => { /* hang */ });
  const started = Date.now();
  const r = await postDocumentDirectToGateway(mock.url, { phone: VALID_PHONE, documentUrl: DOC_URL, fileName: "f.pdf" }, 300);
  const elapsed = Date.now() - started;
  ok("direct delivery timeout bounded", r.ok === false && /timed out/i.test(String(r.error)) && elapsed < 15000, `${r.error} (${elapsed}ms)`);
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

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
