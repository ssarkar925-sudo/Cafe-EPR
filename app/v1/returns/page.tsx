import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext } from "@/lib/v1/v1-auth-context";
import V1Forbidden from "@/components/v1/v1-forbidden";
import ReturnsForm from "./form";

type Invoice={id:string;canonical_number:string;invoice_date:string;customer_id:string|null;subtotal:number;discount:number;total:number;status:string};
type Line={id:string;product_id:string;qty:number;rate:number;amount:number};
type Product={id:string;name:string;sku:string|null;barcode:string|null};

export default async function V1Returns({searchParams}:{searchParams:Promise<{invoice?:string}>}){
 const session=await getV1SessionContext();
 if(!session.isActive)return <V1Forbidden surface="Returns"/>;
 const p=await searchParams;const db=await createClient();
 const invoices=await db.from("invoices").select("id,canonical_number,invoice_date,customer_id,subtotal,discount,total,status").eq("tenant_id",session.tenantId).eq("status","posted").order("invoice_date",{ascending:false}).limit(100);
 if(invoices.error)return <div className="mx-auto max-w-5xl"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{invoices.error.message}</p></div>;
 const invoice=(invoices.data??[]).find(x=>x.id===p.invoice) as Invoice|undefined;
 let lines:Line[]=[];let products:Product[]=[];
 if(invoice){
  const [lr,pr]=await Promise.all([
   db.from("invoice_lines").select("id,product_id,qty,rate,amount").eq("tenant_id",session.tenantId).eq("invoice_id",invoice.id).order("created_at"),
   db.from("products").select("id,name,sku,barcode").eq("tenant_id",session.tenantId)
  ]);
  if(lr.error||pr.error)return <div className="mx-auto max-w-5xl"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{lr.error?.message??pr.error?.message}</p></div>;
  lines=(lr.data??[]) as Line[];products=(pr.data??[]) as Product[];
 }
 return <div className="mx-auto max-w-5xl space-y-5">
  <div><h1 className="text-xl font-extrabold">Returns / Refunds</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Admin approval is required for every return. The original invoice is never edited.</p></div>
  <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
   <label className="min-w-[280px] flex-1 text-xs font-bold">Posted invoice
    <select name="invoice" defaultValue={invoice?.id??""} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
     <option value="">Select invoice…</option>{(invoices.data??[]).map(x=><option key={x.id} value={x.id}>{x.canonical_number} · {x.invoice_date} · ₹{Number(x.total).toFixed(2)}</option>)}
    </select>
   </label>
   <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-slate-900">Open</button>
  </form>
  {invoice&&<ReturnsForm sessionRole={session.role} invoice={invoice} lines={lines} products={products}/>}
  {!invoice&&<p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/10">Select a posted invoice to begin a return request.</p>}
 </div>;
}
