import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./receipt-responsive.css";
import "./mobile-modal-overrides.css";
import "./receipt-visual-fixes.css";
import "./quick-access.css";
import "./modern-ui.css";
import ThemeProvider from "@/components/theme-provider";
import { NotificationProvider } from "@/components/ui/notification-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1018" },
  ],
};

export const metadata: Metadata = {
  title: { default: "Cafe ERP", template: "%s | Cafe ERP" },
  description: "Comprehensive Cyber Cafe & Retail ERP with POS, Inventory, Billing, Finance, AI Advisor, and Communication Hub"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=document.documentElement,m=localStorage.getItem("sccomm-display-mode")||"light",isDark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",isDark);r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-motion",localStorage.getItem("sccomm-motion-enabled")||"on");r.classList.toggle("motion-reduce",localStorage.getItem("sccomm-motion-enabled")==="off");r.setAttribute("data-accent",localStorage.getItem("sccomm-accent")||"violet");var den=localStorage.getItem("sccomm-density")||"comfortable";r.setAttribute("data-density",den);r.classList.toggle("density-compact",den==="compact");var fnt=localStorage.getItem("sccomm-font-scale")||"standard";r.setAttribute("data-font-scale",fnt);r.classList.toggle("font-scale-large",fnt==="large");var ge=localStorage.getItem("sccomm-gradient-enabled")==="true";r.setAttribute("data-gradient-enabled",String(ge));r.setAttribute("data-gradient-preset",localStorage.getItem("sccomm-gradient-preset")||"aurora");var hc=localStorage.getItem("sccomm-high-contrast")==="true";r.classList.toggle("contrast-more",hc);localStorage.removeItem("cafe-erp-design-style");r.removeAttribute("data-design-style");r.removeAttribute("data-design-style-v2");}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
