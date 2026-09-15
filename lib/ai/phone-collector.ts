/**
 * TypeScript bridge to the Android AI ingestion collector (Phase 12).
 *
 * Talks to the native `AiIngestion` Capacitor plugin when running inside the
 * Android app; degrades gracefully on web/desktop where no collector exists.
 * Notification content never passes through this bridge — only source
 * allowlist entries, configuration, and queue status.
 */

export interface PhoneCollectorStatus {
  available: boolean;
  sourcesEnabled: number;
  apiConfigured: boolean;
  lastActiveAt: number;
  queuedEvents: number;
}

/** Suggested source apps. Nothing is enabled unless the owner enables it. */
export const SUGGESTED_NOTIFICATION_SOURCES: { pkg: string; label: string }[] = [
  { pkg: "com.csc.digipay", label: "CSC DigiPay" },
  { pkg: "com.spicemoney.agent", label: "Spice Money" },
  { pkg: "com.paymonk.agent", label: "Paymonk" },
  { pkg: "com.google.android.apps.nbu.paisa.user", label: "Google Pay (UPI alerts)" },
  { pkg: "com.phonepe.app", label: "PhonePe (UPI alerts)" },
  { pkg: "net.one97.paytm", label: "Paytm (UPI alerts)" },
];

async function getPlugin(): Promise<any | null> {
  try {
    if (typeof window === "undefined") return null;
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor || Capacitor.getPlatform() !== "android") return null;
    const { registerPlugin } = await import("@capacitor/core");
    return registerPlugin("AiIngestion");
  } catch {
    return null;
  }
}

export async function isPhoneCollectorAvailable(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

export async function getPhoneCollectorStatus(): Promise<PhoneCollectorStatus> {
  const plugin = await getPlugin();
  const fallback: PhoneCollectorStatus = {
    available: false,
    sourcesEnabled: 0,
    apiConfigured: false,
    lastActiveAt: 0,
    queuedEvents: 0,
  };
  if (!plugin) return fallback;
  try {
    const res = await plugin.getStatus();
    const status = JSON.parse(String(res?.status || "{}"));
    return {
      available: true,
      sourcesEnabled: Number(status.sources_enabled || 0),
      apiConfigured: Boolean(status.api_configured),
      lastActiveAt: Number(status.last_active_at || 0),
      queuedEvents: Number(status.queued_events || 0),
    };
  } catch {
    return fallback;
  }
}

export async function getAllowedPhoneSources(): Promise<string[]> {
  const plugin = await getPlugin();
  if (!plugin) return [];
  try {
    const res = await plugin.getAllowedSources();
    return Array.isArray(res?.sources) ? res.sources.map((s: unknown) => String(s)) : [];
  } catch {
    return [];
  }
}

export async function setPhoneSourceAllowed(pkg: string, allowed: boolean): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("Phone collector is only available inside the Android app.");
  await plugin.setSourceAllowed({ package: pkg, allowed });
}

export async function setPhoneCollectorApi(apiUrl: string, workerKey: string): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("Phone collector is only available inside the Android app.");
  await plugin.setApiConfig({ apiUrl, workerKey });
}

export async function openPhoneListenerSettings(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("Phone collector is only available inside the Android app.");
  await plugin.openListenerSettings();
}
