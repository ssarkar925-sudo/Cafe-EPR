"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1e293b] print:hidden"
    >
      Print
    </button>
  );
}
