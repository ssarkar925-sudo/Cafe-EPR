"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Banknote, Boxes, CalendarDays,
  CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, CreditCard,
  FileText, Package, RefreshCw, ShoppingCart, Smartphone, TrendingDown,
  Users, WalletCards, XCircle, Zap
} from "lucide-react";
import { type VerifiedFinancialContext } from "@/lib/ai/advisor-engine";

export type DashboardClientProps = { data: any; verifiedContext?: VerifiedFinancialContext };
type PeriodKey = "today" | "thisWeek" | "thisMonth" | "fyYtd";
const PERIODS = [
  { key: "today" as PeriodKey, label: "Today" },
  { key: "thisWeek" as PeriodKey, label: "7 Days" },
  { key: "thisMonth" as PeriodKey, label: "30 Days" },
  { key: "fyYtd" as PeriodKey, label: "This Year" },
];

const money = (v: number | null | undefined, compact = false) => {
  const n = Number(v || 0);
  if (compact) {
    if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};
const exactMoney = (v: number | null | undefined) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inr = exactMoney;
const ago = (v: string) => {
  if (!v) return "Live";
  const m = Math.floor(Math.max(0, Date.now() - new Date(v).getTime()) / 60000);
  return m < 1 ? "Just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};
const dateLabel = (v: string) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

function IconBox({ children, tone = "blue" }: { children: React.ReactNode; tone?: string }) {
  const map: Record<string,string> = {
    blue:"bg-blue-50 text-blue-600", green:"bg-emerald-50 text-emerald-600",
    amber:"bg-amber-50 text-amber-600", orange:"bg-orange-50 text-orange-600",
    violet:"bg-violet-50 text-violet-600", rose:"bg-rose-50 text-rose-600",
    cyan:"bg-cyan-50 text-cyan-600", slate:"bg-slate-100 text-slate-600"
  };
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${map[tone] || map.blue}`}>{children}</span>;
}

function Section({ title, href, subtitle, children, className = "" }: any) {
  return <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,.05)] dark:border-white/10 dark:bg-slate-900 ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div><h2 className="text-[15px] font-extrabold tracking-[-.02em] text-slate-900 dark:text-white">{title}</h2>{subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}</div>
      {href && <Link href={href} className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600">View All <ChevronRight className="h-3 w-3" /></Link>}
    </div>
    {children}
  </section>;
}

function Kpi({ label, value, delta, icon, tone, bars }: any) {
  const barColor = tone === "green" ? "bg-emerald-300" : tone === "amber" ? "bg-amber-300" : tone === "violet" ? "bg-violet-300" : "bg-blue-300";
  const max = Math.max(...(bars || [1]), 1);
  return <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_3px_rgba(15,23,42,.05)] dark:border-white/10 dark:bg-slate-900">
    <div className="flex items-start justify-between"><IconBox tone={tone}>{icon}</IconBox><div className="flex h-8 items-end gap-0.5">{(bars || []).map((v:number,i:number)=><i key={i} className={`w-1.5 rounded-t ${barColor}`} style={{height:`${Math.max(4,Math.round(v/max*26))}px`}} />)}</div></div>
    <p className="mt-2 text-[10px] font-semibold text-slate-500">{label}</p>
    <p className="text-[21px] font-black tracking-[-.035em] text-slate-950 dark:text-white">{value}</p>
    {delta !== null && delta !== undefined && <p className={`flex items-center gap-1 text-[9px] font-bold ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{delta >= 0 ? <ArrowUpRight className="h-3 w-3"/> : <ArrowDownRight className="h-3 w-3"/>}{Math.abs(delta).toFixed(1)}% <span className="font-medium text-slate-400">vs yesterday</span></p>}
  </div>;
}

export default function DashboardClient({ data }: DashboardClientProps) {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [more, setMore] = useState(false);
  const p = data.salesPerformance?.[period] || data.salesPerformance?.today || {};
  const alerts = data.alerts || [], pools = data.liquidity?.pools || {}, recent = data.recentActivity || [];
  const inventory = data.inventoryData || {}, service = data.todayServiceBreakdown || data.serviceBreakdown || {};
  const audit = data.auditData || {}, shop = data.shop || {}, profile = data.profile || {};
  const chartDays = data.chartDays || [];
  const actualPeakRevenue = chartDays.length > 0 ? Math.max(0, ...chartDays.map((d: any) => Number(d.revenue || 0))) : 0;
  const chart = chartDays.slice(-10), max = Math.max(...chart.map((x:any)=>Number(x.revenue||0)),1);
  const greeting = useMemo(() => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening"; }, []);
  const totalLiquidity = Number(data.liquidity?.totalLiquidAssets || 0);
  const receivables = Number(data.customerData?.totalReceivables || 0);
  const delta = data.salesPerformance?.trends?.todayVsYesterdayPct;

  const quick = [
    { label:"New Sale (POS)", href:"/pos", tone:"green", icon:<ShoppingCart className="h-4 w-4"/> },
    { label:"New Invoice", href:"/invoices/new", tone:"blue", icon:<FileText className="h-4 w-4"/> },
    { label:"Add Customer", href:"/customers", tone:"violet", icon:<Users className="h-4 w-4"/> },
    { label:"Cash Entry", href:"/finance/cashbook", tone:"orange", icon:<Banknote className="h-4 w-4"/> },
    { label:"AEPS", href:"/business/aeps", tone:"cyan", icon:<CreditCard className="h-4 w-4"/> },
    { label:"DMT", href:"/business/dmt", tone:"blue", icon:<ArrowUpRight className="h-4 w-4"/> },
    { label:"Recharge / BBPS", href: "/business/bill-payment", tone:"green", icon:<Smartphone className="h-4 w-4"/> },
  ] as const;

  const moreActions = [
    { label:"Journal", href: "/finance/journal" },
    { label:"Trial Balance", href: "/finance/trial-balance" },
    { label:"WhatsApp", href:"/business/whatsapp" },
    { label:"Day Close", href:"/finance/day-close" },
    { label:"Reports", href:"/reports" },
    { label:"Settings", href:"/settings" },
  ];

  const poolRows = [
    ["cash","Cash in Hand",Banknote,"green"],["bank","Bank Account",CircleDollarSign,"blue"],
    ["wallet","UPI Wallet",WalletCards,"violet"],["upi_qr","UPI QR Float",Smartphone,"cyan"],
    ["aeps","AEPS Balance",CreditCard,"amber"],["dmt","DMT Wallet",WalletCards,"rose"]
  ] as const;

  return <div className="mx-auto w-full max-w-[1500px] px-1 pb-8">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="flex items-center gap-2"><h1 className="text-[24px] font-black tracking-[-.04em] text-slate-950 dark:text-white">{greeting}, {profile.name || "Operator"}!</h1><span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-700 sm:inline-flex">Live</span></div><p className="mt-1 text-[12px] text-slate-500">Here&apos;s what&apos;s happening with your business today.</p></div>
      <div className="flex gap-2"><div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"><CalendarDays className="h-3.5 w-3.5 text-slate-400"/>{dateLabel(data.period?.isoToday)}</div><div className="relative h-9 rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900"><select value={period} onChange={e=>setPeriod(e.target.value as PeriodKey)} className="h-full appearance-none bg-transparent pl-3 pr-8 text-[10px] font-bold outline-none">{PERIODS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-3 h-3 w-3 text-slate-400"/></div></div>
    </div>

    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      {[
        ["System",shop.systemHealth==="critical"?"Critical":shop.systemHealth==="attention"?"Attention":"Operational",shop.systemHealth==="operational"?"text-emerald-500":"text-amber-500",CheckCircle2],
        ["Audit",audit.status||"Unavailable",audit.status==="PASS"?"text-emerald-500":"text-amber-500",CheckCircle2],
        ["Liquidity",money(totalLiquidity,true),"text-blue-500",CircleDollarSign],
        ["Receivables",`${money(receivables,true)} • ${data.customerData?.customerCountWithDue||0}`, "text-violet-500",Users]
      ].map(([a,b,c,I]:any)=><div key={a} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900"><I className={`h-4 w-4 ${c}`}/><div><p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{a}</p><p className="text-[10px] font-extrabold text-slate-800 dark:text-white">{b}</p></div></div>)}
    </div>

    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Total Sales" value={money(p.revenue)} delta={delta} tone="green" icon={<ShoppingCart className="h-5 w-5"/>} bars={data.sparklines?.revenue}/>
      <Kpi label="Profit (Est.)" value={money(p.profit)} delta={null} tone="blue" icon={<CircleDollarSign className="h-5 w-5"/>} bars={data.sparklines?.profit}/>
      <Kpi label="Expenses" value={money(data.todayMetrics?.expenses)} delta={null} tone="amber" icon={<TrendingDown className="h-5 w-5"/>} bars={data.sparklines?.expenses}/>
      <Kpi label="Transactions" value={Number(p.txCount||0).toLocaleString("en-IN")} delta={null} tone="violet" icon={<FileText className="h-5 w-5"/>} bars={(data.sparklines?.revenue||[]).map((x:number)=>Math.max(1,Math.round(x/100)))}/>
    </div>

    <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(330px,.82fr)]">
      <Section title="Sales & Profit Trend">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">{PERIODS.map(x=><button key={x.key} onClick={()=>setPeriod(x.key)} className={`rounded-md px-2.5 py-1.5 text-[9px] font-bold ${period===x.key?"bg-blue-600 text-white":"text-slate-500"}`}>{x.label}</button>)}</div>
          <div className="flex gap-3 text-[9px] font-semibold text-slate-500"><span>■ Sales</span><span className="text-emerald-600">■ Profit</span></div>
        </div>
        <div className="mb-2 text-right text-[9px] font-semibold text-slate-400">14-Day Peak: <strong className="text-slate-900 dark:text-white">{inr(actualPeakRevenue)}</strong></div><div className="relative h-[245px] rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-950/40">
          <div className="pointer-events-none absolute inset-3 bottom-8 flex flex-col justify-between">{[40,30,20,10,0].map(v=><div key={v} className="border-t border-slate-200/70 dark:border-white/5"><span className="relative -top-2 text-[8px] text-slate-400">{v? `₹${v}k`:"₹0"}</span></div>)}</div>
          <div className="absolute inset-x-3 bottom-8 top-3 flex items-end gap-1.5">{chart.map((d:any,i:number)=>{const s=Number(d.revenue||0), pr=Math.max(0,s-Number(d.expenses||0));return <div key={d.date||i} className="group flex flex-1 items-end justify-center gap-0.5"><i title={money(s)} className="w-[42%] rounded-t bg-blue-500/75" style={{height:`${Math.max(3,s/max*88)}%`}}/><i title={money(pr)} className="w-[42%] rounded-t bg-emerald-500/75" style={{height:`${Math.max(3,pr/max*88)}%`}}/></div>})}</div>
          <div className="absolute inset-x-3 bottom-1 flex justify-between text-[8px] text-slate-400">{chart.map((d:any)=><span key={d.date}>{String(d.label||"").split(" ")[0]}</span>)}</div>
        </div>
      </Section>

      <Section title="Needs Attention" href="/ai/self-audit">
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70"><BellDot/><b className="text-[10px] text-slate-700 dark:text-slate-200">{alerts.length} active items</b><span className="ml-auto text-[8px] text-slate-400">Owner view</span></div>
        <div className="space-y-2">{alerts.slice(0,5).map((a:any)=><Link key={a.id} href={a.actionHref||"#"} className="flex gap-2 rounded-xl border border-slate-100 p-2.5 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-slate-800"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.severity==="critical"?"bg-red-50 text-red-600":"bg-amber-50 text-amber-600"}`}><AlertCircle className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><b className="line-clamp-2 text-[10px] leading-4 text-slate-800 dark:text-slate-100">{a.title}</b><em className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[7px] font-black not-italic text-slate-600">{a.severity==="critical"?"Critical":a.severity==="high"?"Action":"Warning"}</em></span><small className="mt-1 block line-clamp-2 text-[8px] leading-3 text-slate-500">{a.reason}</small></span></Link>)}</div>
        {!alerts.length && <div className="rounded-xl bg-emerald-50 p-5 text-center text-[10px] font-bold text-emerald-700"><CheckCircle2 className="mx-auto mb-2 h-5 w-5"/>No active attention items</div>}
      </Section>
    </div>

    <div className="mb-4 grid gap-4 lg:grid-cols-3">
      <Section title="Cash & Bank Position" href="/finance/cashbook"><div className="space-y-1">{poolRows.map(([k,l,I,t]:any)=><Link key={k} href={pools[k]?.href||"/finance/cashbook"} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"><IconBox tone={t}><I className="h-4 w-4"/></IconBox><span className="flex-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{l}</span><b className="text-[10px] text-slate-900 dark:text-white">{exactMoney(pools[k]?.current)}</b></Link>)}</div><div className="mt-2 flex justify-between rounded-xl bg-blue-50 px-3 py-2.5"><b className="text-[10px] text-blue-700">Total Liquidity</b><b className="text-[15px] text-blue-700">{money(totalLiquidity)}</b></div></Section>

      <Section title="Inventory Snapshot" href="/inventory"><div className="space-y-2.5">{[
        ["Stock Value",money(inventory.totalStockValue),Package,"slate"],["Low Stock",inventory.lowStockCount||0,TrendingDown,"amber"],["Out of Stock",inventory.outOfStockCount||0,XCircle,"rose"],["Cost Data",inventory.isValuationMissingCost?"Incomplete":"Available",Boxes,inventory.isValuationMissingCost?"amber":"green"]
      ].map(([l,v,I,t]:any)=><div key={l} className="flex items-center gap-2"><IconBox tone={t}><I className="h-4 w-4"/></IconBox><span className="flex-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{l}</span><b className="rounded-md bg-slate-100 px-2 py-1 text-[9px] text-slate-700">{v}</b></div>)}</div></Section>

      <Section title="Digital Services" subtitle="Today" href="/business/aeps"><div className="space-y-2">{[
        ["AEPS","aeps",CreditCard,"amber"],["DMT","dmt",ArrowUpRight,"violet"],["UPI","upi",Smartphone,"blue"],["Recharge / BBPS","recharge",Zap,"rose"]
      ].map(([l,k,I,t]:any)=><div key={k} className="flex items-center gap-2"><IconBox tone={t}><I className="h-4 w-4"/></IconBox><span className="flex-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{l}</span><span className="text-right"><b className="block text-[10px] text-slate-900 dark:text-white">{service[k]?.count||0}</b><small className="block text-[8px] text-slate-400">{money(service[k]?.volume,true)}</small></span></div>)}</div></Section>
    </div>

    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,.05)] dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2"><b className="mr-1 hidden text-[10px] text-slate-500 lg:block">Quick Actions</b>{quick.map((a)=><Link key={a.href} href={a.href} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[9px] font-extrabold ${a.tone==="green"?"border-emerald-200 bg-emerald-50 text-emerald-700":a.tone==="blue"?"border-blue-200 bg-blue-50 text-blue-700":a.tone==="violet"?"border-violet-200 bg-violet-50 text-violet-700":a.tone==="orange"?"border-orange-200 bg-orange-50 text-orange-700":"border-cyan-200 bg-cyan-50 text-cyan-700"}`}>{a.icon}{a.label}</Link>)}<button onClick={()=>setMore(v=>!v)} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[9px] font-extrabold text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">More Actions <ChevronDown className={`h-3 w-3 ${more?"rotate-180":""}`}/></button></div>{more&&<div className="mt-2 flex flex-wrap gap-2 border-t border-slate-100 pt-2">{moreActions.map((a:any)=><Link key={a.href} href={a.href} className="rounded-lg bg-slate-50 px-3 py-2 text-[9px] font-bold text-slate-600">{a.label}</Link>)}</div>}</section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,.7fr)]">
      <Section title="Recent Invoices & Activity" href="/invoices" className="overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-slate-50 text-[8px] uppercase tracking-wider text-slate-400 dark:bg-slate-800"><tr><th className="px-4 py-2.5">Reference</th><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Customer / Event</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-white/5">{recent.slice(0,7).map((x:any)=><tr key={x.id}><td className="px-4 py-2.5 text-[9px] font-extrabold text-blue-600">{x.title}</td><td className="px-4 py-2.5 text-[9px] text-slate-500">{ago(x.date)}</td><td className="max-w-[230px] truncate px-4 py-2.5 text-[9px] font-semibold text-slate-700 dark:text-slate-300">{x.subtitle}</td><td className="px-4 py-2.5 text-right text-[9px] font-black">{money(x.amount)}</td><td className="px-4 py-2.5"><span className="rounded-md bg-emerald-50 px-2 py-1 text-[7px] font-black text-emerald-700">{x.status||"posted"}</span></td></tr>)}</tbody></table></div></Section>

      <Section title="Recent Activity"><div className="divide-y divide-slate-100 dark:divide-white/5">{recent.slice(0,8).map((x:any)=><div key={`feed-${x.id}`} className="flex items-center gap-2.5 py-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800"><Zap className="h-3 w-3"/></span><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-bold text-slate-700 dark:text-slate-200">{x.title}</p><p className="truncate text-[8px] text-slate-400">{x.subtitle}</p></div><div className="text-right"><b className={`text-[9px] ${x.direction==="out"?"text-red-600":"text-emerald-600"}`}>{x.direction==="out"?"−":"+"}{money(x.amount)}</b><p className="text-[7px] text-slate-400">{ago(x.date)}</p></div></div>)}</div></Section>
    </div>

    <div className="mt-4 flex flex-wrap justify-between px-1 text-[8px] font-semibold text-slate-400"><span>{shop.name || "CafeERP"} • {data.period?.fyLabel || "FY"}</span><span>Day Close: {data.dayCloseStatus?.statusLabel || data.dayCloseStatus?.state || "N/A"} • Audit: {audit.status || "N/A"}</span></div>
  </div>;
}

function BellDot() {
  return <span className="relative flex h-4 w-4 items-center justify-center"><span className="h-3 w-3 rounded-full bg-blue-500"/><span className="absolute h-1.5 w-1.5 rounded-full bg-white"/></span>;
}
