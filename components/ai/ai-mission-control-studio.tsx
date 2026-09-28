"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Bot,
  Radio,
  Brain,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  Cpu,
  Layers,
  Activity,
  Workflow
} from "lucide-react";
import CafeAIAgent from "@/components/ai/cafe-ai-agent";
import AIWhatsAppBridge from "@/components/ai/ai-whatsapp-bridge";
import AIIngestionPanel from "@/components/ai/ai-ingestion-panel";
import PhoneCollectorPanel from "@/components/ai/phone-collector-panel";
import AIMemoryPanel from "@/components/ai/ai-memory-panel";
import AICommandCenter from "@/components/ai/ai-command-center";
import AICodeRepairGuardian from "@/components/ai/ai-code-repair-guardian";
import AISelfHealingBridge from "@/components/ai/ai-self-healing-bridge";
import AIBusinessWatcher from "@/components/ai/ai-business-watcher";

type TabId = "copilot" | "ingestion" | "brain" | "health";

export default function AIMissionControlStudio() {
  const [activeTab, setActiveTab] = useState<TabId>("copilot");
  const [modelLabel, setModelLabel] = useState("Gemini 2.5 Flash");
  const [providerLabel, setProviderLabel] = useState("Google Gemini");

  useEffect(() => {
    async function loadModelInfo() {
      try {
        const res = await fetch("/api/ai/provider-config", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.model) {
          setModelLabel(data.model);
          if (data.provider) {
            const name = data.provider === "gemini" ? "Google Gemini" : data.provider === "openai" ? "OpenAI" : data.provider === "anthropic" ? "Anthropic Claude" : data.provider === "groq" ? "Groq" : "OpenRouter";
            setProviderLabel(name);
          }
        }
      } catch {}
    }
    loadModelInfo();
  }, []);

  return (
    <div className="space-y-6">
      {/* Background WhatsApp alert listener is always mounted */}
      <AIWhatsAppBridge />

      {/* MODERN EXECUTIVE MISSION CONTROL HEADER */}
      <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 sm:p-7 text-white shadow-xl dark:border-white/10">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-black text-emerald-400 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Autonomous Engine Online
              </span>

              {/* Dynamic Model & Provider Badge linking to Settings */}
              <Link
                href="/settings?tab=automations&card=ai-model-provider"
                title="Change AI Model & Provider in Settings"
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-black text-indigo-200 hover:bg-indigo-500/30 transition group"
              >
                <Cpu className="h-3 w-3 text-indigo-300" />
                <span className="font-mono">{modelLabel}</span>
                <span className="text-[10px] text-indigo-400 font-semibold">({providerLabel})</span>
                <span className="text-[9px] underline opacity-70 group-hover:opacity-100">Change</span>
              </Link>

              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-bold text-purple-300">
                1-Click Owner Verification
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>AI Copilot & Mission Control</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Multi-channel intelligent assistant for automated quick billing, bank SMS parsing, portal reconciliations, and autonomous shop self-healing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/settings?tab=automations&card=ai-model-provider"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-600/30 px-3.5 text-xs font-black text-indigo-200 hover:bg-indigo-600/50 active:scale-95 transition shadow-xs"
            >
              <Cpu className="h-3.5 w-3.5 text-indigo-300" />
              <span>Model & API Key</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400" />
            </Link>

            <Link
              href="/ai/self-audit"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-black text-white hover:bg-white/10 active:scale-95 transition"
            >
              <Activity className="h-3.5 w-3.5 text-amber-400" />
              <span>Self-Audit Hub</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <Link
              href="/ai-agent/learning"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 text-xs font-black text-white hover:bg-white/10 active:scale-95 transition"
            >
              <Workflow className="h-3.5 w-3.5 text-purple-300" />
              <span>Workflow Engine</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* GLOW DECORATIVE EFFECT */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-40 -bottom-20 h-48 w-48 rounded-full bg-purple-500/15 blur-2xl" />
      </header>

      {/* SEGMENTED TAB NAVIGATION */}
      <nav className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80 shadow-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          {
            id: "copilot",
            label: "Copilot & Assistant",
            icon: Bot,
            description: "Natural Language Chat & Voice",
          },
          {
            id: "ingestion",
            label: "Omnichannel Ingestion",
            icon: Radio,
            description: "WhatsApp, SMS & Portals",
          },
          {
            id: "brain",
            label: "Brain & Learning",
            icon: Brain,
            description: "Learned Rules & Memory",
          },
          {
            id: "health",
            label: "System Health & Guardian",
            icon: ShieldCheck,
            description: "Code Repair & Diagnostics",
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`flex flex-1 min-w-[170px] sm:min-w-0 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-black transition-all active:scale-[0.98] select-none ${
                isActive
                  ? "bg-slate-900 text-white shadow-md dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-400 dark:text-indigo-600" : "text-slate-400"}`} />
              <div className="text-left truncate">
                <div className="truncate font-black">{tab.label}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* TAB CONTENT PANELS */}
      <main className="min-h-[500px]">
        {/* TAB 1: COPILOT & ASSISTANT */}
        {activeTab === "copilot" && (
          <div className="animate-fade-in space-y-6">
            <CafeAIAgent />
          </div>
        )}

        {/* TAB 2: OMNICHANNEL INGESTION */}
        {activeTab === "ingestion" && (
          <div className="animate-fade-in space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center gap-2.5 mb-1">
                <Radio className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  Omnichannel Data Stream & External Feeds
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Real-time collection feeds from Bank SMS, Service Portals (DigiPay, CSC, Spice Money), and Android notification bridges.
              </p>
            </div>

            <AIIngestionPanel />
            <PhoneCollectorPanel />
          </div>
        )}

        {/* TAB 3: BRAIN & LEARNING */}
        {activeTab === "brain" && (
          <div className="animate-fade-in space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center gap-2.5 mb-1">
                <Brain className="h-4 w-4 text-purple-500" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  Autonomous Shop Brain & Custom Rules
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect custom guidelines learned by the AI copilot (e.g. Xerox pricing, minimum order thresholds, customer credit policies).
              </p>
            </div>

            <AIMemoryPanel />
          </div>
        )}

        {/* TAB 4: SYSTEM HEALTH & GUARDIAN */}
        {activeTab === "health" && (
          <div className="animate-fade-in space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-center gap-2.5 mb-1">
                <ShieldCheck className="h-4 w-4 text-rose-500" />
                <h2 className="text-sm font-black text-slate-900 dark:text-white">
                  Autonomous Diagnostics & Self-Healing Guardians
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Continuous background surveillance across software code bugs, transaction anomalies, database integrity, and automated recovery.
              </p>
            </div>

            <AICommandCenter />
            <AICodeRepairGuardian />
            <AISelfHealingBridge />
            <AIBusinessWatcher />
          </div>
        )}
      </main>
    </div>
  );
}
