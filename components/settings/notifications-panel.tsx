"use client";

import { useEffect, useState } from "react";
import SettingsSection from "@/components/settings/settings-section";
import {
  DEFAULT_WA_CONFIG,
  getWhatsAppConfig,
  saveWhatsAppConfig,
  sendWhatsAppMessage,
  type WhatsAppConfig,
  type WhatsAppProvider,
} from "@/lib/whatsapp";

export default function NotificationsPanel({ active }: { active: boolean }) {
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_WA_CONFIG);
  const [saved, setSaved] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    setConfig(getWhatsAppConfig());
  }, []);

  function handleSave(updates: Partial<WhatsAppConfig>) {
    const updated = { ...config, ...updates };
    setConfig(updated);
    saveWhatsAppConfig(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleTestSend() {
    if (!testPhone.trim()) {
      setTestStatus("error");
      setTestResult("Please enter a test mobile number.");
      return;
    }

    setTestStatus("sending");
    setTestResult("");

    const testMsg = `👋 *Greetings from SC Communications!*\n\n✅ Your WhatsApp automation gateway is *LIVE and Working Perfectly*.\n📅 Date: ${new Date().toLocaleDateString("en-IN")}\n⏰ Time: ${new Date().toLocaleTimeString("en-IN")}\n\nInvoices and receipts will now be sent directly in the background!`;

    const res = await sendWhatsAppMessage({
      phone: testPhone.trim(),
      message: testMsg,
    });

    if (res.ok) {
      setTestStatus("success");
      setTestResult(`✅ Message delivered successfully to +91 ${testPhone}!`);
    } else {
      setTestStatus("error");
      setTestResult(`❌ Failed: ${res.error || "Gateway connection error"}`);
    }
  }

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      <SettingsSection
        icon="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        tone="emerald"
        title="WhatsApp Gateway & Background Automation"
        desc="Configure direct in-app WhatsApp messaging for POS invoices, customer dues, and agent receipts without opening external tabs."
      >
        <div className="space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active WhatsApp Gateway Provider
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  id: "meta" as WhatsAppProvider,
                  title: "Meta Cloud API",
                  badge: "1,000 Free/Mo",
                  badgeColor: "bg-emerald-100 text-emerald-700",
                  desc: "Official Meta API. Highly reliable with zero ban risk.",
                },
                {
                  id: "local_gateway" as WhatsAppProvider,
                  title: "Local Gateway",
                  badge: "100% Free Forever",
                  badgeColor: "bg-blue-100 text-blue-700",
                  desc: "Self-hosted Baileys / WPPConnect on local network.",
                },
                {
                  id: "ultramsg" as WhatsAppProvider,
                  title: "UltraMsg / GreenAPI",
                  badge: "Cloud QR",
                  badgeColor: "bg-amber-100 text-amber-700",
                  desc: "Managed cloud QR instance with API token.",
                },
                {
                  id: "off" as WhatsAppProvider,
                  title: "Off (wa.me Links)",
                  badge: "Default",
                  badgeColor: "bg-slate-100 text-slate-600",
                  desc: "Opens 1-click WhatsApp web links without server API.",
                },
              ].map((p) => {
                const isSelected = config.provider === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSave({ provider: p.id })}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20 dark:bg-emerald-950/20"
                        : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{p.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.badgeColor}`}>
                        {p.badge}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{p.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Provider Specific Settings */}
          {config.provider === "meta" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">1</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Meta WhatsApp Cloud API Credentials</h4>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Obtained from your Meta Developer Portal (developers.facebook.com → WhatsApp → API Setup).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Phone Number ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 109876543210987"
                    value={config.meta_phone_number_id || ""}
                    onChange={(e) => handleSave({ meta_phone_number_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Permanent Access Token *
                  </label>
                  <input
                    type="password"
                    placeholder="EAAB..."
                    value={config.meta_access_token || ""}
                    onChange={(e) => handleSave({ meta_access_token: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {config.provider === "local_gateway" && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Local / Self-Hosted Gateway Setup</h4>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Connects to a lightweight local background service running on your machine or LAN (e.g. Baileys / WPPConnect).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Gateway API URL
                  </label>
                  <input
                    type="text"
                    placeholder="http://localhost:3001"
                    value={config.gateway_url || ""}
                    onChange={(e) => handleSave({ gateway_url: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    API Key (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Optional secret key"
                    value={config.gateway_api_key || ""}
                    onChange={(e) => handleSave({ gateway_api_key: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {config.provider === "ultramsg" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">1</span>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">UltraMsg Cloud Gateway</h4>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Instance ID *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. instance12345"
                    value={config.ultramsg_instance_id || ""}
                    onChange={(e) => handleSave({ ultramsg_instance_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Token *
                  </label>
                  <input
                    type="password"
                    placeholder="e.g. abc123xyz"
                    value={config.ultramsg_token || ""}
                    onChange={(e) => handleSave({ ultramsg_token: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-white/10 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Background Automation Triggers */}
          {config.provider !== "off" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Zero-Click Automatic Dispatch Rules</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Automatically send invoices/receipts in the background when actions occur in the app.
              </p>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Auto-Send Invoice on POS Checkout
                    </span>
                    <p className="text-xs text-slate-400">Dispatches invoice to customer's WhatsApp as soon as checkout completes.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.auto_send_pos}
                    onChange={(e) => handleSave({ auto_send_pos: e.target.checked })}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                  <div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      Auto-Send Receipt on Business Transactions
                    </span>
                    <p className="text-xs text-slate-400">Dispatches transaction receipt on AEPS / DMT / Recharge / UPI completions.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.auto_send_business}
                    onChange={(e) => handleSave({ auto_send_business: e.target.checked })}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Test Dispatch Box */}
          {config.provider !== "off" && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-slate-900">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Test Connection & Delivery</h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Send a live test message to verify that your WhatsApp gateway is online and responding.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-white/10 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={handleTestSend}
                  disabled={testStatus === "sending"}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                  {testStatus === "sending" ? "Sending Test..." : "Send Test WhatsApp"}
                </button>
              </div>
              {testResult && (
                <p className={`mt-2.5 text-xs font-semibold ${testStatus === "success" ? "text-emerald-600" : "text-rose-600"}`}>
                  {testResult}
                </p>
              )}
            </div>
          )}

          {saved && (
            <div className="rounded-xl bg-emerald-100 p-3 text-center text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              ✓ WhatsApp configuration saved successfully!
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}