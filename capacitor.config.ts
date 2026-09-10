import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sarkarcommunication.cafeerp",
  appName: "CafeERP",
  webDir: "public",
  server: {
    // In production, Capacitor loads the live deployed Cloudflare Worker app for instant over-the-air updates
    url: process.env.CAPACITOR_SERVER_URL || "https://cafeerp.ssarkar925.workers.dev",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#0f172a",
  },
};

export default config;
