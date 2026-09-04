import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-page-shell">
      {children}
      <style>{`
        .dashboard-page-shell > .space-y-6.pb-16 {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > * {
          margin-top: 0 !important;
        }

        /* Flatten the existing attention/quick-actions grid so Quick Actions
           can become the first dashboard action surface without changing
           the existing Quick Action component or its permissions. */
        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) {
          display: contents;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) > * {
          width: 100%;
          min-width: 0;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) > :nth-child(2) {
          order: -1;
        }
      `}</style>
    </div>
  );
}
