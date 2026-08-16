"use client";

import { usePathname, useRouter } from "next/navigation";

export default function FeesToggle({ showFees }: { showFees: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex cursor-pointer select-none items-center gap-2 print:hidden">
      <input
        type="checkbox"
        checked={showFees}
        onChange={(e) => {
          const v = e.target.checked ? "1" : "0";
          router.push(`${pathname}?show_fees=${v}`);
        }}
        className="h-4 w-4 accent-blue-600"
      />
      <span className="text-sm text-slate-600">Show fees &amp; commission</span>
    </label>
  );
}