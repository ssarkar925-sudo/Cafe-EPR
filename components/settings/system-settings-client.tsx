"use client";

import { useState } from "react";
import AppearancePanel from "@/components/settings/appearance-panel";
import WhatsAppTrackerPanel from "@/components/settings/whatsapp-tracker-panel";

type Section = "general" | "whatsapp" | "appearance" | "security" | "staff" | "audit" | "ai";

export default function SystemSettingsClient() {
  const [section, setSection] = useState<Section>("general");

  const tabs: { key: Section; label: string; icon: string }[] = [
    { key: "general", label: "System Overview", icon: "⚙" },
    { key: "whatsapp", label: "WhatsApp", icon: "◉" },
    { key: "appearance", label: "Appearance", icon: "◐" },
    { key: "security", label: "Security", icon: "◇" },
    { key: "staff", label: "Staff & Roles", icon: "♙" },
    { key: "audit", label: "Audit", icon: "◈" },
    { key: "ai", label: "AI Control", icon: "✦" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">System Control Center</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">System Settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Global application controls live here. Operational configuration stays inside its owning Hub and is never duplicated here.
        </p>
      </header>

      <nav aria-label="System settings sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSection(tab.key)}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${section === tab.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"}`}
          >
            <span className="mr-2">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </nav>

      {section === "general" && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["WhatsApp", "Connection, templates, automations, queue and delivery history.", "whatsapp"],
            ["Appearance", "Theme, accent, density, typography and global display preferences.", "appearance"],
            ["Security", "Credentials, 2FA, terminal and security controls.", "security"],
            ["Staff & Roles", "Users, roles and permissions.", "staff"],
            ["Audit", "Immutable operational audit history.", "audit"],
            ["AI Control Center", "Diagnostics and automated financial checks.", "ai"],
          ].map(([title, description, key]) => (
            <button key={key} type="button" onClick={() => setSection(key as Section)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/40">
              <h2 className="font-extrabold text-slate-900 dark:text-white">{title}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
              <span className="mt-4 inline-block text-xs font-black text-blue-600">Open here →</span>
            </button>
          ))}
        </section>
      )}

      {section === "whatsapp" && <WhatsAppTrackerPanel />}
      {section === "appearance" && <AppearancePanel active={true} />}
      {section === "security" && <SystemPlaceholder title="Security" description="Security controls remain available from this System Settings workspace." href="/security" />}
      {section === "staff" && <SystemPlaceholder title="Staff & Roles" description="Staff and permission administration remains available from this System Settings workspace." href="/staff" />}
      {section === "audit" && <SystemPlaceholder title="Audit" description="Immutable audit history remains available from this System Settings workspace." href="/audit" />}
      {section === "ai" && <SystemPlaceholder title="AI Control Center" description="AI diagnostics and financial self-audit remain available from this System Settings workspace." href="/ai" />}
    </div>
  );
}

function SystemPlaceholder({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <h2 className="text-xl font-black text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <a href={href} className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Open full {title} workspace</a>
    </section>
  );
}
