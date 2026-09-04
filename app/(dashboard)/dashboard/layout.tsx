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

        /* Flatten the existing attention/quick-actions grid so its two
           surfaces can participate in the dashboard's section ordering. */
        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) {
          display: contents;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) > * {
          width: 100%;
          min-width: 0;
        }

        /* Dashboard order: Executive Header → KPI Dashboard → Quick Action
           Shortcuts → Performance → Services → Operations. */
        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(1) {
          order: 1;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(2) {
          order: 2;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) > :nth-child(2) {
          order: 3;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(3) {
          order: 4;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(4) {
          order: 5;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(5) {
          order: 6;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(6) > :nth-child(1) {
          order: 7;
        }

        .dashboard-page-shell > .space-y-6.pb-16 > :nth-child(7) {
          order: 8;
        }
      `}</style>
    </div>
  );
}
