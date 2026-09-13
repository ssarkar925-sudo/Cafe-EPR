"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label = "Print" }: { label?: string }) {
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      if ((window as any).electronAPI?.printThermal) {
        (window as any).electronAPI.printThermal().catch(() => window.print());
      } else {
        window.print();
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 print:hidden"
    >
      <Printer className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}
