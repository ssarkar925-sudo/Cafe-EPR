"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AepsCollector } from "@/lib/aeps/mobile-collector-client";

type Portal = { id: string; name: string };
type AppCandidate = { packageName: string; label: string };
type ConfiguredPackage = { packageName: string; portalCode: string; sourceId?: string };

const PORTALS = [
  { code: "csc_digipay", label: "CSC DigiPay" },
  { code: "ezeepay", label: "ezeepay" },
  { code: "spice_money", label: "Spice Money" },
  { code: "fino", label: "Fino" },
];

function guessCode(label: string): string {
  const s = label.toLowerCase();
  if (s.includes("digipay") || s.includes("csc")) return "csc_digipay";
  if (s.includes("ezeepay") || s.includes("ezee")) return "ezeepay";
  if (s.includes("spice")) return "spice_money";
  if (s.includes("fino")) return "fino";
  return "csc_digipay";
}

export default function AepsMobileCollector({ initialPortals }: { initialPortals: Portal[] }) {
  const [apps, setApps] = useState<AppCandidate[]>([]);
  const [configured, setConfigured] = useState<ConfiguredPackage[]>([]);
  const [portalCode, setPortalCode] = useState("csc_digipay");
  const [portalId, setPortalId] = useState(initialPortals[0]?.id || "");
  const [selectedApp, setSelectedApp] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [lastError, setLastError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [consented, setConsented] = useState(false);

  const native = Capacitor.isNativePlatform();

  const refresh = useCallback(async () => {
    if (!native) return;
    try {
      const [status, packages, discovered] = await Promise.all([
        AepsCollector.getStatus(),
        AepsCollector.getPortalPackages(),
        AepsCollector.discoverPortalApps(),
      ]);
      setEnabled(status.enabled);
      setAccessibilityEnabled(status.accessibilityEnabled);
      setApiConfigured(status.apiConfigured);
      setLastSync(status.lastSync || "");
      setLastError(status.lastError || "");
      setConfigured(packages.packages || []);
      setApps(discovered.apps || []);
    } catch (e: any) {
      setLastError(e?.message || "Unable to read Android collector status.");
    }
  }, [native]);

  useEffect(() => { void refresh(); }, [refresh]);

  const appOptions = useMemo(
    () => apps.filter((app) => app.packageName !== "com.sarkarcommunication.cafeerp"),
    [apps]
  );

  async function registerSelectedApp() {
    if (!selectedApp || !portalId) {
      setMessage("Select the portal and installed portal app first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const app = apps.find((x) => x.packageName === selectedApp);
      const response = await fetch("/api/aeps/mobile-collector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "register_source",
          portalId,
          portalCode,
          portalName: PORTALS.find((p) => p.code === portalCode)?.label,
          packageName: selectedApp,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Unable to register mobile source.");
      await AepsCollector.setPortalPackage({
        packageName: selectedApp,
        portalCode,
        sourceId: data.sourceId,
        enabled: true,
      });
      setMessage(`${app?.label || selectedApp} is registered for automatic transaction collection.`);
      await refresh();
    } catch (e: any) {
      setMessage(e?.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCollector() {
    setBusy(true);
    try {
      const result = await AepsCollector.setEnabled({ enabled: !enabled });
      setEnabled(result.enabled);
      setMessage(result.enabled ? "Mobile collector enabled." : "Mobile collector paused.");
    } catch (e: any) {
      setMessage(e?.message || "Unable to change collector state.");
    } finally {
      setBusy(false);
    }
  }

  if (!native) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <b>Android collector is not running in this browser.</b>
        <p className="mt-1 text-xs">Install the CafeERP Android build to connect CSC DigiPay, ezeepay, Spice Money and Fino transaction history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">AEPS Mobile Collector</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Read-only Android collector. It watches only the portal apps you explicitly enable and sends normalized transaction candidates to the CafeERP Review Queue.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black ${enabled && accessibilityEnabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {enabled && accessibilityEnabled ? "ACTIVE" : "SETUP REQUIRED"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] font-bold text-slate-500">Accessibility</span><b className="mt-1 block text-sm">{accessibilityEnabled ? "Enabled" : "Off"}</b></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] font-bold text-slate-500">API Session</span><b className="mt-1 block text-sm">{apiConfigured ? "Connected" : "Not connected"}</b></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] font-bold text-slate-500">Portals</span><b className="mt-1 block text-sm">{configured.length}</b></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-[10px] font-bold text-slate-500">Last Sync</span><b className="mt-1 block text-sm">{lastSync ? new Date(lastSync).toLocaleTimeString("en-IN") : "—"}</b></div>
        </div>

        {!accessibilityEnabled && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Android requires you to explicitly enable the CafeERP accessibility service in system settings. CafeERP cannot enable it silently.
            <button type="button" onClick={() => AepsCollector.openAccessibilitySettings()} className="ml-3 rounded-lg bg-amber-600 px-3 py-1.5 font-black text-white">Open Settings</button>
          </div>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <select value={portalCode} onChange={(e) => setPortalCode(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
            {PORTALS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
          </select>
          <select value={portalId} onChange={(e) => setPortalId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
            {initialPortals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={selectedApp} onChange={(e) => setSelectedApp(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
            <option value="">Select installed app</option>
            {appOptions.map((app) => <option key={app.packageName} value={app.packageName}>{app.label} — {app.packageName}</option>)}
          </select>
          <button type="button" disabled={busy || !selectedApp} onClick={registerSelectedApp} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {busy ? "Saving…" : "Add Portal App"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={toggleCollector} disabled={busy || !accessibilityEnabled || !apiConfigured || !consented} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
            {enabled ? "Pause Collector" : "Start Automatic Collection"}
          </button>
          <button type="button" onClick={() => void refresh()} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">Refresh</button>
        </div>

        {message && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-800">{message}</p>}
        {lastError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{lastError}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-black text-slate-950">Configured Mobile Sources</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {configured.length === 0 && <p className="py-4 text-xs text-slate-500">No mobile portal apps configured.</p>}
          {configured.map((item) => (
            <div key={item.packageName} className="flex items-center justify-between gap-3 py-3">
              <div><b className="block text-xs text-slate-900">{PORTALS.find((p) => p.code === item.portalCode)?.label || item.portalCode}</b><span className="font-mono text-[10px] text-slate-500">{item.packageName}</span></div>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">COLLECTING</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
