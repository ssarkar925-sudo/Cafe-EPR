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
      aria-label="Cloud sync status"
      title={`Cloud Sync: ${status === "connected" ? "Active" : status}. Last synced: ${lastSync}`}
      className="hidden sm:inline-flex h-3 w-3 items-center justify-center"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
      </span>
    </div>
  );
}
