import type { Metadata } from "next";
import "./globals.css";
import "./erp-visual-overrides.css";
import "./dashboard-quick-access.css";
import "./receipt-responsive.css";
import "./mobile-modal-overrides.css";
import "./receipt-visual-fixes.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "Cafe ERP", template: "%s | Cafe ERP" },
  description: "Comprehensive Cyber Cafe & Retail ERP with POS, Inventory, Billing, Finance, AI Advisor, and Communication Hub",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=document.documentElement,k="sccomm-design-foundation-v1";if(localStorage.getItem(k)!=="1"){localStorage.setItem(k,"1");localStorage.setItem("sccomm-display-mode","light");localStorage.removeItem("sccomm-theme");localStorage.removeItem("sccomm-gradient-enabled");localStorage.removeItem("sccomm-gradient-preset");localStorage.removeItem("sccomm-design-style")}var m=localStorage.getItem("sccomm-display-mode")||"light",mot=localStorage.getItem("sccomm-motion-enabled")||"on",a=localStorage.getItem("sccomm-accent")||"blue",d=localStorage.getItem("sccomm-density")||"comfortable",f=localStorage.getItem("sccomm-font-scale")||"standard",isDark=m==="dark";r.classList.toggle("dark",isDark);r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-design-style","foundation");r.setAttribute("data-motion",mot);if(mot==="off")r.classList.add("motion-reduce");r.setAttribute("data-accent",a);r.setAttribute("data-density",d);r.setAttribute("data-font-scale",f);if(d==="compact")r.classList.add("density-compact");if(f==="large")r.classList.add("font-scale-large");}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
