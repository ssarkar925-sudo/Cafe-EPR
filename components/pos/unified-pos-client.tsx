"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { calculateGstInvoice, type GstInvoiceCalculation, type TaxTreatment } from "@/lib/gst";
import { Check, ChevronDown, Grid2X2, Minus, Plus, Search, ShoppingCart, Star, Trash2, UserRound, X, Zap } from "lucide-react";

type Product = {
  id: string; code: string | null; name: string; sale_price: number | string; stock_qty: number | string;
  category_id: string | null; hsn_code?: string | null; gst_rate?: number | string | null; categories: { name: string } | null;
};
type Service = {
  id: string; name: string; sale_price: number | string; category_id: string | null; is_quick_favorite?: boolean;
  quick_sort?: number | null; sac_code?: string | null; gst_rate?: number | string | null; categories: { name: string } | null;
};
type Customer = { id: string; name: string; code: string | null; phone: string | null; balance: number | string; gstin?: string | null; state_code?: string | null };
type Instrument = { id: string; name: string; type: string };
type Item = {
  id: string; kind: "product" | "service" | "custom"; name: string; price: number; stock?: number;
  categoryId: string | null; categoryName: string; code?: string | null; hsnSac?: string | null;
  gstRate: number; taxTreatment: TaxTreatment; favorite: boolean;
};
type CartLine = Item & { key: string; qty: number; rate: number };
type PaymentRow = { instrumentId: string; amount: string };

const FAV_KEY = "cafeerp-pos-favorites";
const VIEW_KEY = "cafeerp-pos-view";

const btnBase = "rounded-lg border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35";
const inputBase = "h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-800 dark:text-white";

function money(v: number) { return inr(Number.isFinite(v) ? v : 0); }
function keyOf(kind: Item["kind"], id: string) { return `${kind}:${id}`; }
function catName(v: string | null | undefined) { return (v || "Other").trim() || "Other"; }
function paymentKind(t: string) {
  if (t === "upi_qr" || t === "upi") return "upi";
  if (t === "debit_card" || t === "credit_card") return "card";
  return t;
}

export default function UnifiedPosClient({
  products, services, customers, instruments, salesTodayCount, salesTodayAmount,
}: {
  products: Product[]; services: Service[]; customers: Customer[]; instruments: Instrument[];
  salesTodayCount: number; salesTodayAmount: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const [fav, setFav] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "grid">("list");
  const [category, setCategory] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "service" | "product">("all");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerQ, setCustomerQ] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; number: string; total: number; paid: number; due: number } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customRate, setCustomRate] = useState("");
  const [customGst, setCustomGst] = useState("0");

  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (Array.isArray(f)) setFav(f.filter((x) => typeof x === "string"));
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid") setView("grid");
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(FAV_KEY, JSON.stringify(fav)); } catch {} }, [fav]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch {} }, [view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); setCategory("favorites"); }
      if (e.key === "F4") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setCheckoutOpen(false); setSplitOpen(false); setCustomerOpen(false); setCustomOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const f = new Set(fav);
    return [
      ...services.map((s) => ({ id:s.id, kind:"service" as const, name:s.name, price:Number(s.sale_price)||0, categoryId:s.category_id, categoryName:catName(s.categories?.name), code:null, hsnSac:s.sac_code ?? null, gstRate:Number(s.gst_rate)||0, taxTreatment:(Number(s.gst_rate)||0)>0 ? "taxable" : "non_gst", favorite:f.has(keyOf("service",s.id)) || Boolean(s.is_quick_favorite) })),
      ...products.map((p) => ({ id:p.id, kind:"product" as const, name:p.name, price:Number(p.sale_price)||0, stock:Number(p.stock_qty)||0, categoryId:p.category_id, categoryName:catName(p.categories?.name), code:p.code, hsnSac:p.hsn_code ?? null, gstRate:Number(p.gst_rate)||0, taxTreatment:(Number(p.gst_rate)||0)>0 ? "taxable" : "non_gst", favorite:f.has(keyOf("product",p.id)) }))
    ];
  }, [fav, products, services]);

  const categories = useMemo(() => {
    const map = new Map<string, { id:string; name:string; count:number }>();
    for (const i of items) { const id=i.categoryId||"other"; const x=map.get(id); map.set(id,{id,name:i.categoryName,count:(x?.count||0)+1}); }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }, [items]);
  const filtered = useMemo(() => {
    const n=q.trim().toLowerCase();
    return items.filter(i => category === "all" || (category === "favorites" ? i.favorite : (i.categoryId||"other")===category))
      .filter(i => typeFilter === "all" || i.kind === typeFilter)
      .filter(i => !n || `${i.name} ${i.code||""} ${i.categoryName}`.toLowerCase().includes(n))
      .sort((a,b)=>a.name.localeCompare(b.name));
  }, [category, items, q, typeFilter]);
  const customer = customers.find(c=>c.id===customerId) || null;
  const customerMatches = useMemo(() => {
    const n=customerQ.trim().toLowerCase();
    return customers.filter(c=>!n || `${c.name} ${c.phone||""} ${c.code||""}`.toLowerCase().includes(n)).slice(0,10);
  }, [customerQ, customers]);
  const subtotal = cart.reduce((s,l)=>s+l.qty*l.rate,0);
  const discountValue = Math.min(subtotal,Math.max(0,Number(discount)||0));
  const gst = useMemo<GstInvoiceCalculation>(() => calculateGstInvoice({
    lines: cart.map(l=>({qty:l.qty,rate:l.rate,gstRate:l.gstRate,hsnSac:l.hsnSac,taxTreatment:l.taxTreatment})),
    invoiceLumpSumDiscount: discountValue, supplierStateCode:"19", customerStateCode:customer?.state_code||null, customerGstin:customer?.gstin||null,
  }), [cart, customer, discountValue]);
  const total=gst.invoiceTotal;
  const collected=payments.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const due=Math.max(0,total-collected);
  const active = instruments.filter(i=>["cash","upi","upi_qr","bank","wallet","debit_card","credit_card"].includes(i.type));
  const defaultInstrument = active.find(i=>i.type==="cash") || active[0] || null;

  function toggleFav(i:Item){ const k=keyOf(i.kind,i.id); setFav(v=>v.includes(k)?v.filter(x=>x!==k):[...v,k]); }
  function add(i:Item){ if(i.kind==="product" && (i.stock||0)<=0)return; setCart(cur=>{const k=keyOf(i.kind,i.id);const e=cur.find(x=>x.key===k);if(e){if(i.kind==="product"&&e.qty>=(i.stock||0))return cur;return cur.map(x=>x.key===k?{...x,qty:x.qty+1}:x);}return [...cur,{...i,key:k,qty:1,rate:i.price}];}); }
  function qty(k:string,d:number){setCart(cur=>cur.flatMap(x=>{if(x.key!==k)return[x];const n=x.qty+d;if(n<=0)return[];if(x.kind==="product"&&n>(x.stock||0))return[x];return[{...x,qty:n}];}));}
  function rate(k:string,v:string){setCart(cur=>cur.map(x=>x.key===k?{...x,rate:Math.max(0,Number(v)||0)}:x));}
  function startCheckout(){
    setError(null); setSplitOpen(false);
    setPayments(defaultInstrument?[{instrumentId:defaultInstrument.id,amount:total.toFixed(2)}]:[]); setCheckoutOpen(true);
  }
  function addPayment(){ const used=new Set(payments.map(p=>p.instrumentId)); const next=active.find(i=>!used.has(i.id))||defaultInstrument; if(next)setPayments(r=>[...r,{instrumentId:next.id,amount:Math.max(0,total-r.reduce((s,p)=>s+(Number(p.amount)||0),0)).toFixed(2)}]); }
  async function saveSale(){
    setError(null);
    if(!cart.length)return;
    if(collected>total+0.005){setError("Collected amount cannot exceed the bill total.");return;}
    if(due>0.005&&!customerId){setError("Select a customer to save an unpaid balance in Khata.");return;}
    setBusy(true);
    try{
      const payloadItems=cart.map((l,idx)=>{const t=gst.lines[idx];return{
        product_id:l.kind==="product"?l.id:null, service_id:l.kind==="service"?l.id:null, description:l.name, qty:l.qty, rate:l.rate,
        amount:t?.lineTotal??l.qty*l.rate, hsn_sac:t?.hsnSac??l.hsnSac??null, taxable_value:t?.taxableValue??l.qty*l.rate,
        gst_rate:t?.gstRate??l.gstRate,cgst_rate:t?.cgstRate??0,cgst_amount:t?.cgstAmount??0,sgst_rate:t?.sgstRate??0,sgst_amount:t?.sgstAmount??0,
        igst_rate:t?.igstRate??0,igst_amount:t?.igstAmount??0,tax_treatment:t?.taxTreatment??l.taxTreatment,
      };});
      const p=payments.map(r=>({instrument_id:r.instrumentId,method:paymentKind(active.find(i=>i.id===r.instrumentId)?.type||"cash"),amount:Math.round((Number(r.amount)||0)*100)/100})).filter(x=>x.amount>0);
      const {data, error:rpcError}=await supabase.rpc("create_sale",{
        p_customer_id:customerId||null,p_invoice_date:new Date().toISOString().slice(0,10),p_subtotal:gst.totalGross,p_discount:discountValue,p_total:total,
        p_payments:p,p_items:payloadItems,p_previous_due:0,p_previous_due_method:"cash",p_previous_due_instrument_id:null,p_advance_used:0,
        p_place_of_supply:gst.placeOfSupply,p_supply_type:gst.supplyType,p_customer_gstin:gst.customerGstin,p_b2b_or_b2c:gst.b2bCategory,
        p_total_taxable_value:gst.totalTaxableValue,p_total_cgst:gst.totalCgst,p_total_sgst:gst.totalSgst,p_total_igst:gst.totalIgst,p_is_reverse_charge:false,
      });
      if(rpcError)throw rpcError;
      const r=data as any; const id=String(r?.invoice_id||r?.id||""); const number=String(r?.invoice_number||"");
      if(!id||!number)throw new Error("Sale saved but the invoice reference was not returned.");
      const paid=Number(r?.paid??collected), d=Number(r?.due??Math.max(0,total-paid)), rt=Number(r?.total??total);
      setSuccess({id,number,total:rt,paid,due:d}); setCart([]);setDiscount("");setPayments([]);setCheckoutOpen(false);setSplitOpen(false);
    }catch(e:any){setError(e?.message||"Unable to save this bill.");}finally{setBusy(false);}
  }
  function addCustom(){ const name=customName.trim(), rate=Math.max(0,Number(customRate)||0), gr=Math.max(0,Number(customGst)||0); if(!name||rate<=0)return; const id=crypto.randomUUID(); const i:Item={id,kind:"custom",name,price:rate,categoryId:null,categoryName:"Other",hsnSac:null,gstRate:gr,taxTreatment:gr>0?"taxable":"non_gst",favorite:false};setCart(c=>[...c,{...i,key:keyOf("custom",id),qty:1,rate}]);setCustomName("");setCustomRate("");setCustomGst("0");setCustomOpen(false); }

  return <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-3 bg-slate-50/60 p-3 dark:bg-slate-950 lg:p-4">
    <header className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ShoppingCart className="h-4 w-4"/></div><div className="min-w-0"><h1 className="truncate text-base font-black tracking-tight text-slate-900 dark:text-white">POS Billing</h1><p className="text-[10px] font-medium text-slate-400">One catalog · one cart · one invoice</p></div></div>
      <div className="flex items-center gap-2"><span className="hidden text-[11px] text-slate-400 md:inline">Today <b className="text-slate-700 dark:text-slate-200">{salesTodayCount} bills</b> · <b className="text-slate-700 dark:text-slate-200">{money(salesTodayAmount)}</b></span><Link href="/invoices" className={`${btnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200`}>Invoices ↗</Link><button onClick={()=>{setCart([]);setCustomerId("");setCustomerQ("");setDiscount("");setPayments([]);setError(null);}} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950">New bill</button></div>
    </header>

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center gap-1.5 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button onClick={()=>setCategory("all")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${category==="all"?"bg-slate-950 text-white dark:bg-white dark:text-slate-950":"bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>All <span className="opacity-60">{items.length}</span></button>
        <button onClick={()=>setCategory("favorites")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${category==="favorites"?"bg-amber-500 text-white":"bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}><Star className="mr-1 inline h-3 w-3 fill-current"/>Favorites <span className="opacity-60">{items.filter(i=>i.favorite).length}</span></button>
        {categories.map(c=><button key={c.id} onClick={()=>setCategory(c.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${category===c.id?"bg-blue-600 text-white":"bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{c.name} <span className="opacity-60">{c.count}</span></button>)}
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as any)} className="ml-auto h-8 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"><option value="all">All types</option><option value="service">Services</option><option value="product">Products</option></select>
      </div>
    </section>

    <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 p-3 dark:border-white/5"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input ref={searchRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search item, code or category…" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"/>{q&&<button onClick={()=>setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3.5 w-3.5"/></button>}</div><button onClick={()=>setCustomOpen(true)} className="shrink-0 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">+ Custom</button><div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-slate-800"><button onClick={()=>setView("list")} className={`flex h-7 w-8 items-center justify-center rounded-md ${view==="list"?"bg-white shadow-sm dark:bg-slate-900":"text-slate-400"}`} title="List"><span className="text-[13px]">☰</span></button><button onClick={()=>setView("grid")} className={`flex h-7 w-8 items-center justify-center rounded-md ${view==="grid"?"bg-white shadow-sm dark:bg-slate-900":"text-slate-400"}`} title="Grid"><Grid2X2 className="h-3.5 w-3.5"/></button></div></div>
        <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2.5">
          {view==="list"?<div className="divide-y divide-slate-100 dark:divide-white/5">{filtered.map(i=>{const out=i.kind==="product"&&(i.stock||0)<=0;return <div key={keyOf(i.kind,i.id)} className="group flex items-center gap-3 px-2 py-2.5"><button onClick={()=>toggleFav(i)} className="shrink-0 text-slate-300 hover:text-amber-500 dark:text-slate-600"><Star className={`h-4 w-4 ${i.favorite?"fill-amber-400 text-amber-400":""}`}/></button><button disabled={out} onClick={()=>add(i)} className="min-w-0 flex-1 text-left disabled:opacity-40"><div className="flex items-center gap-2"><span className="truncate text-xs font-bold text-slate-900 dark:text-white">{i.name}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${i.kind==="product"?"bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300":"bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"}`}>{i.kind}</span></div><div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400"><span>{i.categoryName}</span>{i.code&&<span>· {i.code}</span>}{i.kind==="product"&&<span>· Stock {i.stock}</span>}</div></button><div className="w-24 text-right text-sm font-black tabular-nums text-slate-900 dark:text-white">{money(i.price)}</div><button disabled={out} onClick={()=>add(i)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-25 dark:bg-white dark:text-slate-950"><Plus className="h-4 w-4"/></button></div>})}</div>:<div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{filtered.map(i=>{const out=i.kind==="product"&&(i.stock||0)<=0;return <div key={keyOf(i.kind,i.id)} className="rounded-lg border border-slate-200 p-2.5 dark:border-white/10"><div className="flex justify-between"><button onClick={()=>toggleFav(i)} className="text-slate-300 hover:text-amber-500"><Star className={`h-4 w-4 ${i.favorite?"fill-amber-400 text-amber-400":""}`}/></button><span className="text-sm font-black tabular-nums">{money(i.price)}</span></div><button disabled={out} onClick={()=>add(i)} className="mt-2 w-full text-left disabled:opacity-35"><div className="line-clamp-2 min-h-9 text-xs font-bold">{i.name}</div><div className="mt-1 text-[10px] text-slate-400">{i.kind==="product"?`Stock ${i.stock}`:i.categoryName}</div></button><button disabled={out} onClick={()=>add(i)} className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-md bg-slate-100 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Plus className="h-3.5 w-3.5"/>Add</button></div>})}</div>}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/5"><div><p className="text-sm font-black text-slate-900 dark:text-white">Current bill</p><p className="text-[10px] text-slate-400">{cart.length} line{cart.length===1?"":"s"}</p></div><button onClick={()=>setCart([])} disabled={!cart.length} className="text-[10px] font-black text-slate-400 hover:text-rose-500">Clear</button></div>
        <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/5"><div className="relative"><UserRound className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/><input ref={customerRef} value={customer?.name||customerQ} onFocus={()=>setCustomerOpen(true)} onChange={e=>{setCustomerQ(e.target.value);setCustomerId("");setCustomerOpen(true)}} placeholder="Walk-in customer" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-xs font-semibold outline-none focus:border-blue-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"/>{(customerQ||customerId)&&<button onClick={()=>{setCustomerQ("");setCustomerId("")}} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-3 w-3"/></button>}</div>{customerOpen&&<div className="relative z-40"><div className="absolute left-0 right-0 top-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-slate-900">{customerMatches.map(c=><button key={c.id} onClick={()=>{setCustomerId(c.id);setCustomerQ("");setCustomerOpen(false)}} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><span><span className="block text-xs font-bold">{c.name}</span><span className="text-[10px] text-slate-400">{c.code||c.phone||"Customer"}</span></span><span className="text-[10px] font-black text-slate-500">{Number(c.balance)>0?`Due ${money(Number(c.balance))}`:"Clear"}</span></button>)}<button onClick={()=>router.push("/customers?new=1")} className="mt-1 w-full rounded-md border-t border-slate-100 px-2.5 py-2 text-left text-xs font-black text-blue-600 dark:border-white/5">+ New customer</button></div></div>}{customer&&Number(customer.balance)>0&&<div className="mt-1.5 flex justify-between text-[10px]"><span className="text-slate-400">Current Khata due</span><span className="font-black text-amber-600">{money(Number(customer.balance))}</span></div>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">{!cart.length?<div className="flex h-full min-h-56 flex-col items-center justify-center text-center text-slate-400"><ShoppingCart className="h-8 w-8 opacity-25"/><p className="mt-2 text-sm font-bold">Start a bill</p><p className="text-[10px]">Add any product or service from the catalog.</p></div>:<div className="divide-y divide-slate-100 dark:divide-white/5">{cart.map(l=><div key={l.key} className="py-2.5"><div className="flex gap-2"><div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{l.name}</div><div className="mt-1 flex items-center gap-1.5"><button onClick={()=>qty(l.key,-1)} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800"><Minus className="h-3 w-3"/></button><span className="w-5 text-center text-xs font-black">{l.qty}</span><button onClick={()=>qty(l.key,1)} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800"><Plus className="h-3 w-3"/></button><input value={l.rate} onChange={e=>rate(l.key,e.target.value)} className="h-6 w-20 rounded-md border border-slate-200 px-1.5 text-right text-[11px] font-bold dark:border-white/10 dark:bg-slate-900"/></div></div><div className="text-right"><div className="text-xs font-black tabular-nums">{money(l.qty*l.rate)}</div><button onClick={()=>setCart(c=>c.filter(x=>x.key!==l.key))} className="mt-1 text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5"/></button></div></div></div>)}</div>}</div>
        <div className="border-t border-slate-100 px-3 py-2.5 dark:border-white/5"><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-black text-slate-400">Discount<input value={discount} onChange={e=>setDiscount(e.target.value)} inputMode="decimal" placeholder="0" className={`${inputBase} mt-1 text-right`}/></label><div className="rounded-lg bg-slate-50 px-2.5 py-2 text-right dark:bg-slate-800"><div className="text-[10px] font-black text-slate-400">GST</div><div className="text-xs font-black">{money(gst.totalTax)}</div></div></div><div className="mt-2 flex items-end justify-between"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Payable</div><div className="text-2xl font-black tabular-nums">{money(total)}</div></div><button disabled={!cart.length} onClick={startCheckout} className="flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-30"><Zap className="h-4 w-4 fill-current"/>Checkout</button></div></div>
      </aside>
    </main>

    {checkoutOpen&&<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-3"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5"><div><h2 className="text-sm font-black">Checkout</h2><p className="text-[10px] text-slate-400">{customer?.name||"Walk-in customer"}</p></div><button onClick={()=>setCheckoutOpen(false)} className="text-slate-400"><X className="h-4 w-4"/></button></div><div className="space-y-3 p-4"><div className="grid grid-cols-3 gap-2"><div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"><div className="text-[9px] font-black text-slate-400">TOTAL</div><div className="text-sm font-black">{money(total)}</div></div><div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"><div className="text-[9px] font-black text-slate-400">COLLECTED</div><div className="text-sm font-black text-emerald-600">{money(collected)}</div></div><div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"><div className="text-[9px] font-black text-slate-400">DUE</div><div className="text-sm font-black text-amber-600">{money(due)}</div></div></div><div className="flex flex-wrap gap-2">{active.slice(0,4).map(i=><button key={i.id} onClick={()=>setPayments([{instrumentId:i.id,amount:Math.max(0,total).toFixed(2)}])} className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black dark:bg-slate-800">{i.name}</button>)}<button onClick={()=>setSplitOpen(v=>!v)} className={`rounded-full px-3 py-1.5 text-[11px] font-black ${splitOpen?"bg-blue-600 text-white":"border border-dashed border-slate-300 dark:border-white/10"}`}>+ Split</button></div>{splitOpen&&<div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">{payments.map((p,idx)=><div key={`${p.instrumentId}-${idx}`} className="grid grid-cols-[1fr_120px_32px] gap-2"><select value={p.instrumentId} onChange={e=>setPayments(rows=>rows.map((r,i)=>i===idx?{...r,instrumentId:e.target.value}:r))} className={inputBase}>{active.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><input value={p.amount} onChange={e=>setPayments(rows=>rows.map((r,i)=>i===idx?{...r,amount:e.target.value}:r))} inputMode="decimal" className={`${inputBase} text-right`}/><button onClick={()=>setPayments(rows=>rows.filter((_,i)=>i!==idx))} className="rounded-lg border border-slate-200 text-slate-400 dark:border-white/10">×</button></div>)}<div className="flex items-center justify-between"><button onClick={addPayment} className="text-xs font-black text-blue-700">+ Add payment</button><button onClick={()=>setPayments(rows=>rows.length?rows.map((r,i)=>i===rows.length-1?{...r,amount:Math.max(0,total-rows.slice(0,-1).reduce((s,x)=>s+(Number(x.amount)||0),0)).toFixed(2)}:r):rows)} className="text-xs font-black text-blue-700">Fill remainder</button></div></div>}<div className="grid grid-cols-2 gap-2">{error&&<div className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}<button onClick={()=>setCheckoutOpen(false)} className="h-11 rounded-xl border border-slate-200 text-sm font-black dark:border-white/10">Cancel</button><button disabled={busy||!cart.length||(collected>total+0.005)} onClick={saveSale} className="h-11 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-35">{busy?"Saving…":`Complete bill · ${money(total)}`}</button></div><p className="text-center text-[10px] text-slate-400">New POS bills use the existing canonical sale/accounting path.</p></div></div></div>}
    {customOpen&&<div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-3"><div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-sm font-black">Custom item</h2><button onClick={()=>setCustomOpen(false)} className="text-slate-400"><X className="h-4 w-4"/></button></div><div className="mt-3 space-y-2"><label className="text-[10px] font-black text-slate-400">Name<input autoFocus value={customName} onChange={e=>setCustomName(e.target.value)} className={`${inputBase} mt-1`}/></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-black text-slate-400">Rate<input value={customRate} onChange={e=>setCustomRate(e.target.value)} inputMode="decimal" className={`${inputBase} mt-1 text-right`}/></label><label className="text-[10px] font-black text-slate-400">GST %<input value={customGst} onChange={e=>setCustomGst(e.target.value)} inputMode="decimal" className={`${inputBase} mt-1 text-right`}/></label></div><button disabled={!customName.trim()||Number(customRate)<=0} onClick={addCustom} className="mt-2 h-10 w-full rounded-lg bg-slate-950 text-xs font-black text-white dark:bg-white dark:text-slate-950">Add to bill</button></div></div></div>}
    {success&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-3"><div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl dark:bg-slate-900"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-5 w-5"/></div><h2 className="mt-3 text-lg font-black">Bill saved</h2><p className="mt-1 text-xs text-slate-500">{success.number} · {money(success.total)} · Paid {money(success.paid)}{success.due>0?` · Due ${money(success.due)}`:""}</p><div className="mt-4 grid grid-cols-2 gap-2"><Link href={`/receipt/${success.id}/a4`} className="flex h-10 items-center justify-center rounded-lg border border-slate-200 text-xs font-black dark:border-white/10">Receipt</Link><button onClick={()=>setSuccess(null)} className="h-10 rounded-lg bg-slate-950 text-xs font-black text-white dark:bg-white dark:text-slate-950">New sale</button></div><button onClick={()=>router.push(`/invoices?q=${encodeURIComponent(success.number)}`)} className="mt-2 text-[11px] font-black text-blue-600 hover:underline">Open in Invoices</button></div></div>}
  </div>;
}
