"use client";

import { useEffect } from "react";

export default function AutoPrint() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("print") === "true" || params.get("auto") === "true") {
        const timer = setTimeout(() => {
          if ((window as any).electronAPI?.printThermal) {
            (window as any).electronAPI.printThermal().catch(() => window.print());
          } else {
            window.print();
          }
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  return null;
}
