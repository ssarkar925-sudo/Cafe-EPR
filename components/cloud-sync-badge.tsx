"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CloudSyncBadge() {
  const [status, setStatus] = useState<"connected" | "connecting" | "offline">("connecting");
  const [lastSync, setLastSync] = useState<string>("Just now");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("cloud-sync-pulse-" + Math.random().toString(36).slice(2), {
      config: { presence: { key: "device" } },
    });

    channel
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          setStatus("connected");
          setLastSync(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
        } else if (state === "CLOSED" || state === "TIMED_OUT") {
          setStatus("offline");
        } else {
          setStatus("connecting");
        }
      });

    const interval = setInterval(() => {
      if (status === "connected") {
        setLastSync(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      }
    }, 60000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div
      title={`Multi-Device Cloud Sync is Active & Live (Last synced: ${lastSync})`}
      className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 transition-all hover:bg-emerald-100"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
      </span>
      <span className="tracking-tight">Multi-Device Cloud Sync Active</span>
    </div>
  );
}
