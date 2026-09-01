"use client";

import { useEffect, useState } from "react";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_CONFIG, type WhatsAppAutomationRules, type WhatsAppProvider } from "@/lib/whatsapp";

type ConfigResponse = {
  provider: WhatsAppProvider;
  gateway_url?: string;
  meta_phone_number_id?: string;
  meta_access_token_set?: boolean;
  automations: WhatsAppAutomationRules;
  configured: boolean;
};

export default function WhatsAppConfigurationPanel() {
  const [cfg, setCfg] = useState<ConfigResponse>({
    provider: "off",
    gateway_url: DEFAULT_WA_CONFIG.gateway_url,
    automations: DEFAULT_AUTOMATIONS,
    configured: false,
  });
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_WA_CONFIG.gateway_url || "");
  const [provider, setProvider] = useState<WhatsAppProvider>("off");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState("");

  async function load() {
    const res = await fetch("/api/whatsapp/config", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as ConfigResponse;
    setCfg(data);
    setProvider(data.provider || "off");
    setGatewayUrl(data.gateway_url || "");
    setPhoneId(data.meta_phone_number_id || "");
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          gateway_url: gatewayUrl,
          meta_phone_number_id: phoneId,
          meta_access_token: token || undefined,
          automations: cfg.automations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save configuration");
      setToken("");
      setMessage({ ok: true, text: "WhatsApp configuration saved securely." });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Could not save configuration" });
    } finally { setSaving(false); }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Test message failed");
      setMessage({ ok: true, text: `Test message accepted by ${data.provider || "WhatsApp"}.` });
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Test message failed" });
    } finally { setTesting(false); }
  }

  function toggle(key: keyof WhatsAppAutomationRules) {
    setCfg((old) => ({ ...old, automations: { ...old.automations, [key]: !old.automations[key] } }));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Official Cloud API</p>
            <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Connect WhatsApp</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Credentials are written to the server-only WhatsApp secrets store. The browser never receives the access token.</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${cfg.configured ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"}`}>
            {cfg.configured ? "Configured" : "Not configured"}
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value as WhatsAppProvider)} className={inputClass}>
              <option value="off">Disabled</option>
              <option value="meta">Meta WhatsApp Cloud API</option>
              <option value="local_gateway">Local Gateway (legacy)</option>
              <option value="ultramsg">UltraMsg (legacy)</option>
            </select>
          </Field>
          <Field label="Phone Number ID">
            <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="Meta Phone Number ID" className={inputClass} />
          </Field>
          <Field label="Permanent Access Token">
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.meta_access_token_set ? "Saved — enter only to replace" : "Paste Meta access token"} autoComplete="new-password" className={inputClass} />
          </Field>
          <Field label="Gateway URL (legacy only)">
            <input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} placeholder="https://..." className={inputClass} disabled={provider === "meta" || provider === "off"} />
          </Field>
        </div>

        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs leading-5 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
          For Meta Cloud API, use a permanent system-user token, your Phone Number ID, and an approved WhatsApp Business sender. Do not paste secrets into message templates.
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={save} disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Securely"}</button>
          <a href="https://developers.facebook.com/docs/whatsapp/cloud-api" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">Meta Cloud API Guide</a>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Connection Test</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Send a server-side test using the saved credential. The access token is never returned to the browser.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="10-digit recipient mobile" className={`${inputClass} sm:max-w-sm`} />
          <button onClick={testConnection} disabled={testing || !testPhone.trim()} className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-indigo-600">{testing ? "Testing..." : "Send Test Message"}</button>
        </div>
        {message && <div className={`mt-4 rounded-xl p-3 text-xs font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"}`}>{message.text}</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Automatic Messages</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose which completed ERP events enqueue WhatsApp messages.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(cfg.automations).map(([key, enabled]) => (
            <button key={key} onClick={() => toggle(key as keyof WhatsAppAutomationRules)} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-left dark:border-white/10">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{labelize(key)}</span>
              <span className={`h-6 w-11 rounded-full p-1 ${enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${enabled ? "translate-x-5" : "translate-x-0"}`} /></span>
            </button>
          ))}
        </div>
        <button onClick={save} disabled={saving} className="mt-5 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">Save Automation Settings</button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white";

function labelize(key: string) {
  return key.replace(/^auto_send_/, "").split("_").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" ");
}
