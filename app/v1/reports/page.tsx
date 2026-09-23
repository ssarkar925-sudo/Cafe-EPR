import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";

type InvoiceRow={status:string;total:number;discount:number};
type PurchaseRow={total:number};
type ClaimRow={method:string;amount:number};
type ServiceRow={amount:number;fee:number;commission:number;status:string};
type CloseRow={status:string;variance:number};
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const FINAL=new Set(["server_validated","posted"]);
const money=(n:number)=>"₹"+n.toFixed(2);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
function date(v:string|undefined,f:string){return v&&ISO.test(v)?v:f}
function next(d:string){const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)}

export default async function V1Reports({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
 const session=await getV1SessionContext();
 if(!requireV1BackOffice(session))return <V1Forbidden surface="Reports"/>;
 const p=await searchParams;const today=new Date().toISOString().slice(0,10);
 const from=date(p.from,today),to=date(p.to,from),end=next(to);const db=await createClient();
 const [i,pur,c,s,dc]=await Promise.all([
  db.from("invoices").select("status,total,discount").eq("tenant_id",session.tenantId).gte("invoice_date",from).lt("invoice_date",end),
  db.from("purchases").select("total").eq("tenant_id",session.tenantId).gte("purchase_date",from).lt("purchase_date",end),
  db.from("payment_claims").select("method,amount").eq("tenant_id",session.tenantId).eq("claim_state","recognized").gte("recorded_at",from+"T00:00:00.000Z").lt("recorded_at",end+"T00:00:00.000Z"),
  db.from("service_transactions").select("amount,fee,commission,status").eq("tenant_id",session.tenantId).gte("transaction_date",from).lt("transaction_date",end),
  db.from("day_closes").select("status,variance").eq("tenant_id",session.tenantId).gte("business_date",from).lte("business_date",to)
 ]);
 const errors=[i.error,pur.error,c.error,s.error,dc.error].filter(Boolean);
 const invoices=(i.data??[]) as InvoiceRow[], purchases=(pur.data??[]) as PurchaseRow[],claims=(c.data??[]) as ClaimRow[],services=(s.data??[]) as ServiceRow[],closes=(dc.data??[]) as CloseRow[];
 const finals=invoices.filter(x=>FINAL.has(x.status)),provisional=invoices.filter(x=>!FINAL.has(x.status)),recorded=services.filter(x=>x.status==="recorded");
 const sales=sum(finals.map(x=>Number(x.total))),discount=sum(finals.map(x=>Number(x.discount))),purchase=sum(purchases.map(x=>Number(x.total))),collections=sum(claims.map(x=>Number(x.amount))),service=sum(recorded.map(x=>Number(x.amount))),fees=sum(recorded.map(x=>Number(x.fee))),commission=sum(recorded.map(x=>Number(x.commission))),variance=sum(closes.map(x=>Number(x.variance)));
 const methods=new Map<string,number>();for(const x of claims)methods.set(x.method,(methods.get(x.method)??0)+Number(x.amount));
 return <div className="mx-auto max-w-6xl space-y-6">
  <div><h1 className="text-xl font-extrabold">Reports</h1><p className="mt-1 text-sm text-slate-500">Operational, server-derived reporting. No tax engine or P&amp;L interpretation.</p></div>
  <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border p-4"><label className="text-xs font-bold">From<input name="from" type="date" defaultValue={from} className="mt-1 block rounded-lg border px-3 py-2 text-sm"/></label><label className="text-xs font-bold">To<input name="to" type="date" defaultValue={to} className="mt-1 block rounded-lg border px-3 py-2 text-sm"/></label><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Apply</button></form>
  {errors.length>0&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errors.map(e=>e?.message).filter(Boolean).join(" · ")}</div>}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Final sales",sales,finals.length+" invoices"],["Purchases",purchase,purchases.length+" documents"],["Recognized collections",collections,claims.length+" claims"],["Recorded services",service,recorded.length+" transactions"]].map(([l,v,d])=><section key={String(l)} className="rounded-2xl border p-4"><p className="text-xs font-bold uppercase text-slate-500">{l}</p><p className="mt-2 text-xl font-extrabold">{money(Number(v))}</p><p className="mt-1 text-xs text-slate-500">{d}</p></section>)}</div>
  <div className="grid gap-4 lg:grid-cols-2">
   <section className="rounded-2xl border p-4"><h2 className="text-sm font-extrabold">Sales controls</h2><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Final discounts</dt><dd>{money(discount)}</dd></div><div className="flex justify-between"><dt>Provisional/non-final</dt><dd>{provisional.length}</dd></div></dl></section>
   <section className="rounded-2xl border p-4"><h2 className="text-sm font-extrabold">Collections by method</h2><dl className="mt-3 space-y-2 text-sm">{[...methods.entries()].map(([m,a])=><div key={m} className="flex justify-between"><dt className="capitalize">{m}</dt><dd>{money(a)}</dd></div>)}</dl></section>
   <section className="rounded-2xl border p-4"><h2 className="text-sm font-extrabold">Record-only services</h2><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Amount</dt><dd>{money(service)}</dd></div><div className="flex justify-between"><dt>Fees</dt><dd>{money(fees)}</dd></div><div className="flex justify-between"><dt>Commission</dt><dd>{money(commission)}</dd></div></dl></section>
   <section className="rounded-2xl border p-4"><h2 className="text-sm font-extrabold">Day-close</h2><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt>Close records</dt><dd>{closes.length}</dd></div><div className="flex justify-between"><dt>Aggregate variance</dt><dd>{money(variance)}</dd></div><div className="flex justify-between"><dt>Locked</dt><dd>{closes.filter(x=>x.status==="locked").length}</dd></div><div className="flex justify-between"><dt>Variance pending</dt><dd>{closes.filter(x=>x.status==="variance_pending").length}</dd></div></dl></section>
  </div><p className="text-[11px] text-slate-400">Period: {from} through {to}. Tenant-scoped under authenticated RLS.</p>
 </div>;
}
