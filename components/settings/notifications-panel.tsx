"use client";

import { useEffect, useState } from "react";
import SettingsSection from "@/components/settings/settings-section";
import WhatsAppTrackerPanel from "@/components/settings/whatsapp-tracker-panel";
import {
  DEFAULT_WA_CONFIG,
  DEFAULT_WA_TEMPLATES,
  GATEWAY_PRESETS,
  checkGatewayHealth,
  getWhatsAppConfig,
  saveWhatsAppConfig,
  sendWhatsAppMessage,
  type WhatsAppConfig,
  type WhatsAppProvider,
  type WhatsAppTemplates,
} from "@/lib/whatsapp";

const TEMPLATE_KEYS: { id: keyof WhatsAppTemplates; label: string; icon: string; vars: string[] }[] = [
  {
    id: "pos_invoice",
    label: "POS Tax Invoice",
    icon: "🧾",
    vars: ["shop_name", "invoice_number", "invoice_date", "customer_name_line", "total_amount", "paid_amount", "status_line", "receipt_url"],
  },
  {
    id: "quick_sale",
    label: "Quick Sale Receipt",
    icon: "📦",
    vars: ["shop_name", "sale_number", "sale_date", "customer_name_line", "item_name", "paid_amount", "receipt_url"],
  },
  {
    id: "banking_txn",
    label: "Banking / Remittance Receipt",
    icon: "📱",
    vars: ["shop_name", "service_name", "txn_number", "txn_date", "customer_name_line", "amount", "ref_number", "status", "receipt_url"],
  },
  {
    id: "due_reminder",
    label: "Customer Due Reminder",
    icon: "⚠️",
    vars: ["shop_name", "customer_name", "invoice_number", "invoice_date", "due_amount", "receipt_url"],
  },
  {
    id: "day_close",
    label: "Daily Store Handover Slip",
    icon: "📊",
    vars: ["shop_name", "close_date", "closing_number", "net_profit", "liquid_position", "receipt_url"],
  },
];

export default function NotificationsPanel({ active }: { active: boolean }) {
  const [subTab, setSubTab] = useState<"gateway" | "templates" | "history">("gateway");
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_WA_CONFIG);
  const [saved, setSaved] = useState(false);
  const [activeTemplateKey, setActiveTemplateKey] = useState<keyof WhatsAppTemplates>("pos_invoice");
  const [testPhone, setTestPhone] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [testResult, setTestResult] = useState("");
  const [gatewayHealth, setGatewayHealth] = useState<{
    loading: boolean;
    status: "connected" | "waiting_for_qr" | "offline" | "waking_up" | "error" | "untested";
    connected: boolean;
    phone?: string;
    error?: string;
    isLocal?: boolean;
    lastTested?: string;
  }>({
    loading: false,
    status: "untested",
    connected: false,
  });

  async function testGatewayConnection(urlToTest?: string) {
    const url = urlToTest || config.gateway_url || "http://localhost:3001";
    setGatewayHealth((prev) => ({ ...prev, loading: true, error: undefined }));
    const res = await checkGatewayHealth(url);
    setGatewayHealth({
      loading: false,
      status: res.status,
      connected: res.connected,
      phone: res.phone,
      error: res.error,
      isLocal: res.isLocal,
      lastTested: new Date().toLocaleTimeString("en-IN"),
    });
  }

  useEffect(() => {
    const cfg = getWhatsAppConfig();
    setConfig(cfg);
    if (cfg.provider === "local_gateway") {
      testGatewayConnection(cfg.gateway_url);
    }
  }, []);

  function handleSave(updates: Partial<WhatsAppConfig>) {
    const updated = { ...config, ...updates };
    setConfig(updated);
    saveWhatsAppConfig(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function handleTemplateChange(text: string) {
    const currentTemplates = config.templates || DEFAULT_WA_TEMPLATES;
    const updatedTemplates = {
      ...currentTemplates,
      [activeTemplateKey]: text,
    };
    handleSave({ templates: updatedTemplates });
  }

  function handleResetTemplate() {
    const currentTemplates = config.templates || DEFAULT_WA_TEMPLATES;
    const updatedTemplates = {
      ...currentTemplates,
      [activeTemplateKey]: DEFAULT_WA_TEMPLATES[activeTemplateKey],
    };
    handleSave({ templates: updatedTemplates });
  }

  function insertTagIntoTemplate(tag: string) {
    const placeholder = "{" + tag + "}";
    const currentText = config.templates?.[activeTemplateKey] || DEFAULT_WA_TEMPLATES[activeTemplateKey];
    handleTemplateChange(currentText + " " + placeholder);
  }

  async function handleTestSend() {
    if (!testPhone.trim()) {
      setTestStatus("error");
      setTestResult("Please enter a test mobile number.");
      return;
    }

    setTestStatus("sending");
    setTestResult("");

    const activeServerName = config.provider === "local_gateway"
      ? (config.gateway_url?.includes("localhost") ? "Local PC Gateway" : "Render Cloud Gateway")
      : config.provider.toUpperCase();

    const testMsg = `👋 *Greetings from Sarkar Communication!*\n\n✅ Your WhatsApp automation gateway is *LIVE and Working Perfectly*.\n⚡ Server: ${activeServerName}\n📅 Date: ${new Date().toLocaleDateString("en-IN")}\n⏰ Time: ${new Date().toLocaleTimeString("en-IN")}\n\nInvoices and receipts will now be sent directly in the background!`;

    const res = await sendWhatsAppMessage({
      phone: testPhone.trim(),
      message: testMsg,
      recipientName: "Test Customer",
      messageType: "test",
    });

    if (res.ok) {
      setTestStatus("success");
      setTestResult(`✅ Message delivered successfully via ${activeServerName} (${config.gateway_url || "Direct"}) to +91 ${testPhone}!`);
    } else {
      setTestStatus("error");
      setTestResult("❌ Failed: " + (res.error || "Gateway connection error"));
    }
  }

  return (
    <div className={active ? "mt-6 space-y-6" : "hidden"}>
      {/* Sub navigation bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-white/10">
        {[
          { id: "gateway" as const, label: "⚡ Gateway & Automation Settings" },
          { id: "templates" as const, label: "✍️ Custom Message Templates" },
          { id: "history" as const, label: "📜 Message History & Tracker" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === tab.id
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Gateway Configuration */}
      {subTab === "gateway" && (
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
                    title: "Local / Cloud Gateway",
                    badge: "100% Free Forever",
                    badgeColor: "bg-blue-100 text-blue-700",
                    desc: "Baileys gateway on Render Cloud, PC, or phone.",
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
              <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/30 p-5 dark:border-blue-900/40 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Switch Gateway Server (Local PC or Cloud)</h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testGatewayConnection()}
                      disabled={gatewayHealth.loading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {gatewayHealth.loading ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Checking...
                        </>
                      ) : (
                        <>🔍 Test Connection (Ping)</>
                      )}
                    </button>
                    <a
                      href={config.gateway_url || "http://localhost:3001"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      📱 Open QR Dashboard ↗
                    </a>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Select your active gateway server below. You can switch between your <strong>Local PC</strong> and <strong>Render Cloud</strong> anytime with 1 click.
                </p>

                {/* 1-Click Server Presets */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {GATEWAY_PRESETS.map((preset) => {
                    const isActive = (config.gateway_url || "").trim().replace(/\/$/, "") === preset.url.replace(/\/$/, "");
                    return (
                      <div
                        key={preset.id}
                        onClick={() => {
                          handleSave({ gateway_url: preset.url });
                          testGatewayConnection(preset.url);
                        }}
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          isActive
                            ? "border-blue-500 bg-white shadow-md ring-2 ring-blue-500/20 dark:bg-slate-900"
                            : "border-slate-200 bg-white/70 hover:border-slate-300 dark:border-white/10 dark:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{preset.icon}</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{preset.label}</span>
                          </div>
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              ✓ ACTIVE SERVER
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10">
                              Switch to this
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-blue-700 dark:text-blue-400 truncate">{preset.url}</p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{preset.desc}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Live Health Status Box */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Server Health &amp; WhatsApp Link:</span>
                      {gatewayHealth.status === "connected" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          🟢 LIVE &amp; READY {gatewayHealth.phone ? `(+${gatewayHealth.phone})` : ""}
                        </span>
                      )}
                      {gatewayHealth.status === "waiting_for_qr" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                          🟡 SERVER RUNNING · WAITING FOR QR SCAN
                        </span>
                      )}
                      {gatewayHealth.status === "offline" && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                          🔴 OFFLINE / UNREACHABLE
                        </span>
                      )}
                      {gatewayHealth.status === "untested" && !gatewayHealth.loading && (
                        <span className="text-xs text-slate-400">Click &quot;Test Connection&quot; to verify</span>
                      )}
                      {gatewayHealth.loading && (
                        <span className="text-xs font-medium text-blue-600 animate-pulse">Connecting to server...</span>
                      )}
                    </div>
                    {gatewayHealth.lastTested && (
                      <span className="text-[10px] text-slate-400">Last checked: {gatewayHealth.lastTested}</span>
                    )}
                  </div>

                  {gatewayHealth.status === "waiting_for_qr" && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                      <span>Server is active, but WhatsApp account is not linked. Click to scan QR code:</span>
                      <a
                        href={config.gateway_url || "http://localhost:3001"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 font-bold underline"
                      >
                        Open QR Code Dashboard ↗
                      </a>
                    </div>
                  )}

                  {gatewayHealth.status === "offline" && (
                    <div className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-300">
                      <p className="font-semibold">{gatewayHealth.error}</p>
                      <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                        • If using <strong>Local PC</strong>: Make sure <code>pm2 start scripts/whatsapp-gateway.js</code> or <code>npm run whatsapp</code> is running in your terminal.<br />
                        • If using <strong>Render Cloud</strong>: Free tier takes ~15-20 seconds to wake up from idle sleep. Please wait a moment and test again.
                      </p>
                    </div>
                  )}
                </div>

                {/* Custom Gateway URL & Optional Key */}
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Gateway API URL (Active)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. http://localhost:3001 or https://...onrender.com"
                      value={config.gateway_url || ""}
                      onChange={(e) => {
                        handleSave({ gateway_url: e.target.value });
                      }}
                      onBlur={() => testGatewayConnection()}
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
      )}

      {/* TAB 2: Custom Message Templates */}
      {subTab === "templates" && (
        <SettingsSection
          icon="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
          tone="emerald"
          title="Custom WhatsApp Message Templates"
          desc="Customize the exact wording, branding, and variables included in automated WhatsApp messages."
        >
          <div className="space-y-6">
            {/* Template Selector */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_KEYS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTemplateKey(t.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    activeTemplateKey === t.id
                      ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Template Editor Box */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Editing: {TEMPLATE_KEYS.find((k) => k.id === activeTemplateKey)?.label}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Click any tag below to insert dynamic invoice/customer data into your template.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetTemplate}
                  className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                >
                  ↺ Reset to Default
                </button>
              </div>

              {/* Dynamic Tag Pills */}
              <div className="mb-3 flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <span className="text-[11px] font-bold text-slate-400 self-center mr-1">Available Tags:</span>
                {TEMPLATE_KEYS.find((k) => k.id === activeTemplateKey)?.vars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertTagIntoTemplate(v)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-bold text-emerald-700 shadow-2xs transition hover:border-emerald-500 hover:bg-emerald-50 dark:border-white/10 dark:bg-slate-800 dark:text-emerald-400"
                  >
                    {"+" + "{" + v + "}"}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <textarea
                rows={10}
                value={config.templates?.[activeTemplateKey] || DEFAULT_WA_TEMPLATES[activeTemplateKey]}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Enter custom template..."
              />

              {saved && (
                <p className="mt-2 text-right text-xs font-semibold text-emerald-600">
                  ✓ Template changes saved automatically!
                </p>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      {/* TAB 3: Message History Tracker */}
      {subTab === "history" && (
        <SettingsSection
          icon="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          tone="emerald"
          title="WhatsApp Message History & Audit Tracker"
          desc="Full record of all dispatched POS invoices, receipts, and custom messages with real-time delivery status and 1-click resend."
        >
          <WhatsAppTrackerPanel />
        </SettingsSection>
      )}
    </div>
  );
}
