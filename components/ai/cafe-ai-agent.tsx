"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const quickCommands = [
  { label: "⚡ Quick Sale", query: "Create a quick sale for 2 coffee and 1 sandwich, UPI.", category: "Billing" },
  { label: "💼 P&L This Month", query: "Calculate profit and loss for this month", category: "Finance" },
  { label: "👥 Khata Dues", query: "Show customer Khata dues summary", category: "Khata" },
  { label: "📦 Low Stock", query: "Check low stock items and reorder alerts", category: "Inventory" },
  { label: "🧠 Teach Rule", query: "Remember that Xerox is 3 rupees per page", category: "Learning" },
  { label: "💬 WhatsApp Health", query: "Is WhatsApp gateway connected?", category: "System" },
  { label: "📄 Recent Orders", query: "Show recent transactions", category: "Operations" },
];

type ApprovalSummary = {
  approval_id: string;
  customer: string;
  payment_method: string;
  total: number;
  items: { name: string; qty: number; rate: number; amount: number }[];
};

type MemoryItem = {
  id: string;
  category: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  updated_at: string;
};

type SpeechRecognitionEventLike = Event & { results: { [index: number]: { [index: number]: { transcript: string } } }; resultIndex: number };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const LANGUAGE_OPTIONS = [
  { key: "en", label: "English", speechLang: "en-IN" },
  { key: "hi", label: "हिन्दी", speechLang: "hi-IN" },
  { key: "bn", label: "বাংলা", speechLang: "bn-IN" },
] as const;

type LanguageKey = (typeof LANGUAGE_OPTIONS)[number]["key"];

export default function CafeAIAgent() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const [language, setLanguage] = useState<LanguageKey>("en");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const selectedLanguage = LANGUAGE_OPTIONS.find((item) => item.key === language) ?? LANGUAGE_OPTIONS[0];

  async function loadMemories() {
    try {
      const res = await fetch("/api/ai/memory", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.memories)) {
        setMemories(data.memories);
      }
    } catch {
      // silent fallback
    }
  }

  useEffect(() => {
    void loadMemories();
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  async function translateText(text: string, targetLanguage: LanguageKey, sourceLanguage = "auto") {
    const value = text.trim();
    if (!value || targetLanguage === sourceLanguage) return value;

    setTranslating(true);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, targetLanguage, sourceLanguage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Cafe AI translation is unavailable");
      return typeof data?.translatedText === "string" && data.translatedText.trim() ? data.translatedText.trim() : value;
    } finally {
      setTranslating(false);
    }
  }

  async function localizeOutput(text: string) {
    if (language === "en") return text;
    return translateText(text, language, "en");
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*#`_>]/g, "").replace(/\n+/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = selectedLanguage.speechLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function changeLanguage(nextLanguage: LanguageKey) {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
    setLanguage(nextLanguage);
  }

  async function ask(text = message, readAloud = true, inputLanguage = "auto") {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setReply("");
    setApproval(null);
    try {
      const canonicalValue = language === "en"
        ? value
        : await translateText(value, "en", inputLanguage);

      // Fast-path quick-sale intent
      if (/\b(?:sell|create\s+(?:a\s+)?(?:quick\s+)?sale|bill|invoice)\b/i.test(canonicalValue)) {
        const quick = await fetch("/api/ai/quick-sale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: canonicalValue }),
        });
        const quickData = await quick.json();
        if (quick.ok && quickData?.action === "approval_required") {
          setApproval({ approval_id: quickData.approval_id, ...quickData.summary });
          const approvalMessage = await localizeOutput(quickData.message || "I prepared the sale. Please review and approve it.");
          setReply(approvalMessage);
          if (readAloud) speak(approvalMessage);
          return;
        }
        if (quick.ok && quickData?.action === "needs_input") {
          const inputMessage = await localizeOutput(quickData.message || "I need more information before preparing the sale.");
          setReply(inputMessage);
          if (readAloud) speak(inputMessage);
          return;
        }
      }

      // Main Agent endpoint
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: canonicalValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Cafe AI is unavailable");

      if (data.approvalRequired && data.approval) {
        setApproval({
          approval_id: data.approval.id,
          customer: data.approval.customer || data.approval.customer_name || "Walk-in customer",
          payment_method: data.approval.paymentMethod || data.approval.payment_method || "cash",
          total: Number(data.approval.rawTotal || data.approval.total || 0),
          items: (data.approval.items || []).map((it: any) => ({
            name: it.name,
            qty: Number(it.qty || 1),
            rate: typeof it.rate === "number" ? it.rate : parseFloat(String(it.rate).replace(/[^\d.]/g, "")) || 0,
            amount: typeof it.amount === "number" ? it.amount : parseFloat(String(it.amount).replace(/[^\d.]/g, "")) || 0,
          })),
        });
      }

      const responseMessage = await localizeOutput(data.message || "No response");
      setReply(responseMessage);
      if (readAloud) speak(responseMessage);

      // If memory was saved/taught, refresh memories list
      if (data.toolsUsed?.includes("save_memory") || data.toolsUsed?.includes("forget_memory") || /learned/i.test(data.message)) {
        void loadMemories();
      }
    } catch (e) {
      const messageText = e instanceof Error ? e.message : "Cafe AI is unavailable";
      setError(messageText);
      if (readAloud) speak(messageText);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not supported by this browser. Use Chrome or Edge and allow microphone access.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = selectedLanguage.speechLang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript?.trim() ?? "";
      setMessage(transcript);
      if (transcript) void ask(transcript, true, language);
    };
    recognition.onerror = () => {
      setListening(false);
      setError("I could not hear that clearly. Check microphone permission and try again.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function toggleListening() {
    if (listening) stopListening();
    else startListening();
  }

  async function approveQuickSale() {
    if (!approval || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/ai/agent/approval/${approval.approval_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Owner approved quick sale from Cafe AI." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Approval failed");
      if (!data.executed) throw new Error("Approval was recorded but the sale was not executed.");
      const invoice = data.sale?.invoice_number || data.sale?.invoice_id || "created";
      const completionMessage = await localizeOutput(`Quick sale completed. Invoice ${invoice} was created in Cafe-EPR.`);
      setReply(`✓ ${completionMessage}`);
      setApproval(null);
      speak(completionMessage);
    } catch (e) {
      const messageText = e instanceof Error ? e.message : "Approval failed";
      setError(messageText);
      speak(messageText);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id: string) {
    try {
      await fetch("/api/ai/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // ignore
    }
  }

  async function teachDirectRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newRuleText.trim() || savingRule) return;
    setSavingRule(true);
    try {
      const parts = newRuleText.split(/[:=\-–—]| is | gets | costs | should /i);
      const key = (parts[0] || newRuleText.slice(0, 25)).trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
      await fetch("/api/ai/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "instruction", memory_key: key, memory_value: newRuleText.trim() }),
      });
      setNewRuleText("");
      await loadMemories();
    } finally {
      setSavingRule(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header Banner */}
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300 backdrop-blur-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Autonomous Shop Assistant & Self-Learner
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl text-white">Cafe AI Agent</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              High-efficiency ERP assistant with voice & multilingual intelligence. Autonomously learns shop rules, drafts quick invoices with stock & GST verification, monitors Khata dues, and manages daily operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsMemoryModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-purple-400/40 bg-purple-500/20 px-4 py-3 text-xs font-black text-purple-200 shadow-md backdrop-blur-xs transition hover:bg-purple-500/30 active:scale-95"
            >
              <span>🧠 Learned Memories ({memories.length})</span>
            </button>
            <Link
              href="/ai-agent/learning"
              className="rounded-2xl border border-indigo-400/30 bg-indigo-500/15 px-4 py-3 text-xs font-black text-indigo-200 shadow-xs backdrop-blur-xs transition hover:bg-indigo-500/25 active:scale-95"
            >
              Workflow Engine
            </Link>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs backdrop-blur-xs">
              <div className="font-black text-emerald-300">OWNER CONTROL ACTIVE</div>
              <div className="mt-0.5 text-slate-300 text-[11px]">1-Click Owner Approval for Writes</div>
            </div>
          </div>
        </div>

        {/* Quick Command Chips */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
          <span className="text-xs font-bold text-slate-400 mr-1">Quick Actions:</span>
          {quickCommands.map((cmd) => (
            <button
              key={cmd.query}
              onClick={() => {
                setMessage(cmd.query);
                void ask(cmd.query, true, "auto");
              }}
              disabled={busy}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-400 hover:bg-indigo-500/20 active:scale-95 disabled:opacity-50"
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </section>

      {/* Main Interactive Stage */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Command Console</h2>
              <p className="text-xs text-slate-500">Voice or text · English · हिन्दी · বাংলা · Mixed Language</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-slate-500" htmlFor="ai-language">Language</label>
              <select
                id="ai-language"
                value={language}
                onChange={(e) => changeLanguage(e.target.value as LanguageKey)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
              {language !== "en" && (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                  Translation ON
                </span>
              )}
              <button
                type="button"
                onClick={toggleListening}
                disabled={busy}
                className={`rounded-xl px-3 py-2 text-xs font-black transition-all active:scale-95 ${
                  listening
                    ? "bg-rose-600 text-white animate-pulse"
                    : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                }`}
                title={listening ? "Stop listening" : "Speak to Cafe AI"}
              >
                {listening ? "■ Stop" : "🎙 Speak"}
              </button>
              {(speaking || translating) && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {translating ? "Translating…" : "Speaking…"}
                </span>
              )}
            </div>
          </div>

          {/* Response Display */}
          <div className="min-h-56 rounded-2xl bg-slate-50 p-5 dark:bg-slate-950/60 border border-slate-100 dark:border-white/5">
            {reply ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {reply}
              </div>
            ) : (
              <div className="flex h-44 flex-col items-center justify-center text-center text-slate-400">
                <span className="text-3xl mb-2">⚡</span>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">How can I assist your shop today?</p>
                <p className="text-xs text-slate-400 max-w-md mt-1">
                  Try &quot;Sell 2 coffee cash&quot;, &quot;Show P&L this month&quot;, &quot;Who owes money?&quot;, or teach me a rule: &quot;Remember Xerox is ₹3/page&quot;.
                </p>
              </div>
            )}

            {/* Owner Approval Modal / Card */}
            {approval && (
              <div className="mt-5 rounded-2xl border-2 border-amber-400/80 bg-amber-50/90 p-5 shadow-lg dark:border-amber-500/40 dark:bg-amber-950/40">
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-500/20 pb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                      Owner Approval Required
                    </div>
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      Verified catalog prices & stock checked. No database write has occurred yet.
                    </div>
                  </div>
                  <div className="text-2xl font-black text-amber-900 dark:text-amber-100">
                    ₹{approval.total.toFixed(2)}
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-800 dark:text-slate-200">
                  <div className="font-bold text-slate-600 dark:text-slate-400">Order Items:</div>
                  <div className="rounded-xl bg-white/70 dark:bg-slate-900/60 p-3 space-y-1.5 border border-amber-200/60 dark:border-amber-500/20">
                    {approval.items.map((item) => (
                      <div key={`${item.name}-${item.qty}`} className="flex justify-between font-medium">
                        <span>{item.qty} × {item.name}</span>
                        <span className="font-bold">₹{item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between pt-1 font-bold text-[11px] text-slate-600 dark:text-slate-300">
                    <span>Payment Method: <span className="uppercase text-indigo-600 dark:text-indigo-400">{approval.payment_method}</span></span>
                    <span>Customer: <span className="text-slate-900 dark:text-white">{approval.customer}</span></span>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={approveQuickSale}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                  >
                    {busy ? "Executing Sale…" : "✓ Approve & Generate Invoice"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setApproval(null)}
                    disabled={busy}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition active:scale-95 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Input Bar */}
          <div className="mt-4 flex gap-2">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask();
              }}
              placeholder="e.g. Sell 2 coffee and 1 sandwich UPI, or: Remember John gets 10% off"
              className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-white"
            />
            <button
              onClick={() => void ask()}
              disabled={busy || !message.trim()}
              className="rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3 text-sm font-black text-white shadow-md shadow-indigo-600/25 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {busy ? "Working…" : "Execute"}
            </button>
          </div>
        </div>

        {/* Side Panel: System Pulse & Self-Learner Capabilities */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">🧠 Self-Learner Engine</h2>
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {memories.length} Active Rules
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Teach the agent custom shop rules, customer habits, or price guidelines in natural language:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  const cmd = "Remember that customer Ramesh gets 5% discount";
                  setMessage(cmd);
                  void ask(cmd, true, "auto");
                }}
                className="w-full text-left rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 text-xs text-purple-900 hover:bg-purple-100/70 dark:border-purple-500/20 dark:bg-purple-950/20 dark:text-purple-200 transition"
              >
                &ldquo;Remember customer Ramesh gets 5% discount&rdquo;
              </button>
              <button
                onClick={() => {
                  const cmd = "Remember that Xerox is 3 rupees per page";
                  setMessage(cmd);
                  void ask(cmd, true, "auto");
                }}
                className="w-full text-left rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 text-xs text-purple-900 hover:bg-purple-100/70 dark:border-purple-500/20 dark:bg-purple-950/20 dark:text-purple-200 transition"
              >
                &ldquo;Remember that Xerox is 3 rupees per page&rdquo;
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-500/20 dark:bg-amber-950/20">
            <h2 className="text-sm font-black text-amber-900 dark:text-amber-200">Security & Operational Safety</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
              <li>✓ <strong>Owner-in-the-Loop</strong>: Consequential changes (sales, invoices) require 1-click owner approval.</li>
              <li>✓ <strong>Catalog Verification</strong>: Real-time price and inventory checks prevent over-selling.</li>
              <li>✓ <strong>Privacy Safe</strong>: Passwords, OTPs, and private keys are never accessed or stored.</li>
              <li>✓ <strong>Offline Core</strong>: Heuristic intelligence operates seamlessly even when external LLMs are unreachable.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Memory Inspector & Teaching Modal */}
      {isMemoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">🧠 Learned AI Memories & Rules</h3>
                <p className="text-xs text-slate-500">Knowledge the AI agent has learned from you to automate your shop.</p>
              </div>
              <button
                onClick={() => setIsMemoryModalOpen(false)}
                className="rounded-xl border border-slate-200 p-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
              >
                ✕ Close
              </button>
            </div>

            {/* Direct Rule Input */}
            <form onSubmit={teachDirectRule} className="my-4 flex gap-2">
              <input
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder="Teach new rule (e.g. Minimum UPI order is ₹20)"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="submit"
                disabled={savingRule || !newRuleText.trim()}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50"
              >
                {savingRule ? "Saving…" : "+ Learn Rule"}
              </button>
            </form>

            {/* Stored Rules List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {memories.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No custom rules learned yet. You can teach rules by saying &ldquo;Remember that...&rdquo; or adding them above.
                </div>
              ) : (
                memories.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-white/5 dark:bg-slate-950/50"
                  >
                    <div>
                      <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 mr-2">
                        {m.category}
                      </span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {typeof m.memory_value === "string" ? m.memory_value : JSON.stringify(m.memory_value)}
                      </span>
                    </div>
                    <button
                      onClick={() => void deleteMemory(m.id)}
                      className="text-rose-500 hover:text-rose-700 text-[11px] font-bold ml-3"
                    >
                      Forget
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
