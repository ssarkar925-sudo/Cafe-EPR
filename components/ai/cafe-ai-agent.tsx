"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ─── SAI Identity ─────────────────────────────────────────────────────────────
const SAI_NAME = "SAI";
const SAI_FULL = "Smart AI Assistant";
const SAI_GREETING = {
  en: `${SAI_NAME} online. How can I assist you today, Sir?`,
  hi: `${SAI_NAME} तैयार है। बताइए, Sir।`,
  bn: `${SAI_NAME} প্রস্তুত। বলুন স্যার।`,
};

const quickCommands = [
  { label: "⚡ New Sale", query: "Create a sale for 2 coffee and 1 sandwich, UPI.", category: "Billing" },
  { label: "📱 Bank SMS", query: "Collect data from this SMS: Dear SBI User, Rs 2,500.00 credited to A/c ending 4589 on 14-Sep-26 by UPI/425819283748/Rahul Kumar. Avail Bal: Rs 14,200.00", category: "SMS" },
  { label: "🧾 Portal Data", query: "Collect data from portal: CSC DigiPay AEPS Cash Withdrawal Successful. Amount: Rs 3000.00. RRN: 987654321012. Bank: PNB. Commission: Rs 6.00.", category: "Portal" },
  { label: "🌐 Web Scrape", query: "Collect data from https://httpbin.org/json", category: "Web" },
  { label: "💼 P&L This Month", query: "Calculate profit and loss for this month", category: "Finance" },
  { label: "👥 Khata Dues", query: "Show customer Khata dues summary", category: "Khata" },
  { label: "📦 Low Stock", query: "Check low stock items and reorder alerts", category: "Inventory" },
  { label: "🧠 Teach Rule", query: "Remember that Xerox is 3 rupees per page", category: "Learning" },
];

type ApprovalSummary = {
  approval_id: string;
  action?: string;
  customer?: string;
  payment_method?: string;
  total?: number;
  items?: { name: string; qty: number; rate: number; amount: number }[];
  portal?: string;
  count?: number;
  reference?: string;
  amount?: number;
};

type MemoryItem = {
  id: string;
  category: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  updated_at: string;
};

type ChatMessage = {
  role: "user" | "sai";
  text: string;
  ts: number;
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

// ─── Wave Bars Animation ───────────────────────────────────────────────────────
function WaveBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            animationDelay: `${i * 0.1}s`,
            animationDuration: `${0.5 + i * 0.07}s`,
          }}
          className={`w-[3px] rounded-full bg-cyan-400 transition-all ${
            active ? "animate-bounce" : "h-[4px] opacity-40"
          }`}
        />
      ))}
    </div>
  );
}

// ─── SAI Orb ──────────────────────────────────────────────────────────────────
function SaiOrb({ busy, speaking, listening }: { busy: boolean; speaking: boolean; listening: boolean }) {
  const state = listening ? "listening" : speaking ? "speaking" : busy ? "thinking" : "idle";
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring */}
      <div
        className={`absolute rounded-full border-2 transition-all duration-700 ${
          state === "listening"
            ? "h-20 w-20 border-rose-400/60 animate-ping"
            : state === "speaking"
            ? "h-20 w-20 border-cyan-400/50 animate-pulse"
            : state === "thinking"
            ? "h-20 w-20 border-indigo-400/40 animate-spin"
            : "h-16 w-16 border-cyan-500/20"
        }`}
      />
      {/* Middle ring */}
      <div
        className={`absolute rounded-full border transition-all duration-500 ${
          state === "listening"
            ? "h-14 w-14 border-rose-400/70"
            : state === "speaking"
            ? "h-14 w-14 border-cyan-400/70 animate-pulse"
            : state === "thinking"
            ? "h-14 w-14 border-indigo-400/50"
            : "h-12 w-12 border-cyan-600/30"
        }`}
      />
      {/* Core orb */}
      <div
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-black transition-all duration-300 shadow-lg ${
          state === "listening"
            ? "bg-rose-500 text-white shadow-rose-500/50"
            : state === "speaking"
            ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/50"
            : state === "thinking"
            ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-indigo-500/40"
            : "bg-gradient-to-br from-slate-700 to-slate-900 text-cyan-400 shadow-cyan-900/30 border border-cyan-500/30"
        }`}
      >
        {state === "listening" ? "👂" : state === "speaking" ? "💬" : state === "thinking" ? "⟳" : "S"}
      </div>
    </div>
  );
}

export default function CafeAIAgent() {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
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
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedLanguage = LANGUAGE_OPTIONS.find((item) => item.key === language) ?? LANGUAGE_OPTIONS[0];

  // ── Voice: select best female voice ────────────────────────────────────────
  const getBestFemaleVoice = useCallback((lang: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    // Priority: female named voices for the language
    const femaleKeywords = ["female", "woman", "girl", "zira", "hazel", "google uk english female",
      "samantha", "victoria", "fiona", "moira", "veena", "lekha", "heera",
      "google hindi female", "google bengali female", "rishi"];
    const langPrefix = lang.split("-")[0];
    // First: exact lang match + female keyword
    for (const kw of femaleKeywords) {
      const v = voices.find((v) => v.lang === lang && v.name.toLowerCase().includes(kw));
      if (v) return v;
    }
    // Second: any female voice for that language family
    for (const kw of femaleKeywords) {
      const v = voices.find((v) => v.lang.startsWith(langPrefix) && v.name.toLowerCase().includes(kw));
      if (v) return v;
    }
    // Third: first available voice for that language (often female on Indian browsers)
    return voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith(langPrefix)) || null;
  }, []);

  async function loadMemories() {
    try {
      const res = await fetch("/api/ai/memory", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.memories)) setMemories(data.memories);
    } catch { /* silent */ }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cafeerp_ai_lang") as LanguageKey | null;
      if (saved && LANGUAGE_OPTIONS.some((l) => l.key === saved)) setLanguage(saved);
      const voiceSaved = localStorage.getItem("cafeerp_sai_voice");
      if (voiceSaved !== null) setVoiceEnabled(voiceSaved !== "off");
    } catch { /* ignore */ }
    void loadMemories();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
    }
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, busy]);

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
      if (!res.ok) throw new Error(data?.error || "Translation unavailable");
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
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const currencyWord = language === "hi" ? "रुपये" : language === "bn" ? "টাকা" : "rupees";
    const cleanText = text
      .replace(/₹\s*([\d,]+(?:\.\d+)?)/g, `$1 ${currencyWord}`)
      .replace(/Rs\.?\s*([\d,]+(?:\.\d+)?)/g, `$1 ${currencyWord}`)
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/[*#`_>|~]/g, "")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[(.+?)\]\(.*?\)/g, "$1")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = selectedLanguage.speechLang;
    utterance.rate = 0.92;
    utterance.pitch = 1.15; // slightly higher for female voice
    const femaleVoice = getBestFemaleVoice(selectedLanguage.speechLang);
    if (femaleVoice) utterance.voice = femaleVoice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function changeLanguage(nextLanguage: LanguageKey) {
    stopSpeaking();
    setLanguage(nextLanguage);
    try { localStorage.setItem("cafeerp_ai_lang", nextLanguage); } catch { /* ignore */ }
  }

  function toggleVoice() {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) stopSpeaking();
    try { localStorage.setItem("cafeerp_sai_voice", next ? "on" : "off"); } catch { /* ignore */ }
  }

  function addChat(role: "user" | "sai", text: string) {
    setChat((prev) => [...prev, { role, text, ts: Date.now() }]);
  }

  async function ask(text = message, readAloud = true, inputLanguage = "auto") {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    setApproval(null);
    setMessage("");
    addChat("user", value);
    try {
      const canonicalValue = language === "en" ? value : await translateText(value, "en", inputLanguage);

      // Quick-sale fast path
      const quickSalePattern = /\b(?:sell|create\s+(?:a\s+)?(?:quick\s+)?sale|bill|invoice|becho|bechna|bikriy?|বিক্রি\s+করো|বিল\s+বানাও|बिल\s+बनाओ|क्विक\s+सेल)\b/i;
      if (quickSalePattern.test(canonicalValue) && !/sms|portal|http/i.test(canonicalValue)) {
        const quick = await fetch("/api/ai/quick-sale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: canonicalValue }),
        });
        const quickData = await quick.json();
        if (quick.ok && quickData?.action === "approval_required") {
          setApproval({ approval_id: quickData.approval_id, action: "create_sale", ...quickData.summary });
          const msg = await localizeOutput(quickData.message || "I've prepared the sale, Sir. Please review and approve it.");
          addChat("sai", msg);
          if (readAloud) speak(msg);
          return;
        }
        if (quick.ok && quickData?.action === "needs_input") {
          const msg = await localizeOutput(quickData.message || "I need more information before preparing the sale, Sir.");
          addChat("sai", msg);
          if (readAloud) speak(msg);
          return;
        }
      }

      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: canonicalValue, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "SAI is temporarily unavailable");

      if (data.approvalRequired && data.approval) {
        setApproval({
          approval_id: data.approval.id,
          action: data.approval.action || (data.approval.items ? "create_sale" : data.approval.portal ? "import_portal_transactions" : "record_customer_payment"),
          customer: data.approval.customer || data.approval.customer_name || "Customer",
          payment_method: data.approval.paymentMethod || data.approval.payment_method || "upi",
          total: Number(data.approval.rawTotal || data.approval.total || data.approval.amount || 0),
          amount: Number(data.approval.amount || data.approval.total || 0),
          reference: data.approval.reference || null,
          portal: data.approval.portal || null,
          count: data.approval.count || null,
          items: Array.isArray(data.approval.items)
            ? data.approval.items.map((it: any) => ({
                name: it.name,
                qty: Number(it.qty || 1),
                rate: typeof it.rate === "number" ? it.rate : parseFloat(String(it.rate).replace(/[^\d.]/g, "")) || 0,
                amount: typeof it.amount === "number" ? it.amount : parseFloat(String(it.amount).replace(/[^\d.]/g, "")) || 0,
              }))
            : undefined,
        });
      }

      const responseMessage = data.message || "No response";
      addChat("sai", responseMessage);
      if (readAloud) speak(responseMessage);
      if (data.toolsUsed?.includes("save_memory") || data.toolsUsed?.includes("forget_memory") || /learned|सीख|শিখ/i.test(data.message)) {
        void loadMemories();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SAI is temporarily unavailable";
      setError(msg);
      if (readAloud) speak(msg);
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError(language === "bn"
        ? "এই ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়। Chrome বা Edge ব্যবহার করুন।"
        : language === "hi"
        ? "आवाज़ इनपुट इस ब्राउज़र में समर्थित नहीं है। Chrome या Edge का उपयोग करें।"
        : "Voice input is not supported. Please use Chrome or Edge."
      );
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = selectedLanguage.speechLang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (transcript) {
        setInterimText(transcript);
        setMessage(transcript);
        if ((result as any).isFinal !== false) {
          setInterimText("");
          void ask(transcript, true, language);
        }
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      setInterimText("");
      const errCode = (event as any).error;
      if (errCode === "no-speech" || errCode === "aborted") return;
      setError(language === "bn"
        ? "মাইক্রোফোন থেকে কোনো শব্দ পাওয়া যায়নি।"
        : "I could not hear that clearly. Check microphone permission."
      );
    };
    recognition.onend = () => { setListening(false); setInterimText(""); };
    recognitionRef.current = recognition;
    setListening(true);
    setError("");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
  }

  function toggleListening() {
    if (listening) stopListening();
    else startListening();
  }

  async function approveCurrentAction() {
    if (!approval || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/ai/agent/approval/${approval.approval_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Owner approved action from SAI." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Approval failed");
      if (!data.executed) throw new Error("Approval recorded but action was not executed.");
      let msg = data.message || "Action completed successfully.";
      if (data.mode === "executed") {
        const invoice = data.sale?.invoice_number || data.sale?.invoice_id || "created";
        msg = `Sale completed, Sir. Invoice ${invoice} has been created.`;
      }
      const localized = await localizeOutput(msg);
      addChat("sai", `✓ ${localized}`);
      setApproval(null);
      speak(localized);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Approval failed";
      setError(msg);
      speak(msg);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id: string) {
    try {
      await fetch("/api/ai/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch { /* ignore */ }
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

  // ── Status label ─────────────────────────────────────────────────────────────
  const statusLabel = listening
    ? (language === "bn" ? "শুনছি…" : language === "hi" ? "सुन रही हूँ…" : "Listening…")
    : speaking
    ? (language === "bn" ? "বলছি…" : language === "hi" ? "बोल रही हूँ…" : "Speaking…")
    : busy
    ? (language === "bn" ? "ভাবছি…" : language === "hi" ? "सोच रही हूँ…" : "Thinking…")
    : translating
    ? "Translating…"
    : language === "bn" ? "প্রস্তুত" : language === "hi" ? "तैयार" : "Ready";

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">

      {/* ── SAI HUD Header ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl sm:p-8">
        {/* Background glow effects */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />
          <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-indigo-500/5 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent" />
        </div>

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: SAI identity */}
          <div className="flex items-center gap-5">
            <SaiOrb busy={busy} speaking={speaking} listening={listening} />
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-black tracking-widest text-cyan-400 text-xl">{SAI_NAME}</span>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300 tracking-wider">
                  {SAI_FULL}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-1.5 text-xs font-bold ${
                  listening ? "text-rose-400" : speaking ? "text-cyan-400" : busy ? "text-indigo-400" : "text-emerald-400"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    listening ? "bg-rose-400 animate-ping" : speaking ? "bg-cyan-400 animate-pulse" : busy ? "bg-indigo-400 animate-spin" : "bg-emerald-400"
                  }`} />
                  {statusLabel}
                </span>
                <WaveBars active={speaking || listening} />
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Female Voice · Cross-Session Memory · {memories.length} Rules Learned
              </div>
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsMemoryModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-purple-400/30 bg-purple-500/10 px-4 py-2.5 text-xs font-black text-purple-300 shadow-md transition hover:bg-purple-500/20 active:scale-95"
            >
              🧠 Memories ({memories.length})
            </button>
            <Link
              href="/ai-agent/learning"
              className="rounded-2xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-2.5 text-xs font-black text-indigo-300 transition hover:bg-indigo-500/20 active:scale-95"
            >
              Workflow Engine
            </Link>
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-2.5 text-xs">
              <div className="font-black text-emerald-400">OWNER CONTROL ACTIVE</div>
              <div className="mt-0.5 text-slate-500 text-[10px]">1-Click Approval for Writes</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
          <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Actions:</span>
          {quickCommands.map((cmd) => (
            <button
              key={cmd.query}
              onClick={() => { setMessage(cmd.query); void ask(cmd.query, true, "auto"); }}
              disabled={busy}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-300 active:scale-95 disabled:opacity-40"
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Main Chat + Controls ─────────────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">

        {/* Chat Console */}
        <div className="flex flex-col rounded-3xl border border-slate-800 bg-slate-950 shadow-xl overflow-hidden">

          {/* Console header */}
          <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/80 px-5 py-3">
            <div>
              <h2 className="text-sm font-black text-white tracking-wide">SAI Console</h2>
              <p className="text-[10px] text-slate-500">Voice · Text · SMS · Portal · Web</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Language */}
              <select
                value={language}
                onChange={(e) => changeLanguage(e.target.value as LanguageKey)}
                className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs font-bold text-slate-300 outline-none focus:border-cyan-500"
              >
                {LANGUAGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              {/* Voice toggle */}
              <button
                onClick={toggleVoice}
                title={voiceEnabled ? "Mute SAI voice" : "Enable SAI voice"}
                className={`rounded-lg border px-2.5 py-1 text-xs font-black transition active:scale-95 ${
                  voiceEnabled
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400"
                    : "border-white/10 bg-white/5 text-slate-500"
                }`}
              >
                {voiceEnabled ? "🔊" : "🔇"}
              </button>
              {speaking && (
                <button
                  onClick={stopSpeaking}
                  className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-black text-rose-400 transition hover:bg-rose-500/20 active:scale-95"
                >
                  ■ Stop
                </button>
              )}
              {translating && <span className="text-[11px] font-bold text-indigo-400">Translating…</span>}
            </div>
          </div>

          {/* Chat messages */}
          <div className="flex-1 min-h-72 max-h-[420px] overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-track-slate-900 scrollbar-thumb-slate-700">
            {chat.length === 0 && (
              <div className="flex h-52 flex-col items-center justify-center text-center gap-3">
                <SaiOrb busy={false} speaking={false} listening={false} />
                <div>
                  <p className="text-sm font-bold text-slate-400">{SAI_GREETING[language]}</p>
                  <p className="text-xs text-slate-600 mt-1">Speak or type to begin</p>
                </div>
              </div>
            )}

            {chat.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-black ${
                  msg.role === "sai"
                    ? "bg-gradient-to-br from-cyan-600 to-blue-700 text-white"
                    : "bg-slate-700 text-slate-300"
                }`}>
                  {msg.role === "sai" ? "S" : "U"}
                </div>
                {/* Bubble */}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "sai"
                    ? "rounded-tl-sm bg-gradient-to-br from-slate-800 to-slate-900 text-slate-100 border border-cyan-500/10 shadow-sm"
                    : "rounded-tr-sm bg-indigo-600 text-white shadow-sm"
                }`}>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
              </div>
            ))}

            {/* Thinking indicator */}
            {busy && (
              <div className="flex gap-2">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-[11px] font-black text-white">S</div>
                <div className="rounded-2xl rounded-tl-sm bg-slate-800 border border-cyan-500/10 px-4 py-3 text-sm text-slate-400">
                  <span className="inline-flex gap-1 items-center">
                    <span className="animate-bounce [animation-delay:0s]">●</span>
                    <span className="animate-bounce [animation-delay:0.15s]">●</span>
                    <span className="animate-bounce [animation-delay:0.3s]">●</span>
                  </span>
                </div>
              </div>
            )}

            {/* Approval card */}
            {approval && (
              <div className="mt-2 rounded-2xl border-2 border-amber-400/50 bg-amber-950/40 p-4 shadow-lg">
                <div className="flex items-center justify-between gap-3 border-b border-amber-400/20 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-amber-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      {approval.action === "record_customer_payment" ? "Record Khata Payment"
                        : approval.action === "import_portal_transactions" ? "Stage Portal Transactions"
                        : "Owner Approval Required"}
                    </div>
                    <div className="text-[11px] text-amber-400/70 mt-0.5">
                      {approval.action === "record_customer_payment" ? "Verify payment details before updating Khata."
                        : approval.action === "import_portal_transactions" ? "Stage parsed portal records for reconciliation."
                        : "Catalog prices & stock verified. No write has occurred yet."}
                    </div>
                  </div>
                  <div className="text-xl font-black text-amber-200">
                    ₹{((approval.amount || approval.total || 0)).toFixed(2)}
                  </div>
                </div>
                {approval.action !== "record_customer_payment" && approval.action !== "import_portal_transactions" && (
                  <div className="space-y-1 mb-3">
                    {(approval.items || []).map((item) => (
                      <div key={`${item.name}-${item.qty}`} className="flex justify-between text-xs text-slate-300">
                        <span>{item.qty} × {item.name}</span>
                        <span className="font-bold">₹{item.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                      <span>Payment: <span className="uppercase text-indigo-400">{approval.payment_method}</span></span>
                      <span>Customer: <span className="text-slate-300">{approval.customer}</span></span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={approveCurrentAction}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                  >
                    {busy ? "Executing…" : approval.action === "record_customer_payment" ? "✓ Approve & Credit Khata"
                      : approval.action === "import_portal_transactions" ? "✓ Approve & Stage"
                      : "✓ Approve & Generate Invoice"}
                  </button>
                  <button
                    onClick={() => setApproval(null)}
                    disabled={busy}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-400 hover:bg-white/5 transition active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-2.5 text-xs font-semibold text-rose-300">
                ⚠ {error}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-white/5 bg-slate-900/60 p-4">
            {interimText && (
              <div className="mb-2 text-xs text-slate-500 italic px-1">
                🎙 {interimText}
              </div>
            )}
            <div className="flex gap-2">
              {/* Mic button */}
              <button
                onClick={toggleListening}
                disabled={busy}
                title={listening ? "Stop listening" : `Speak to ${SAI_NAME}`}
                className={`flex-shrink-0 rounded-2xl px-4 py-3 text-sm font-black transition-all active:scale-95 disabled:opacity-40 ${
                  listening
                    ? "bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/30"
                    : "border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
                }`}
              >
                {listening ? "■" : "🎤"}
              </button>
              {/* Text input */}
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
                placeholder={`Ask ${SAI_NAME} anything… or paste SMS / URL`}
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
              />
              {/* Send */}
              <button
                onClick={() => void ask()}
                disabled={busy || !message.trim()}
                className="flex-shrink-0 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-3 text-sm font-black text-white shadow-md shadow-cyan-600/20 transition hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-5">
          {/* Status Panel */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-cyan-400" />
              <h2 className="text-sm font-black text-white">{SAI_NAME} Status</h2>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { label: "Voice Output", value: voiceEnabled ? "ON (Female)" : "MUTED", color: voiceEnabled ? "text-cyan-400" : "text-slate-500" },
                { label: "Voice Input", value: "Chrome / Edge", color: "text-slate-400" },
                { label: "Memory", value: `${memories.length} rules`, color: "text-purple-400" },
                { label: "Cross-Session", value: "Active", color: "text-emerald-400" },
                { label: "Language", value: selectedLanguage.label, color: "text-indigo-400" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-slate-500">{item.label}</span>
                  <span className={`font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data Sources */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="text-sm font-black text-white mb-3">📡 Data Sources</h2>
            <div className="space-y-2">
              {[
                { title: "1. Phone Bank SMS", desc: "Paste any bank SMS — SAI extracts & matches customer automatically." },
                { title: "2. Portals (DigiPay, CSC, Spice)", desc: "Paste portal receipts — SAI extracts commissions & stages them." },
                { title: "3. Websites & URLs", desc: "Give any https://... link — SAI fetches and extracts facts." },
              ].map((s) => (
                <div key={s.title} className="rounded-xl border border-white/5 bg-white/3 p-3">
                  <div className="text-xs font-bold text-slate-300">{s.title}</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Self-Learner */}
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-white">🧠 Teach SAI</h2>
              <span className="rounded-full bg-purple-900/40 border border-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-400">
                {memories.length} Rules
              </span>
            </div>
            <button
              onClick={() => { const cmd = "Remember that Xerox is 3 rupees per page"; setMessage(cmd); void ask(cmd, true, "auto"); }}
              className="w-full text-left rounded-xl border border-purple-500/20 bg-purple-950/30 p-2.5 text-xs text-purple-300 hover:bg-purple-900/30 transition"
            >
              &ldquo;Remember that Xerox is 3 rupees per page&rdquo;
            </button>
          </div>
        </div>
      </section>

      {/* ── Memory Modal ─────────────────────────────────────────────────────── */}
      {isMemoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div>
                <h3 className="text-lg font-black text-white">🧠 {SAI_NAME}&apos;s Learned Memories</h3>
                <p className="text-xs text-slate-500">Rules and facts SAI has learned about your business.</p>
              </div>
              <button
                onClick={() => setIsMemoryModalOpen(false)}
                className="rounded-xl border border-white/10 p-2 text-xs font-bold text-slate-400 hover:bg-white/5"
              >
                ✕ Close
              </button>
            </div>
            <form onSubmit={teachDirectRule} className="mb-4 flex gap-2">
              <input
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder="Teach SAI a rule (e.g. Minimum UPI order is ₹20)"
                className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={savingRule || !newRuleText.trim()}
                className="rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {savingRule ? "Saving…" : "+ Teach"}
              </button>
            </form>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {memories.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No rules learned yet. Say &ldquo;Remember that...&rdquo; or add above.
                </div>
              ) : (
                memories.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900 p-3 text-xs">
                    <div>
                      <span className="rounded-md bg-purple-900/40 border border-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-400 mr-2">
                        {m.category}
                      </span>
                      <span className="font-semibold text-slate-300">
                        {typeof m.memory_value === "string" ? m.memory_value : JSON.stringify(m.memory_value)}
                      </span>
                    </div>
                    <button
                      onClick={() => void deleteMemory(m.id)}
                      className="text-rose-500 hover:text-rose-400 text-[11px] font-bold ml-3"
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
