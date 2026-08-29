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
            __html: `try{var t=localStorage.getItem("sccomm-theme")||"system",g=localStorage.getItem("sccomm-gradient-preset")||"aurora",a=localStorage.getItem("sccomm-accent")||"blue",d=localStorage.getItem("sccomm-density")||"comfortable",f=localStorage.getItem("sccomm-font-scale")||"standard",isDark=t==="dark"||t==="gradient"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(isDark)r.classList.add("dark");r.setAttribute("data-theme",t==="gradient"?"gradient":(isDark?"dark":"light"));r.setAttribute("data-gradient-preset",g);r.setAttribute("data-accent",a);r.setAttribute("data-density",d);r.setAttribute("data-font-scale",f);if(d==="compact")r.classList.add("density-compact");if(f==="large")r.classList.add("font-scale-large");}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
