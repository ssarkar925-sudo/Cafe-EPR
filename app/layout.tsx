import type { Metadata } from "next";
import "./globals.css";
import "./erp-visual-overrides.css";
import "./dashboard-quick-access.css";
import "./receipt-responsive.css";
import "./mobile-modal-overrides.css";
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
            __html: `try{var m=localStorage.getItem("sccomm-display-mode")||localStorage.getItem("sccomm-theme")||"system",grad=localStorage.getItem("sccomm-gradient-enabled")!=="false",preset=localStorage.getItem("sccomm-gradient-preset")||"aurora",mot=localStorage.getItem("sccomm-motion-enabled")||"on",a=localStorage.getItem("sccomm-accent")||"blue",d=localStorage.getItem("sccomm-density")||"comfortable",f=localStorage.getItem("sccomm-font-scale")||"standard",isDark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(isDark)r.classList.add("dark");r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-design-style","modern-spatial");r.setAttribute("data-gradient-enabled",String(grad));r.setAttribute("data-gradient-preset",preset);r.setAttribute("data-motion",mot);if(mot==="off")r.classList.add("motion-reduce");r.setAttribute("data-accent",a);r.setAttribute("data-density",d);r.setAttribute("data-font-scale",f);if(d==="compact")r.classList.add("density-compact");if(f==="large")r.classList.add("font-scale-large");if(localStorage.getItem("sccomm-design-style")==="classic")localStorage.removeItem("sccomm-design-style");}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
