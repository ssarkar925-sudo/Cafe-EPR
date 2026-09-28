"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Key,
  Cpu,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
  ExternalLink,
  ShieldCheck,
  Check,
} from "lucide-react";
import {
  PROVIDER_CATALOG,
  type AIProviderId,
} from "@/lib/ai/multi-provider-engine";

export default function AIProviderPanel({ active }: { active: boolean }) {
  const [provider, setProvider] = useState<AIProviderId>("gemini");
  const [model, setModel] = useState("gemini-2.5-pro");
  const [apiKey, setApiKey] = useState("");
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [endpointUrl, setEndpointUrl] = useState("");
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    reply?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load current saved configuration
  useEffect(() => {
    if (!active) return;
    async function loadConfig() {
      setLoading(true);
      try {
        const res = await fetch("/api/ai/provider-config", { cache: "no-store" });
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : {};
        if (res.ok) {
          const loadedProvider = data.provider || "gemini";
          setProvider(loadedProvider);
          setModel(data.model || PROVIDER_CATALOG[loadedProvider as AIProviderId]?.defaultModel || "gemini-2.5-pro");
          setMaskedKeys(data.maskedKeys || (data.maskedKey ? { [loadedProvider]: data.maskedKey } : {}));
          setEndpointUrl(data.endpointUrl || "");
          setFallbackEnabled(data.fallbackEnabled !== false);
        }
      } catch (err: any) {
        setNotice({ type: "error", text: err?.message || "Failed to load AI configuration" });
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, [active]);

  const selectedProviderMeta = PROVIDER_CATALOG[provider] || PROVIDER_CATALOG.gemini;
  const currentMaskedKey = maskedKeys[provider] || "";
  const hasLinkedKey = Boolean(currentMaskedKey && currentMaskedKey.length > 5);

  // Handle provider switch
  function handleSelectProvider(newProvider: AIProviderId) {
    setProvider(newProvider);
    setModel(PROVIDER_CATALOG[newProvider]?.defaultModel || "");
    setApiKey(""); // clear fresh input so new key can be entered if desired
    setTestResult(null);
    setNotice(null);
  }

  // Test live connection
  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/provider-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey: apiKey || undefined,
          endpointUrl,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || `Server returned invalid response (HTTP ${res.status})`);
      }
      setTestResult(data);
      if (data.success) {
        setNotice({
          type: "success",
          text: `Success: Connection to ${selectedProviderMeta.name} (${model}) verified in ${data.latencyMs}ms!`,
        });
      } else {
        setNotice({
          type: "error",
          text: `Test failed: ${data.error || "Unable to reach provider"}`,
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Connection test failed";
      setTestResult({ success: false, error: msg });
      setNotice({ type: "error", text: msg });
    } finally {
      setTesting(false);
    }
  }

  // Save configuration
  async function saveConfiguration() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/provider-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          apiKey,
          endpointUrl,
          fallbackEnabled,
        }),
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(text || `Server returned invalid response (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || "Failed to save configuration");

      if (data.maskedKeys) {
        setMaskedKeys(data.maskedKeys);
      } else if (apiKey) {
        setMaskedKeys((prev) => ({
          ...prev,
          [provider]: `${apiKey.slice(0, 4)}••••••••${apiKey.slice(-4)}`,
        }));
      }

      setNotice({
        type: "success",
        text: `Configuration Saved & Activated! Active Provider: ${selectedProviderMeta.name} | Model: ${model} | API Key Linked ✓`,
      });
      setApiKey("");
    } catch (err: any) {
      setNotice({ type: "error", text: err?.message || "Failed to save configuration" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-xs font-bold text-slate-400">
        Loading AI provider settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-900 to-indigo-950 p-4 text-white shadow-sm dark:border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-black">AI Model & API Provider Engine</h3>
        </div>
        <p className="text-xs text-slate-300">
          Switch background intelligence models between Google Gemini, OpenAI, Anthropic Claude, Groq, and OpenRouter. Enter your custom API keys for direct high-speed quota.
        </p>
      </div>

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-bold ${
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
          }`}
        >
          {notice.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Provider Selector Cards */}
      <div className="space-y-2">
        <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
          1. Select Active Provider
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {(Object.keys(PROVIDER_CATALOG) as AIProviderId[]).map((pId) => {
            const p = PROVIDER_CATALOG[pId];
            const isSelected = provider === pId;
            return (
              <button
                key={pId}
                type="button"
                onClick={() => handleSelectProvider(pId)}
                className={`flex flex-col text-left p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {p.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Selection Dropdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            2. Model Selection ({selectedProviderMeta.name})
          </label>
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
            High-Intelligence & Speed Options Available
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          >
            {selectedProviderMeta.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.tag ? `★ [${m.tag}]` : ""}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Or enter custom model ID..."
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-950 dark:text-white"
          />
        </div>
        {/* Quick select pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-bold text-slate-400 mr-1">Quick Select:</span>
          {selectedProviderMeta.models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition flex items-center gap-1 active:scale-95 ${
                model === m.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              <span>{m.name}</span>
              {m.tag && (
                <span className={`text-[8px] uppercase tracking-wider px-1 py-0.2 rounded ${model === m.id ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                  {m.tag}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* API Key Management */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            3. {selectedProviderMeta.name} API Key
          </label>
          {hasLinkedKey && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Linked & Active ✓ ({currentMaskedKey})</span>
            </span>
          )}
        </div>

        {/* Informative Key Status Pill */}
        {hasLinkedKey && !apiKey && (
          <div className="flex items-center justify-between rounded-xl bg-slate-100/80 px-3.5 py-2 text-xs border border-slate-200/80 dark:bg-slate-900/60 dark:border-white/5">
            <span className="text-slate-600 dark:text-slate-300 font-medium">
              Saved Secret Key: <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{currentMaskedKey}</code>
            </span>
            <span className="text-[10px] font-bold text-slate-400">
              Ready to execute
            </span>
          </div>
        )}

        <div className="relative flex items-center">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasLinkedKey
                ? `Key linked (${currentMaskedKey}). Enter new key only to replace.`
                : `Enter your ${selectedProviderMeta.name} API Key (e.g. ${provider === "gemini" ? "AIzaSy..." : "sk-..."})`
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-20 text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const clip = await navigator.clipboard.readText();
                  if (clip) setApiKey(clip.trim());
                } catch {}
              }}
              className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            >
              Paste
            </button>
          </div>
        </div>
      </div>

      {/* Custom Base URL (Optional) */}
      {(provider === "openrouter" || provider === "openai" || provider === "groq") && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Custom Base URL (Optional / Proxy)
          </label>
          <input
            type="text"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            placeholder="e.g. https://api.openai.com/v1 or https://openrouter.ai/api/v1"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
        </div>
      )}

      {/* Fallback Option */}
      <label className="flex items-center gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={fallbackEnabled}
          onChange={(e) => setFallbackEnabled(e.target.checked)}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
        />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
          Enable automatic fallback to Gemini / Heuristic core if this provider rate-limits or fails
        </span>
      </label>

      {/* Test Connection Output */}
      {testResult && (
        <div
          className={`rounded-2xl border p-4 space-y-1.5 text-xs ${
            testResult.success
              ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center justify-between font-black">
            <span className="flex items-center gap-1.5">
              {testResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-rose-600" />}
              <span>{testResult.success ? "Connection Verified ✓" : "Test Failed"}</span>
            </span>
            {testResult.latencyMs && (
              <span className="font-mono text-[11px] font-bold">
                {testResult.latencyMs} ms
              </span>
            )}
          </div>
          {testResult.reply && <p className="text-[11px] italic">Reply: {testResult.reply}</p>}
          {testResult.error && <p className="text-[11px] font-semibold">{testResult.error}</p>}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 pt-2">
        <button
          type="button"
          onClick={testConnection}
          disabled={testing || (!apiKey && !hasLinkedKey)}
          className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-800 hover:bg-slate-50 transition active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
        >
          <Zap className="h-4 w-4 text-amber-500" />
          <span>{testing ? "Testing Ping…" : "Test API Key & Model"}</span>
        </button>

        <button
          type="button"
          onClick={saveConfiguration}
          disabled={saving}
          className="flex-1 flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-xs font-black text-white shadow-md hover:brightness-110 transition active:scale-95 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          <span>{saving ? "Saving…" : "Save & Activate Model"}</span>
        </button>
      </div>
    </div>
  );
}
