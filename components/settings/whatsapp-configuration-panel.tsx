"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Info,
  Check,
} from "lucide-react";
import { DEFAULT_AUTOMATIONS, DEFAULT_WA_CONFIG, type WhatsAppAutomationRules, type WhatsAppProvider } from "@/lib/whatsapp";

type ConfigResponse = {
  provider: WhatsAppProvider;
  gateway_url?: string;
  meta_phone_number_id?: string;
  meta_waba_id?: string;
  meta_app_id?: string;
  meta_display_phone_number?: string;
  meta_access_token_set?: boolean;
  meta_verify_token?: string;
  meta_live?: {
    verified_name?: string;
    display_phone_number?: string;
    code_verification_status?: string;
    quality_rating?: string;
    status?: string;
    waba_name?: string;
    account_review_status?: string;
    business_verification_status?: string;
    business_id?: string;
    business_name?: string;
    system_user?: string;
    direct_verify_url?: string;
    token_valid?: boolean;
    error?: string;
  } | null;
  automations: WhatsAppAutomationRules;
  configured: boolean;
};

export default function WhatsAppConfigurationPanel() {
  const [cfg, setCfg] = useState<ConfigResponse>({
    provider: "meta",
    gateway_url: DEFAULT_WA_CONFIG.gateway_url,
    automations: DEFAULT_AUTOMATIONS,
    configured: false,
  });
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [appId, setAppId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_WA_CONFIG.gateway_url || "");
  const [provider, setProvider] = useState<WhatsAppProvider>("meta");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checkingLive, setCheckingLive] = useState(false);
  const [useTemplate, setUseTemplate] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testDiagnostic, setTestDiagnostic] = useState<{
    errorCode?: number;
    verifyUrl?: string;
    error?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  const [pin, setPin] = useState("");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/whatsapp/webhook`);
    }
  }, []);

  async function registerPin() {
    if (!/^\d{6}$/.test(pin)) {
      setMessage({ ok: false, text: "Enter a valid 6-digit numeric PIN for WhatsApp Two-Step Verification." });
      return;
    }
    setRegistering(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/config/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "PIN registration failed");
      }
      setMessage({ ok: true, text: "Phone number PIN registered successfully with Meta Cloud API!" });
      setPin("");
      await load(true);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "PIN registration failed" });
    } finally {
      setRegistering(false);
    }
  }

  async function load(checkLive = false) {
    if (checkLive) setCheckingLive(true);
    try {
      const res = await fetch(`/api/whatsapp/config${checkLive ? "?check_live=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ConfigResponse;
      setCfg(data);
      setProvider(data.provider || "meta");
      setGatewayUrl(data.gateway_url || "");
      setPhoneId(data.meta_phone_number_id || "");
      setWabaId(data.meta_waba_id || "");
      setAppId(data.meta_app_id || "");
      setDisplayPhone(data.meta_display_phone_number || "");
    } finally {
      if (checkLive) setCheckingLive(false);
    }
  }

  useEffect(() => {
    load(true);
  }, []);

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
          meta_waba_id: wabaId,
          meta_app_id: appId,
          meta_display_phone_number: displayPhone,
          meta_access_token: token || undefined,
          automations: cfg.automations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save configuration");
      setToken("");
      setMessage({ ok: true, text: "WhatsApp configuration saved securely." });
      await load(true);
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Could not save configuration" });
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    setTestDiagnostic(null);
    try {
      const res = await fetch("/api/whatsapp/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: testPhone,
          use_template: useTemplate,
          template_name: useTemplate ? "hello_world" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.errorCode || data.verifyUrl) {
          setTestDiagnostic({
            errorCode: data.errorCode,
            verifyUrl: data.verifyUrl,
            error: data.error,
          });
        }
        throw new Error(data.error || "Test message delivery failed");
      }
      setMessage({
        ok: true,
        text: `Success! Message accepted by Meta Cloud API (ID: ${data.messageId || "Queued"}).`,
      });
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Test message failed" });
    } finally {
      setTesting(false);
    }
  }

  function toggle(key: keyof WhatsAppAutomationRules) {
    setCfg((old) => ({ ...old, automations: { ...old.automations, [key]: !old.automations[key] } }));
  }

  function copyToClipboard(text: string, fieldId: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2500);
  }

  const isVerified = cfg.meta_live?.code_verification_status === "VERIFIED";
  const isConnected = cfg.meta_live?.status === "CONNECTED";
  const isPendingVerification = cfg.meta_live && (cfg.meta_live.code_verification_status === "NOT_VERIFIED" || cfg.meta_live.status === "DISCONNECTED");

  return (
    <div className="space-y-6">
      {/* 1. Meta Cloud API Credentials */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Official Meta Cloud API
              </span>
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">WhatsApp Business Configuration</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Direct connection to Meta Graph API v21.0. System-user tokens are encrypted server-side in Supabase RLS secrets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={checkingLive}
              title="Check live status from Meta API"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checkingLive ? "animate-spin" : ""}`} />
              {checkingLive ? "Checking..." : "Live Status"}
            </button>
            <span
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                cfg.configured
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              }`}
            >
              {cfg.configured ? "Configured" : "Not configured"}
            </span>
          </div>
        </div>

        {/* Live Status Card from Meta */}
        {cfg.meta_live && !cfg.meta_live.error && (
          <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3 dark:border-white/5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {cfg.meta_live.verified_name || "WhatsApp Business"} ({cfg.meta_live.display_phone_number || displayPhone})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isVerified
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  {isVerified ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {cfg.meta_live.code_verification_status || "NOT_VERIFIED"}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    isConnected
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  Status: {cfg.meta_live.status || "UNKNOWN"}
                </span>
              </div>
            </div>

            {isPendingVerification && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-amber-950 dark:text-amber-100">
                      Action Required: 1-Time SMS/Voice Verification in Meta WhatsApp Manager
                    </p>
                    <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                      Meta Code 133010
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                    Your credentials (Token, WABA <strong>{wabaId || "448036473626878"}</strong>, Phone ID <strong>{phoneId || "252079703694976"}</strong>) are 100% saved and authenticated with Meta Cloud API. However, Meta requires you to verify ownership of <strong>{cfg.meta_live.display_phone_number || displayPhone || "+91 70030 37208"}</strong> before outgoing messages can be sent.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={cfg.meta_live.direct_verify_url || `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=2078690092683215&asset_id=${wabaId || "448036473626878"}&waba_id=${wabaId || "448036473626878"}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                    >
                      Open WhatsApp Manager (Sarkar Communication) <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="https://developers.facebook.com/apps/"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300"
                    >
                      Open Meta Developer Console (API Setup) <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      type="button"
                      onClick={() => load(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white/80 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-slate-800 dark:text-amber-200"
                    >
                      <RefreshCw className={`h-3 w-3 ${checkingLive ? "animate-spin" : ""}`} /> Refresh Verification Status
                    </button>
                  </div>

                  {/* Inline 6-Digit PIN Registration Tool */}
                  <div className="mt-3.5 rounded-xl border border-amber-300/80 bg-white/80 p-3.5 shadow-sm dark:border-amber-800/60 dark:bg-slate-900/80">
                    <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
                      Direct WhatsApp 2-Step PIN Registration:
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-800/90 dark:text-amber-300/90">
                      If the phone number was already added to Meta, enter your 6-digit WhatsApp PIN to register it directly with Meta Cloud API.
                    </p>
                    <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="6-digit PIN"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold tracking-widest text-slate-900 outline-none focus:border-indigo-500 sm:max-w-[180px] dark:border-white/20 dark:bg-slate-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={registerPin}
                        disabled={registering || pin.length !== 6}
                        className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                      >
                        {registering ? "Registering PIN..." : "Register 6-Digit PIN with Meta"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                    <p className="font-bold text-amber-950 dark:text-amber-100">
                      Why the WhatsApp Manager table shows Status: &quot;Offline&quot; with no verify button:
                    </p>
                    <p>
                      In Meta WhatsApp Manager, the table is only a status summary — Meta never places a &quot;Verify&quot; button directly on the table. Status &quot;Offline&quot; means Meta is waiting for 1-time SMS OTP verification or Two-Step PIN setup.
                    </p>
                    <ol className="list-decimal space-y-1 pl-4 font-medium">
                      <li>
                        <strong>Recommended (Meta Developer Console):</strong> Click <strong>Open Meta Developer Console</strong> above → click your App → <strong>WhatsApp → API Setup</strong> → In the <strong>&quot;From&quot;</strong> dropdown, select <strong>+91 70030 37208</strong> → Click <strong>Register / Verify</strong> → enter the SMS OTP code and set your 6-digit PIN.
                      </li>
                      <li>
                        <strong>In WhatsApp Manager:</strong> Click <strong>Open WhatsApp Manager</strong> above → on the row for <strong>+91 70030 37208</strong>, click the <strong>⚙️ (Gear icon)</strong> on the far right → click <strong>Two-Step Verification</strong> → enter your 6-digit PIN.
                      </li>
                      <li>
                        Once completed, click <strong>Refresh Verification Status</strong>. The status will immediately turn green <strong>CONNECTED</strong>!
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="WhatsApp Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as WhatsAppProvider)}
              className={inputClass}
            >
              <option value="meta">Meta WhatsApp Cloud API (Recommended)</option>
              <option value="local_gateway">Local Gateway (Baileys / Node)</option>
              <option value="ultramsg">UltraMsg (Legacy)</option>
              <option value="off">Disabled</option>
            </select>
          </Field>

          <Field label="Phone Number ID">
            <input
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              placeholder="e.g. 252079703694976"
              className={inputClass}
            />
          </Field>

          <Field label="WhatsApp Business Account ID (WABA ID)">
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="e.g. 448036473626878"
              className={inputClass}
            />
          </Field>

          <Field label="Display Phone Number">
            <input
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              placeholder="e.g. +91 70030 37208"
              className={inputClass}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Permanent System User Access Token">
              <div className="relative">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    cfg.meta_access_token_set
                      ? "Token Saved securely — enter new token only to replace"
                      : "Paste Meta Permanent System User Access Token (EAA5...)"
                  }
                  autoComplete="new-password"
                  className={inputClass}
                />
                {cfg.meta_access_token_set && !token && (
                  <span className="absolute right-3 top-2.5 inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" /> Active & Saved
                  </span>
                )}
              </div>
            </Field>
          </div>

          {provider === "local_gateway" && (
            <div className="md:col-span-2">
              <Field label="Gateway URL (Local / Baileys)">
                <input
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          <a
            href="https://developers.facebook.com/apps/4054888994648563/whatsapp-business/wa-dev-console/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Meta Developer Console <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href="https://business.facebook.com/wa/manage/phone-numbers/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            WhatsApp Manager Phone Numbers <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      {/* 2. Webhook Setup for Inbound Messages & Delivery Receipts */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Meta Webhook Configuration</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Paste these credentials in Meta App Dashboard → WhatsApp → Configuration → Webhook to receive delivery receipts and customer replies.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-800/60">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Callback URL</span>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <code className="truncate text-xs font-mono text-slate-800 dark:text-slate-200">
                {webhookUrl || "/api/whatsapp/webhook"}
              </code>
              <button
                onClick={() => copyToClipboard(webhookUrl, "webhook_url")}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-700 dark:text-slate-200"
              >
                {copiedField === "webhook_url" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === "webhook_url" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-white/10 dark:bg-slate-800/60">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Verify Token</span>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <code className="truncate text-xs font-mono text-slate-800 dark:text-slate-200">
                {cfg.meta_verify_token || "SarkarCafe_WA_Verify_9K7mX4_2026"}
              </code>
              <button
                onClick={() => copyToClipboard(cfg.meta_verify_token || "SarkarCafe_WA_Verify_9K7mX4_2026", "verify_token")}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-700 dark:text-slate-200"
              >
                {copiedField === "verify_token" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === "verify_token" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Connection Test */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Connection Test</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Send a server-side test message directly using the saved Meta Cloud API credentials.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="Recipient 10-digit mobile (e.g. 7003037208)"
            className={`${inputClass} sm:max-w-sm`}
          />

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={useTemplate}
              onChange={(e) => setUseTemplate(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Use pre-approved &quot;hello_world&quot; template (bypasses 24h window limit)
          </label>

          <button
            onClick={testConnection}
            disabled={testing || !testPhone.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            <Send className="h-3.5 w-3.5" />
            {testing ? "Sending..." : "Send Test"}
          </button>
        </div>

        {message && (
          <div
            className={`mt-4 rounded-xl p-3.5 text-xs font-semibold leading-5 ${
              message.ok
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {testDiagnostic?.errorCode === 133010 && (
          <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Fix Required: Complete 1-Time Verification in Meta WhatsApp Manager</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed">
              Meta Cloud API recognized your WhatsApp Business Account (<strong>Sarkar Communication</strong>), but blocked outbound messages because the phone number <strong>{displayPhone || "+91 70030 37208"}</strong> has not completed ownership OTP verification yet.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={testDiagnostic.verifyUrl || cfg.meta_live?.direct_verify_url || `https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=2078690092683215&asset_id=${wabaId || "448036473626878"}&waba_id=${wabaId || "448036473626878"}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700"
              >
                Verify in WhatsApp Manager <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
              >
                Meta Developer Console <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <span className="text-[11px] text-amber-800 dark:text-amber-300">
                (Click ⚙️ icon for PIN, or use Developer Console for SMS OTP)
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 4. Automatic ERP Event Notifications */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <h2 className="text-lg font-black text-slate-900 dark:text-white">Automated Event Triggers</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure which store transactions automatically dispatch WhatsApp notifications to customers and staff.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(cfg.automations).map(([key, enabled]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key as keyof WhatsAppAutomationRules)}
              className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
            >
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{labelize(key)}</span>
              <span
                className={`h-6 w-11 rounded-full p-1 transition-colors ${
                  enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-5 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Save Automation Settings
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-white/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900";

function labelize(key: string) {
  return key
    .replace(/^auto_send_/, "")
    .split("_")
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(" ");
}

