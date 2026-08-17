"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useRealtime(tables: string[]) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("db-changes-" + Math.random().toString(36).slice(2));

    for (const t of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t },
        () => {
          router.refresh();
        }
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [JSON.stringify(tables)]);
}
