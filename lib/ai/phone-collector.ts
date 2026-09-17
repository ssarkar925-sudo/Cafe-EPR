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
  collectionEnabled: boolean;
  listenerSystemEnabled: boolean;
  sourcesEnabled: number;
  apiConfigured: boolean;
  lastActiveAt: number;
  queuedEvents: number;
  failedEvents: number;
  lastResult: string;
  lastErrorCode: string;
  consecutiveFailures: number;
  counters: Record<string, number>;
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

/**
 * Single JS registration for the native plugin.
 * Capacitor's registerPlugin() warns ("already registered") on every repeat
 * call, and every Phone Collector refresh invokes several bridge functions —
 * so registration must happen exactly once per page load. This memoizes the
 * proxy promise; it does NOT provide any JS implementation, so on platforms
 * without the native plugin the calls still resolve/reject exactly as before
 * (Unimplemented on android-without-native, guarded by callers).
 */
let pluginPromise: Promise<any | null> | null = null;

function getPlugin(): Promise<any | null> {
  if (pluginPromise) return pluginPromise;
  pluginPromise = (async () => {
    try {
      if (typeof window === "undefined") return null;
      const win = window as any;

      // 1. Direct native proxy check (Capacitor Android injects window.Capacitor.Plugins.AiIngestion)
      if (win.Capacitor?.Plugins?.AiIngestion) {
        return win.Capacitor.Plugins.AiIngestion;
      }

      // 2. Resolve @capacitor/core and verify platform
      const { Capacitor, registerPlugin } = await import("@capacitor/core");
      const effectiveCap = win.Capacitor || Capacitor;
      const isAndroid =
        Boolean(win.androidBridge) ||
        effectiveCap?.getPlatform?.() === "android" ||
        Capacitor.getPlatform() === "android";

      if (!isAndroid || Capacitor.getPlatform() !== "android") {
        if (!isAndroid) return null;
      }

      if (effectiveCap?.Plugins?.AiIngestion) {
        return effectiveCap.Plugins.AiIngestion;
      }

      return registerPlugin("AiIngestion");
    } catch {
      return null;
    }
  })().then((res) => {
    if (!res) {
      pluginPromise = null;
    }
    return res;
  });
  return pluginPromise;
}

export async function isPhoneCollectorAvailable(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

export async function getPhoneCollectorStatus(): Promise<PhoneCollectorStatus> {
  const plugin = await getPlugin();
  const fallback: PhoneCollectorStatus = {
    available: false,
    collectionEnabled: false,
    listenerSystemEnabled: false,
    sourcesEnabled: 0,
    apiConfigured: false,
    lastActiveAt: 0,
    queuedEvents: 0,
    failedEvents: 0,
    lastResult: "",
    lastErrorCode: "",
    consecutiveFailures: 0,
    counters: {},
  };
  if (!plugin) return fallback;
  try {
    const res = await plugin.getStatus();
    const status = JSON.parse(String(res?.status || "{}"));
    let listenerOn = false;
    try {
      const sys = await plugin.isListenerSystemEnabled();
      listenerOn = Boolean(sys?.enabled);
    } catch {
      listenerOn = false;
    }
    return {
      available: true,
      collectionEnabled: Boolean(status.collection_enabled),
      listenerSystemEnabled: listenerOn,
      sourcesEnabled: Number(status.sources_enabled || 0),
      apiConfigured: Boolean(status.api_configured),
      lastActiveAt: Number(status.last_active_at || 0),
      queuedEvents: Number(status.queued_events || 0),
      failedEvents: Number(status.failed_events || 0),
      lastResult: String(status.last_result || ""),
      lastErrorCode: String(status.last_error_code || ""),
      consecutiveFailures: Number(status.consecutive_failures || 0),
      counters:
        status.counters && typeof status.counters === "object"
          ? (status.counters as Record<string, number>)
          : {},
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

export async function setPhoneCollectionEnabled(enabled: boolean): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) throw new Error("Phone collector is only available inside the Android app.");
  await plugin.setCollectionEnabled({ enabled });
}

export async function isPhoneCollectionEnabled(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    const res = await plugin.isCollectionEnabled();
    return Boolean(res?.enabled);
  } catch {
    return false;
  }
}

export async function isPhoneListenerSystemEnabled(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    const res = await plugin.isListenerSystemEnabled();
    return Boolean(res?.enabled);
  } catch {
    return false;
  }
}
