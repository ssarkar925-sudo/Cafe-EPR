import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SCC OMM Cafe ERP", template: "%s | SCC OMM Cafe ERP" },
  description: "Cafe ERP system",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
