"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";

export type UpiQrCodeProps = {
  upiId?: string | null;
  merchantName?: string | null;
  size?: number;
  amount?: number | string;
  note?: string;
  showActions?: boolean;
  onCopy?: () => void;
  className?: string;
};

export function buildUpiUri({
  upiId,
  merchantName,
  amount,
  note,
}: {
  upiId: string;
  merchantName?: string | null;
  amount?: number | string;
  note?: string;
}): string {
  const cleanUpi = upiId?.trim();
  if (!cleanUpi) return "";
  const params = new URLSearchParams();
  params.set("pa", cleanUpi);
  if (merchantName?.trim()) params.set("pn", merchantName.trim());
  if (amount && Number(amount) > 0) params.set("am", Number(amount).toFixed(2));
  if (note?.trim()) params.set("tn", note.trim());
  params.set("cu", "INR");
  return `upi://pay?${params.toString()}`;
}

export default function UpiQrCode({
  upiId,
  merchantName,
  size = 220,
  amount,
  note,
  showActions = true,
  onCopy,
  className = "",
}: UpiQrCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const cleanUpi = upiId?.trim() || "";
  const cleanName = merchantName?.trim() || "Merchant";
  const upiUri = cleanUpi ? buildUpiUri({ upiId: cleanUpi, merchantName: cleanName, amount, note }) : "";

  useEffect(() => {
    let active = true;

    async function generateCode() {
      if (!upiUri) {
        setQrDataUrl("");
        return;
      }
      setIsGenerating(true);
      try {
        // High resolution generation (size * 2) for ultra-crisp display and print scanning
        const url = await QRCode.toDataURL(upiUri, {
          width: Math.max(300, size * 2),
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
          errorCorrectionLevel: "M",
        });
        if (active) setQrDataUrl(url);
      } catch (err) {
        console.error("Failed to generate UPI QR code:", err);
        if (active) setQrDataUrl("");
      } finally {
        if (active) setIsGenerating(false);
      }
    }

    generateCode();

    return () => {
      active = false;
    };
  }, [upiUri, size]);

  const handleCopy = () => {
    if (!cleanUpi) return;
    navigator.clipboard.writeText(cleanUpi);
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const safeName = cleanName.replace(/[^a-zA-Z0-9]/g, "-");
    const safeUpi = cleanUpi.replace(/[^a-zA-Z0-9]/g, "-");
    const filename = `${safeName}-${safeUpi}.png`;

    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Fallback: If no UPI ID is configured, show configuration prompt with NO fake QR fallback
  if (!cleanUpi) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50/50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/20 ${className}`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
          ⚠️
        </div>
        <h4 className="mt-3 text-sm font-bold text-amber-900 dark:text-amber-200">
          No active merchant QR configured
        </h4>
        <p className="mt-1 max-w-xs text-xs text-amber-700/80 dark:text-amber-400/80">
          Please add and activate a valid Merchant UPI ID to generate live scannable QR codes.
        </p>
        <Link
          href="/business/merchant-qrs"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
        >
          <span>Go to Merchant QRs</span>
          <span>→</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      {/* QR Code Container with High-Contrast White Background & Crisp Border */}
      <div className="relative rounded-2xl border-2 border-indigo-100 bg-white p-3.5 shadow-md ring-1 ring-slate-100 dark:border-white/10 dark:ring-white/5">
        {isGenerating || !qrDataUrl ? (
          <div
            style={{ width: size, height: size }}
            className="flex items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400"
          >
            <span className="animate-pulse">Generating Scannable QR…</span>
          </div>
        ) : (
          <img
            src={qrDataUrl}
            alt={`UPI Payment QR for ${cleanName} (${cleanUpi})`}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            className="rounded-xl block object-contain"
          />
        )}
      </div>

      {/* Merchant Details */}
      <div className="mt-3 space-y-0.5">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">{cleanName}</h3>
        <p className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
          {cleanUpi}
        </p>
        <p className="text-[11px] text-slate-400">
          Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
        </p>
      </div>

      {/* Interactive Actions (Copy, Download) */}
      {showActions && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <span>{copied ? "✓ Copied!" : "📋 Copy UPI ID"}</span>
          </button>
          
          <button
            type="button"
            onClick={handleDownload}
            disabled={!qrDataUrl}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span>⬇️ Download QR</span>
          </button>
        </div>
      )}
    </div>
  );
}
