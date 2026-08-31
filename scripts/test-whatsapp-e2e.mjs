const base = process.env.WHATSAPP_GATEWAY_URL || "http://localhost:3001";
const to = process.env.WHATSAPP_TEST_TO;
const message = process.env.WHATSAPP_TEST_MESSAGE || `Cafe ERP WhatsApp E2E test ${new Date().toISOString()}`;

const fail = (msg) => { console.error(`❌ ${msg}`); process.exitCode = 1; };

try {
  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(10000) });
  if (!health.ok) throw new Error(`Gateway health returned HTTP ${health.status}`);
  const state = await health.json();
  console.log(`Gateway: ${state.status}`);
  if (!state.connected) throw new Error("WhatsApp gateway is reachable but not connected; QR login is required before delivery testing.");

  if (!to) throw new Error("Set WHATSAPP_TEST_TO to an explicit test number before running the delivery test.");

  const res = await fetch(`${base}/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: to, message }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.error || `Send returned HTTP ${res.status}`);
  console.log(`✅ WhatsApp E2E delivery accepted. Message ID: ${body.messageId || "n/a"}`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
