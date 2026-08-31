"use client";

import { useEffect, useState } from "react";
import AppearancePanel from "@/components/settings/appearance-panel";
import WhatsAppTrackerPanel from "@/components/settings/whatsapp-tracker-panel";

type Section = "general" | "whatsapp" | "appearance" | "sidebar" | "security" | "staff" | "audit" | "ai";
type Pref = { hidden: string[]; order: string[] };
const KEY = "cafe-erp-sidebar-customization-v2";
const HUBS = [
  ["/dashboard", "Dashboard"], ["/pos", "POS"], ["/business/bill-payment", "Bill Payment"], ["/business/dmt", "DMT"],
  ["/business/aeps", "AEPS"], ["/business/upi", "UPI"], ["/invoices", "Invoices"], ["/inventory", "Inventory"],
  ["/finance/expenses", "Expenses"], ["/customers", "Customers"], ["/finance", "Finance"], ["/reports", "Reports"],
] as const;
const DEFAULT: Pref = { hidden: [], order: HUBS.map(([href]) => href) };

export default function SystemSettingsClient() {
  const [section, setSection] = useState<Section>("general");
  const [pref, setPref] = useState<Pref>(DEFAULT);
  useEffect(() => { try { const p = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Pref> | null; if (!p) return; const known = new Set(HUBS.map(([h]) => h)); setPref({ hidden: (p.hidden || []).filter(h => known.has(h)), order: Array.from(new Set([...(p.order || []), ...DEFAULT.order])).filter(h => known.has(h)) }); } catch {} }, []);
  const save = (next: Pref) => { setPref(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} };
  const toggle = (href: string) => save({ ...pref, hidden: pref.hidden.includes(href) ? pref.hidden.filter(h => h !== href) : [...pref.hidden, href] });
  const move = (href: string, d: number) => { const order = [...pref.order], i = order.indexOf(href), j = i + d; if (i < 0 || j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; save({ ...pref, order }); };
  const tabs: { key: Section; label: string; icon: string }[] = [
    ["general", "System Overview", "⚙"], ["whatsapp", "WhatsApp", "◉"], ["appearance", "Appearance", "◐"], ["sidebar", "Sidebar & Hubs", "☷"], ["security", "Security", "◇"], ["staff", "Staff & Roles", "♙"], ["audit", "Audit", "◈"], ["ai", "AI Control", "✦"],
  ].map(([key,label,icon]) => ({ key: key as Section, label, icon }));
  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8">
    <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">System Control Center</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">System Settings</h1><p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Global application controls live here. Operational configuration stays inside its owning Hub and is never duplicated here.</p></header>
    <nav aria-label="System settings sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900">{tabs.map(t => <button key={t.key} type="button" onClick={() => setSection(t.key)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${section === t.key ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"}`}><span className="mr-2">{t.icon}</span>{t.label}</button>)}</nav>
    {section === "general" && <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[["WhatsApp","Connection, templates, automations, queue and delivery history.","whatsapp"],["Appearance","Theme, accent, density, typography and global display preferences.","appearance"],["Sidebar & Hubs","Customize which operational Hubs appear in the sidebar and their order.","sidebar"],["Security","Credentials, 2FA, terminal and security controls.","security"],["Staff & Roles","Users, roles and permissions.","staff"],["Audit","Immutable operational audit history.","audit"],["AI Control Center","Diagnostics and automated financial checks.","ai"]].map(([title,desc,key]) => <button key={key} type="button" onClick={() => setSection(key as Section)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 hover:shadow-lg dark:border-white/10 dark:bg-slate-900"><h2 className="font-extrabold text-slate-900 dark:text-white">{title}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{desc}</p><span className="mt-4 inline-block text-xs font-black text-blue-600">Open here →</span></button>)}</section>}
    {section === "whatsapp" && <WhatsAppTrackerPanel />}
    {section === "appearance" && <AppearancePanel active={true} />}
    {section === "sidebar" && <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black text-slate-900 dark:text-white">Sidebar & Hub Customization</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Customize only operational Hubs. System Settings is fixed under Control.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{pref.order.filter(h => !pref.hidden.includes(h)).length} visible</span></div><div className="mt-5 space-y-2">{pref.order.map((href,i) => { const label = HUBS.find(([h]) => h === href)?.[1] || href; const hidden = pref.hidden.includes(href); return <div key={href} className={`flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 ${hidden ? "opacity-50" : ""}`}><button type="button" onClick={() => toggle(href)} className="w-7 text-center font-black">{hidden ? "○" : "●"}</button><span className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-200">{label}</span><button type="button" disabled={!i} onClick={() => move(href,-1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" disabled={i === pref.order.length-1} onClick={() => move(href,1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-30">↓</button></div>})}</div><div className="mt-5 flex justify-end"><button type="button" onClick={() => save(DEFAULT)} className="rounded-xl border px-4 py-2 text-xs font-bold">Reset Hub Sidebar</button></div></section>}
    {section === "security" && <SystemPlaceholder title="Security" href="/security" />}{section === "staff" && <SystemPlaceholder title="Staff & Roles" href="/staff" />}{section === "audit" && <SystemPlaceholder title="Audit" href="/audit" />}{section === "ai" && <SystemPlaceholder title="AI Control Center" href="/ai" />}
  </div>;
}
function SystemPlaceholder({title,href}:{title:string;href:string}) { return <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-slate-900"><h2 className="text-xl font-black text-slate-900 dark:text-white">{title}</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This system control belongs to System Settings.</p><a href={href} className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">Open full workspace</a></section>; }
