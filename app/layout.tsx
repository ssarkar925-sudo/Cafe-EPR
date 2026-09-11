import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./receipt-responsive.css";
import "./mobile-modal-overrides.css";
import "./receipt-visual-fixes.css";
import "./royal-premium.css";
import "./sidebar-royal.css";
import "./pos-royal.css";
import "./dashboard-royal.css";
import "./erp-shell-root.css";
import ThemeProvider from "@/components/theme-provider";
import { NotificationProvider } from "@/components/ui/notification-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
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
            __html: `try{var r=document.documentElement,m=localStorage.getItem("sccomm-display-mode")||"light",isDark=m==="dark";r.classList.toggle("dark",isDark);r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-motion",localStorage.getItem("sccomm-motion-enabled")||"on");r.setAttribute("data-accent",localStorage.getItem("sccomm-accent")||"violet");r.setAttribute("data-density",localStorage.getItem("sccomm-density")||"comfortable");r.setAttribute("data-font-scale",localStorage.getItem("sccomm-font-scale")||"standard");localStorage.removeItem("cafe-erp-design-style");r.removeAttribute("data-design-style");r.removeAttribute("data-design-style-v2");}catch(e){}`,
          }}
        />
        <style dangerouslySetInnerHTML={{__html:`
          @media(max-width:768px){
            html,body{background:var(--royal-bg)!important;color:var(--royal-ink)!important}
            body{background-image:none!important}
            main{font-size:14px!important;line-height:1.4!important;padding-bottom:calc(68px + env(safe-area-inset-bottom))!important}
            main [class*="text-[10px]"]{font-size:.68rem!important;line-height:1.25!important}
            main [class*="text-xs"]{font-size:.75rem!important;line-height:1.3!important}
            main [class*="text-sm"]{font-size:.82rem!important;line-height:1.35!important}
            main [class*="text-base"]{font-size:.9rem!important}
            main [class*="text-lg"]{font-size:1rem!important}
            main [class*="text-xl"]{font-size:1.1rem!important}
            main [class*="text-2xl"]{font-size:1.3rem!important}
            main [class*="text-3xl"]{font-size:1.5rem!important}
            main [class*="text-4xl"]{font-size:1.75rem!important}
            main h1{font-size:1.45rem!important}
            main h2{font-size:1.2rem!important}
            main h3{font-size:1.05rem!important}
            header{font-size:14px!important}
            header [class*="text-lg"]{font-size:1rem!important}
            header [class*="text-xl"]{font-size:1.05rem!important}
            table{width:100%!important}
            table th:last-child,table td:last-child{position:sticky!important;right:0!important;z-index:2!important}
            table thead th:last-child{z-index:4!important;background:var(--royal-surface-3)!important;box-shadow:-8px 0 14px rgba(15,23,42,.07)!important}
            table tbody td:last-child{background:var(--royal-surface)!important;box-shadow:-8px 0 14px rgba(15,23,42,.045)!important}
            .dark table tbody td:last-child{background:var(--royal-surface)!important;box-shadow:-8px 0 14px rgba(0,0,0,.18)!important}
            main [class*="overflow-x-auto"]{scrollbar-width:none}
            main [class*="overflow-x-auto"]::-webkit-scrollbar{display:none}
          }
        `}} />
        <ThemeProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
