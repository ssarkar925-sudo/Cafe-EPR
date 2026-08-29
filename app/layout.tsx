import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "CyberCafe ERP", template: "%s | CyberCafe ERP" },
  description: "CyberCafe ERP system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem("sccomm-display-mode")||localStorage.getItem("sccomm-theme")||"system",s=localStorage.getItem("sccomm-design-style")||"premium-gradient",mot=localStorage.getItem("sccomm-motion-enabled")||"on",a=localStorage.getItem("sccomm-accent")||"blue",d=localStorage.getItem("sccomm-density")||"comfortable",f=localStorage.getItem("sccomm-font-scale")||"standard",isDark=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(isDark)r.classList.add("dark");r.setAttribute("data-display-mode",isDark?"dark":"light");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-design-style",s);r.setAttribute("data-motion",mot);if(mot==="off")r.classList.add("motion-reduce");r.setAttribute("data-accent",a);r.setAttribute("data-density",d);r.setAttribute("data-font-scale",f);if(d==="compact")r.classList.add("density-compact");if(f==="large")r.classList.add("font-scale-large");}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
