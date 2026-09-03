import type { Metadata } from "next";
import "./globals.css";
import "./erp-visual-overrides.css";
import "./dashboard-quick-access.css";
import "./design-system-10.css";
import "./design-style-previews.css";
import "./design-rescue.css";
import "./erp-visual-consistency.css";
import "./receipt-responsive.css";
import "./mobile-modal-overrides.css";
import "./receipt-visual-fixes.css";
import "./mobile-theme-final.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = { title:{default:"Cafe ERP",template:"%s | Cafe ERP"},description:"Comprehensive Cyber Cafe & Retail ERP with POS, Inventory, Billing, Finance, AI Advisor, and Communication Hub" };
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en" suppressHydrationWarning><body><script dangerouslySetInnerHTML={{__html:`try{var r=document.documentElement,key="cafe-erp-design-style",s=localStorage.getItem(key)||"premium-hybrid";r.setAttribute("data-design-style",s);r.setAttribute("data-design-style-v2",s);var m=localStorage.getItem("sccomm-display-mode")||"light",isDark=m==="dark";r.classList.toggle("dark",isDark);r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-motion",localStorage.getItem("sccomm-motion-enabled")||"on");r.setAttribute("data-accent",localStorage.getItem("sccomm-accent")||"violet");r.setAttribute("data-density",localStorage.getItem("sccomm-density")||"comfortable");r.setAttribute("data-font-scale",localStorage.getItem("sccomm-font-scale")||"standard")}catch(e){}`}}/><ThemeProvider>{children}</ThemeProvider></body></html>;
}