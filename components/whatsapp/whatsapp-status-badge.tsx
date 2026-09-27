"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkGatewayHealth, getWhatsAppConfig, type WhatsAppConfig } from "@/lib/whatsapp";

export default function WhatsAppStatusBadge() {
  const [status, setStatus] = useState<"connected" | "waiting_for_qr" | "offline" | "disabled" | "checking">("checking");
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const cfg: WhatsAppConfig = getWhatsAppConfig();
      if (cfg.provider === "off" && !cfg.gateway_url) {
        if (mounted) setStatus("disabled");
        return;
      }

      try {
        const targetUrl = cfg.gateway_url || "https://sccomm-whatsapp-gateway.onrender.com";
        const res = await checkGatewayHealth(targetUrl);
        if (!mounted) return;
        if (res.connected || res.status === "connected") {
          setStatus("connected");
          setPhone(res.phone || "7208");
        } else if (res.status === "waiting_for_qr") {
          setStatus("waiting_for_qr");
        } else {
          setStatus("offline");
        }
      } catch {
        if (mounted) setStatus("offline");
      }
    }

    check();
    const interval = setInterval(check, 45000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (status === "disabled") {
    return null;
  }

  const badgeConfig = {
    checking: {
      dotColor: "bg-slate-400",
      pingColor: "bg-slate-300",
      pillClass: "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
      label: "WA Checking…",
      title: "Checking WhatsApp Gateway status…",
    },
    connected: {
      dotColor: "bg-emerald-500",
      pingColor: "bg-emerald-400",
      pillClass: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100",
      label: phone ? `WA: ${phone.slice(-4)}` : "WA Live",
      title: `WhatsApp Gateway Connected & Live${phone ? ` (${phone})` : ""}. Click to manage.`,
    },
    waiting_for_qr: {
      dotColor: "bg-amber-500",
      pingColor: "bg-amber-400",
      pillClass: "border-amber-200/80 bg-amber-50/80 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 hover:bg-amber-100",
      label: "WA Scan QR",
      title: "WhatsApp Gateway needs QR scan authentication. Click to scan.",
    },
    offline: {
      dotColor: "bg-rose-500",
      pingColor: "bg-rose-400",
      pillClass: "border-rose-200/80 bg-rose-50/80 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100",
      label: "WA Offline",
      title: "WhatsApp Gateway is disconnected (Offline). Click to reconnect.",
    },
  }[status];

  return (
    <Link
      href="/business/whatsapp"
      title={badgeConfig.title}
      className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-2xs transition-all active:scale-95 ${badgeConfig.pillClass}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {status === "connected" || status === "waiting_for_qr" ? (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${badgeConfig.pingColor}`} />
        ) : status === "offline" ? (
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full opacity-75 bg-rose-400" />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${badgeConfig.dotColor}`} />
      </span>
      <span className="tracking-tight">{badgeConfig.label}</span>
    </Link>
  );
}
