"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { getDirectWhatsAppUrl, sendWhatsAppMessage, type WhatsAppLogEntry } from "@/lib/whatsapp";

type Props = {
  open: boolean;
  onClose: () => void;
  phone: string;
  recipientName?: string;
  initialMessage: string;
  messageType?: WhatsAppLogEntry["message_type"];
  refId?: string;
  refNumber?: string;
  onSent?: () => void;
};

export default function WhatsAppSendModal({
  open,
  onClose,
  phone: initialPhone,
  recipientName,
  initialMessage,
  messageType = "custom",
  refId,
  refNumber,
  onSent,
}: Props) {
  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState(initialMessage);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const invoiceOnly = messageType === "pos_invoice" && Boolean(refId);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPhone(initialPhone);
    setMessage(initialMessage);
    setStatus("idle");
    setErrorMsg("");
  }, [open, initialPhone, initialMessage]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  async function handleSend() {
    if (!phone.trim()) {
      setErrorMsg("Recipient phone number is required.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    try {
      if (invoiceOnly) {
        const response = await fetch("/api/whatsapp/send-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceId: refId, phone: phone.trim() }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to send invoice PDF.");
        }
      } else {
        if (!message.trim()) throw new Error("Phone number and message text cannot be empty.");
        const res = await sendWhatsAppMessage({
          phone: phone.trim(),
          message: message.trim(),
          recipientName: recipientName || null,
          messageType,
          refId: refId || null,
          refNumber: refNumber || null,
        });
        if (!res.ok) throw new Error(res.error || "Failed to dispatch via gateway.");
      }

      setStatus("success");
      onSent?.();
      setTimeout(onClose, 1400);
    } catch (error) {
      setStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Failed to send WhatsApp message.");
    }
  }

  function handleOpenDirectWhatsApp() {
    const url = getDirectWhatsAppUrl(phone, message);
    window.open(url, "_blank", "noopener");
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      title={invoiceOnly ? "Send Invoice PDF via WhatsApp" : "Send WhatsApp Message"}
      subtitle={recipientName ? `Recipient: ${recipientName}` : undefined}
      accent="emerald"
      size="lg"
    >
      <div className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recipient Mobile Number</label>
          <div className="flex items-center gap-2">
            <span className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">🇮🇳 +91</span>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100" />
          </div>
        </div>

        {invoiceOnly ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl shadow-sm">📄</div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">Customer PDF Invoice</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">Invoice-{refNumber || refId}.pdf</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white">PDF ONLY</span>
            </div>
            <div className="mt-3 rounded-xl border border-emerald-200/80 bg-white/70 p-3 text-[11px] font-semibold leading-relaxed text-emerald-900 dark:border-emerald-900/30 dark:bg-slate-900/50 dark:text-emerald-200">Exactly one downloadable PDF invoice is sent to the customer. Receipt, A4/print controls, thermal documents, internal earnings, commissions and accounting details are not sent.</div>
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Message Content (Editable)</label>
              <span className="text-[11px] text-slate-400 font-mono">{message.length} chars</span>
            </div>
            <textarea rows={9} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200" placeholder="Type or customize your WhatsApp message..." />
            <p className="mt-1 text-[11px] text-slate-400">💡 Markdown formatting supported: <strong>*bold*</strong>, <em>_italic_</em>, ~strike~, `code`.</p>
          </div>
        )}

        {status === "success" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{invoiceOnly ? "✓ PDF invoice sent successfully." : "✓ Message sent successfully and logged to History Tracker!"}</div>}
        {status === "error" && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"><span className="font-bold">Dispatch Error: </span>{errorMsg}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
          {!invoiceOnly && <button type="button" onClick={handleOpenDirectWhatsApp} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">Open in WhatsApp App / Web (wa.me) ↗</button>}
          {invoiceOnly && <span className="text-[10px] font-bold text-slate-400">Customer delivery is locked to PDF invoice.</span>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300">Cancel</button>
            <button type="button" disabled={status === "sending" || !phone.trim() || (!invoiceOnly && !message.trim())} onClick={handleSend} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50">
              {status === "sending" ? "Sending…" : invoiceOnly ? "Send PDF Invoice" : "Send Message Now"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
