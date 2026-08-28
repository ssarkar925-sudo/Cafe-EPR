import type { Metadata } from "next";
import "./globals.css";
import "./dashboard-premium.css";
import "./pos-premium.css";
import "./sidebar-premium.css";
import "./mobile-responsive.css";
import "./invoices-premium.css";
import "./header-premium.css";
import ThemeProvider from "@/components/theme-provider";

export const metadata: Metadata = {
  title: { default: "CyberCafe ERP", template: "%s | CyberCafe ERP" },
  description: "CyberCafe ERP system",
};

const BRANDING_SCRIPT = `try {
  var BRAND_OLD = "Cafe ERP";
  var BRAND_NEW = "CyberCafe ERP";
  function applyCyberCafeBranding(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.indexOf(BRAND_OLD) !== -1) {
        node.nodeValue = node.nodeValue.split(BRAND_OLD).join(BRAND_NEW);
      }
    }
  }
  applyCyberCafeBranding(document.body);
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      if (mutation.type === "childList") {
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var added = mutation.addedNodes[j];
          if (added.nodeType === Node.TEXT_NODE) {
            if (added.nodeValue && added.nodeValue.indexOf(BRAND_OLD) !== -1) {
              added.nodeValue = added.nodeValue.split(BRAND_OLD).join(BRAND_NEW);
            }
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            applyCyberCafeBranding(added);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
} catch (e) { /* branding enhancement must never block the app */ }`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("sccomm-theme")||"system",a=localStorage.getItem("sccomm-accent")||"blue",d=localStorage.getItem("sccomm-density")||"comfortable",f=localStorage.getItem("sccomm-font-scale")||"standard",isDark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(isDark)r.classList.add("dark");r.setAttribute("data-theme",isDark?"dark":"light");r.setAttribute("data-accent",a);r.setAttribute("data-density",d);r.setAttribute("data-font-scale",f);if(d==="compact")r.classList.add("density-compact");if(f==="large")r.classList.add("font-scale-large");}catch(e){}`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: BRANDING_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
