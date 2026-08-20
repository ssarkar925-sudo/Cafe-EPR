"use client";

import SettingsSection from "@/components/settings/settings-section";

export default function NotificationsPanel({ active }: { active: boolean }) {
  return (
    <div className={active ? "mt-6" : "hidden"}>
      <SettingsSection
        icon="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"
        tone="indigo"
        title="Notifications"
        desc="Alert channels for low stock and daily summaries."
      >
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto h-10 w-10 text-slate-300"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-600">No notification channels configured yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            There is no push/email/SMS integration in this build. Low-stock and unpaid-invoice alerts
            are shown live in the bell icon at the top of the app.
          </p>
        </div>
      </SettingsSection>
    </div>
  );
}