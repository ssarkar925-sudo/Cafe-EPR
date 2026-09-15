/**
 * Pure WhatsApp PDF job logic shared by the gateway poller and the test suite.
 *
 * Dependency-free CommonJS: `scripts/whatsapp-gateway.js` requires it for the
 * live Supabase pull loop, and `scripts/test-whatsapp-document.mjs` requires
 * it with mocked fetch/socket dependencies. No secrets live here — callers
 * supply credentials and transport.
 */

const MAX_JOB_BYTES = 15 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
// Backoff after attempts 1..4 (minutes). Attempt 5 failure is terminal.
const RETRY_BACKOFF_MINUTES = [2, 10, 30, 120];

function retryDelayMinutes(attemptCount) {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  return RETRY_BACKOFF_MINUTES[Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1)];
}

function formatJid(rawPhone) {
  let clean = String(rawPhone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = "91" + clean;
  return `${clean}@s.whatsapp.net`;
}

function sanitizeFileName(raw) {
  return String(raw || "Invoice.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "Invoice.pdf";
}

/** Decode + validate the queued PDF bytes. Returns {buffer} or {error}. */
function decodeJobPdf(job) {
  try {
    const encoded = String(job.document_base64 || "").trim().replace(/^data:application\/pdf;base64,/i, "");
    if (!encoded) return { error: "Invoice PDF payload is empty." };
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length) return { error: "Invoice PDF is empty." };
    if (buffer.length > MAX_JOB_BYTES) return { error: "Invoice PDF exceeds 15 MB." };
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") return { error: "Queued invoice payload is not a valid PDF." };
    return { buffer };
  } catch (err) {
    return { error: `Unable to decode queued invoice PDF: ${err?.message || "invalid payload"}` };
  }
}

/**
 * Process one queued job.
 * deps: { patchJob(id, fields) -> Promise, sendDocument(jid, buffer, fileName) -> Promise<{messageId}> }
 * Returns "sent" | "retry" | "failed".
 */
async function processPdfJob(deps, job) {
  if (!job || !job.id) return "failed";
  const attempt = Number(job.attempt_count || 0) + 1;

  const phoneDigits = String(job.recipient_phone || "").replace(/\D/g, "");
  if (phoneDigits.length < 10) {
    await deps.patchJob(job.id, {
      status: "failed",
      attempt_count: attempt,
      error_message: "Invalid recipient phone number.",
    });
    return "failed";
  }

  const decoded = decodeJobPdf(job);
  if (decoded.error) {
    const terminal = true; // corrupt payloads never heal; do not loop forever
    await deps.patchJob(job.id, {
      status: terminal ? "failed" : "pending",
      attempt_count: attempt,
      error_message: decoded.error,
    });
    return terminal ? "failed" : "retry";
  }

  await deps.patchJob(job.id, { status: "processing", attempt_count: attempt }).catch(() => {});

  try {
    const sent = await deps.sendDocument(formatJid(job.recipient_phone), decoded.buffer, sanitizeFileName(job.file_name));
    await deps.patchJob(job.id, {
      status: "sent",
      provider_message_id: (sent && sent.messageId) || null,
      error_message: null,
      sent_at: new Date().toISOString(),
    });
    return "sent";
  } catch (err) {
    const message = String(err?.message || "Gateway send failed").slice(0, 300);
    const delay = retryDelayMinutes(attempt);
    if (delay === null) {
      await deps.patchJob(job.id, { status: "failed", error_message: message });
      return "failed";
    }
    await deps.patchJob(job.id, {
      status: "pending",
      error_message: message,
      next_attempt_at: new Date(Date.now() + delay * 60 * 1000).toISOString(),
    });
    return "retry";
  }
}

module.exports = {
  MAX_JOB_BYTES,
  MAX_ATTEMPTS,
  retryDelayMinutes,
  formatJid,
  sanitizeFileName,
  decodeJobPdf,
  processPdfJob,
};
