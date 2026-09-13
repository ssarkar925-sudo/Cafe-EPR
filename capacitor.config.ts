import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://cafeerp.ssarkar925.workers.dev";
const usesHttps = serverUrl.startsWith("https://");

const config: CapacitorConfig = {
  appId: "com.sarkarcommunication.cafeerp",
  appName: "CafeERP",
  webDir: "public",
  server: {
    // Production is HTTPS. Cleartext is enabled only for an explicitly configured
    // local/intranet HTTP endpoint, never for the default production worker.
    url: serverUrl,
    cleartext: !usesHttps,
  },
  android: {
    allowMixedContent: !usesHttps,
    backgroundColor: "#0f172a",
  },
};

export default config;
