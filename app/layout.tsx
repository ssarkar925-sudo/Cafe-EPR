import type { Metadata } from "next";
import "./globals.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "Cafe ERP", template: "%s | Cafe ERP" },
  description: "Cafe ERP system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("sccomm-theme")||"system",d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
