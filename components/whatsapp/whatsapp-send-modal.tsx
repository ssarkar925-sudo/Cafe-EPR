"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import {
  getDirectWhatsAppUrl,
  getWhatsAppConfig,
  sendWhatsAppMessage,
  type WhatsAppLogEntry,
} from "@/lib/whatsapp";

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
  const config = getWhatsAppConfig();

  // These state resets intentionally synchronize editable modal fields with the
  // caller's selected recipient/message whenever the modal target changes.
  // The rule is disabled only for this synchronization effect.
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
    if (!phone.trim() || !message.trim()) {
      setErrorMsg("Phone number and message text cannot be empty.");
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorMsg("");

    const res = await sendWhatsAppMessage({
      phone: phone.trim(),
      message: message.trim(),
      recipientName: recipientName || null,
      messageType,
      refId: refId || null,
      refNumber: refNumber || null,
    });

    if (res.ok) {
      setStatus("success");
      if (onSent) onSent();
      setTimeout(() => {
        onClose();
      }, 1400);
    } else {
      setStatus("error");
      setErrorMsg(res.error || "Failed to dispatch via gateway.");
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
      title="Send WhatsApp Message"
      subtitle={recipientName ? `Recipient: ${recipientName}` : undefined}
      accent="emerald"
      size="lg"
    >
      <div className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Recipient Mobile Number
          </label>
          <div className="flex items-center gap-2">
            <span className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
              🇮🇳 +91
            </span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Message Content (Editable)
            </label>
            <span className="text-[11px] text-slate-400 font-mono">
              {message.length} chars
            </span>
          </div>
          <textarea
            rows={9}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
            placeholder="Type or customize your WhatsApp message..."
          />
          <p className="mt-1 text-[11px] text-slate-400">
            💡 Markdown formatting supported: <strong>*bold*</strong>, <em>_italic_</em>, ~strike~, `code`.
          </p>
        </div>

        {status === "success" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
            ✓ Message sent successfully and logged to History Tracker!
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
            <span className="font-bold">Dispatch Error: </span>
            {errorMsg}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={handleOpenDirectWhatsApp}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-600">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
            Open in WhatsApp App / Web (wa.me) ↗
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={status === "sending" || !phone.trim()}
              onClick={handleSend}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
              {status === "sending" ? "Sending..." : "Send Message Now"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
