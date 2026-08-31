"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type SidebarProps = { name:string; email:string; role:string; shopName:string; logoUrl:string|null; avatarUrl:string|null; userId:string; collapsed:boolean; onToggle:()=>void; mobileOpen:boolean; onMobileClose:()=>void };
type Item={label:string;href:string;roles?:string[];fixed?:boolean};
const GROUPS=[
 {label:"WORKSPACE",items:[
  {label:"Dashboard",href:"/dashboard"},{label:"POS",href:"/pos"},{label:"Bill Payment",href:"/business/bill-payment"},{label:"DMT",href:"/business/dmt"},{label:"AEPS",href:"/business/aeps"},{label:"UPI",href:"/business/upi"},{label:"Invoices",href:"/invoices"},{label:"Inventory",href:"/inventory"},{label:"Expenses",href:"/finance/expenses"},{label:"Customers",href:"/customers"},{label:"Finance",href:"/finance",roles:["admin","manager"]},{label:"Reports",href:"/reports"}]},
 {label:"CONTROL",items:[{label:"System Settings",href:"/settings",roles:["admin"],fixed:true}]}
] as {label:string;items:Item[]}[];
const ALL=GROUPS.flatMap(g=>g.items), KEY="cafe-erp-sidebar-customization-v2";
const CUSTOMIZABLE=ALL.filter(x=>!x.fixed);
type Pref={hidden:string[];order:string[]};
const defaults=():Pref=>({hidden:[],order:CUSTOMIZABLE.map(x=>x.href)});
const icon=(label:string)=>({Dashboard:"▦",POS:"▣","Bill Payment":"▤",DMT:"↗",AEPS:"⌁",UPI:"▥",Invoices:"▤",Inventory:"□",Expenses:"₹",Customers:"♙",Finance:"∑",Reports:"▥","System Settings":"⚙"}[label]||"•");

export default function Sidebar({name,email,role,shopName,logoUrl,avatarUrl,collapsed,onToggle,mobileOpen,onMobileClose}:SidebarProps){
 const pathname=usePathname(); const [pref,setPref]=useState<Pref>(defaults); const [open,setOpen]=useState(false);
 useEffect(()=>{try{const raw=localStorage.getItem(KEY);if(!raw)return;const p=JSON.parse(raw) as Partial<Pref>;const known=new Set(CUSTOMIZABLE.map(x=>x.href));setPref({hidden:(p.hidden??[]).filter(x=>known.has(x)),order:Array.from(new Set([...(p.order??[]),...CUSTOMIZABLE.map(x=>x.href)])).filter(x=>known.has(x))})}catch{}},[]);
 const save=(p:Pref)=>{setPref(p);try{localStorage.setItem(KEY,JSON.stringify(p))}catch{}};
 const visible=useMemo(()=>pref.order.map(h=>ALL.find(x=>x.href===h)).filter((x):x is Item=>!!x&&(!x.roles||x.roles.includes(role))&&!pref.hidden.includes(x.href)),[pref,role]);
 const toggle=(href:string)=>save({...pref,hidden:pref.hidden.includes(href)?pref.hidden.filter(x=>x!==href):[...pref.hidden,href]});
 const move=(href:string,d:number)=>{const o=[...pref.order],i=o.indexOf(href),j=i+d;if(i<0||j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];save({...pref,order:o});};
 return <>
  {mobileOpen&&<button aria-label="Close menu" onClick={onMobileClose} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"/>}
  <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-slate-950/95 ${collapsed?"w-[76px]":"w-[276px]"} ${mobileOpen?"translate-x-0":"-translate-x-full lg:translate-x-0"}`}>
   <div className="flex h-16 items-center gap-3 border-b border-slate-200/80 px-4 dark:border-white/10"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg">{logoUrl?<img src={logoUrl} alt="" className="h-full w-full object-cover"/>:<b>CE</b>}</div>{!collapsed&&<div className="min-w-0"><div className="truncate text-sm font-black">{shopName||"Cafe ERP"}</div><div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">ERP Hub</div></div>}<button onClick={onToggle} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} className="ml-auto hidden h-8 w-8 rounded-lg lg:block">{collapsed?"›":"‹"}</button></div>
   <nav className="flex-1 overflow-y-auto px-3 py-4">{GROUPS.map(g=>{const items=visible.filter(x=>g.items.some(y=>y.href===x.href));if(!items.length)return null;return <div key={g.label} className="mb-5">{!collapsed&&<div className="mb-2 px-3 text-[10px] font-black tracking-widest text-slate-400">{g.label}</div>}{items.map(item=>{const active=pathname===item.href||(item.href!=="/dashboard"&&pathname.startsWith(item.href+"/"));return <Link key={item.href} href={item.href} onClick={onMobileClose} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold ${active?"bg-blue-600 text-white":"text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"}`}><span className="w-5 text-center">{icon(item.label)}</span>{!collapsed&&item.label}</Link>})}</div>})}</nav>
   <div className="border-t border-slate-200/80 p-3 dark:border-white/10"><button onClick={()=>setOpen(true)} className={`mb-2 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold dark:border-white/10 dark:bg-white/[.04] ${collapsed?"justify-center":""}`}>⚙{!collapsed&&" System Settings"}</button><div className={`flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 dark:bg-white/[.04] ${collapsed?"justify-center":""}`}>{avatarUrl?<img src={avatarUrl} alt="" className="h-9 w-9 rounded-xl object-cover"/>:<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white">{(name||"U").slice(0,2).toUpperCase()}</div>}{!collapsed&&<div className="min-w-0"><div className="truncate text-xs font-black">{name||"User"}</div><div className="truncate text-[10px] text-slate-500">{email}</div></div>}</div></div>
  </aside>
  {open&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">System Settings</h2><p className="text-xs text-slate-500">Sidebar control is limited to system-level preferences. Operational hubs are not duplicated here.</p></div><button onClick={()=>setOpen(false)}>×</button></div><div className="space-y-2"><Link href="/settings" onClick={()=>setOpen(false)} className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">⚙ Open System Settings</Link><p className="px-1 text-xs text-slate-500">WhatsApp, Appearance and other system controls are managed inside the System Settings workspace.</p></div><div className="mt-4 flex justify-end"><button onClick={()=>setOpen(false)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Done</button></div></div></div>}
 </>;
}
