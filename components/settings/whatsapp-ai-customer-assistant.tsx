"use client";

import { useEffect, useState } from "react";

type AISettings = {
  enabled: boolean;
  language: "auto" | "English" | "Hindi" | "Bengali";
  tone: "friendly_direct" | "professional" | "concise";
  instructions: string;
};

type ConfigResponse = {
  provider: "off" | "meta" | "local_gateway" | "ultramsg";
  gateway_url?: string;
  meta_phone_number_id?: string;
  automations: Record<string, boolean>;
  ai_customer_reply: AISettings;
};

const DEFAULT_AI: AISettings = {
  enabled: false,
  language: "auto",
  tone: "friendly_direct",
  instructions: "",
};

export default function WhatsAppAICustomerAssistant() {
  const [cfg, setCfg] = useState<ConfigResponse | null>(null);
  const [ai, setAi] = useState<AISettings>(DEFAULT_AI);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const res = await fetch("/api/whatsapp/config", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as ConfigResponse;
    setCfg(data);
    setAi({ ...DEFAULT_AI, ...(data.ai_customer_reply || {}) });
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: cfg.provider,
          gateway_url: cfg.gateway_url || "",
          meta_phone_number_id: cfg.meta_phone_number_id || "",
          automations: cfg.automations,
          ai_customer_reply: ai,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save AI settings");
      setMessage({ ok: true, text: ai.enabled ? "AI customer replies are enabled." : "AI customer replies are disabled." });
      await load();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Could not save AI settings" });
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">Loading AI customer assistant…</section>;
  }

  return (
    <section className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm dark:border-indigo-500/20 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">WhatsApp Intelligent Assistant</p>
          <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Customer replies by Cafe AI</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            When a customer messages your official WhatsApp number, Cafe AI can understand the message, use your live shop catalog, continue the recent conversation, and reply naturally in Bengali, Hindi, English, or mixed language.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-black ${ai.enabled ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          {ai.enabled ? "AUTO-REPLY ON" : "AUTO-REPLY OFF"}
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 dark:border-white/10 md:col-span-3">
          <span>
            <span className="block text-sm font-black text-slate-800 dark:text-white">Enable intelligent customer replies</span>
            <span className="mt-1 block text-xs text-slate-500">Disabled by default. You explicitly turn this on.</span>
          </span>
          <input
            type="checkbox"
            checked={ai.enabled}
            onChange={(e) => setAi((old) => ({ ...old, enabled: e.target.checked }))}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>

        <label className="block rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <span className="mb-1.5 block text-xs font-bold text-slate-500">Reply language</span>
          <select value={ai.language} onChange={(e) => setAi((old) => ({ ...old, language: e.target.value as AISettings["language"] }))} className={inputClass}>
            <option value="auto">Auto — match customer</option>
            <option value="English">English</option>
            <option value="Hindi">हिन्दी</option>
            <option value="Bengali">বাংলা</option>
          </select>
        </label>

        <label className="block rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <span className="mb-1.5 block text-xs font-bold text-slate-500">Conversation style</span>
          <select value={ai.tone} onChange={(e) => setAi((old) => ({ ...old, tone: e.target.value as AISettings["tone"] }))} className={inputClass}>
            <option value="friendly_direct">Friendly & direct</option>
            <option value="professional">Professional</option>
            <option value="concise">Very concise</option>
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
          <span className="mb-1.5 block text-xs font-bold text-slate-500">Current channel</span>
          <span className="text-sm font-black text-slate-800 dark:text-white">{cfg.provider === "meta" ? "Meta WhatsApp Cloud API" : cfg.provider}</span>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Your instructions to the customer assistant</span>
        <textarea
          value={ai.instructions}
          onChange={(e) => setAi((old) => ({ ...old, instructions: e.target.value }))}
          rows={4}
          placeholder="Example: Be straightforward. Tell customers today's available services and ask them to call the shop for account-specific or payment issues."
          className={`${inputClass} resize-y`}
        />
      </label>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-200">
          <div className="font-black">What AI can do</div>
          <div className="mt-2">Answer normal customer questions, check the current catalog, continue conversation context, suggest services, and ask follow-up questions when something is unclear.</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="font-black">What AI cannot do</div>
          <div className="mt-2">It cannot perform or confirm AEPS, DMT, UPI, recharge, payment, refund, transfer, or account-changing actions. It also will not expose private customer data or secrets.</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={() => void save()} disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save AI Reply Settings"}</button>
        <span className="text-xs text-slate-500">You can switch this off at any time.</span>
      </div>
      {message && <div className={`mt-4 rounded-xl p-3 text-xs font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"}`}>{message.text}</div>}
    </section>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white";
