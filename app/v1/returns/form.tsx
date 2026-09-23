"use client";

import {useMemo,useState} from "react";
import {callV1Mutation} from "@/lib/v1/v1-rpc";
import {sha256Hex,scopeKey} from "@/app/v1/pos/discount";
import type {V1ReturnDisposition,V1RefundMethod,V1ReturnLineInput} from "@/lib/v1/v1-contracts";

type Invoice={id:string;canonical_number:string;invoice_date:string;customer_id:string|null;subtotal:number;discount:number;total:number;status:string};
type Line={id:string;product_id:string;qty:number;rate:number;amount:number};
type Product={id:string;name:string;sku:string|null;barcode:string|null};

export default function ReturnsForm({invoice,lines,products}:{sessionRole:string;invoice:Invoice;lines:Line[];products:Product[]}){
 const names=useMemo(()=>new Map(products.map(p=>[p.id,p.name])),[products]);
 const [qty,setQty]=useState<Record<string,string>>({});
 const [disposition,setDisposition]=useState<Record<string,V1ReturnDisposition>>({});
 const [reason,setReason]=useState("");
 const [refundMethod,setRefundMethod]=useState<V1RefundMethod>(invoice.customer_id?"khata_credit":"cash");
 const [instrument,setInstrument]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [result,setResult]=useState<any>(null);

 function selected():V1ReturnLineInput[]{
  return lines.filter(l=>Number(qty[l.id]??0)>0).map(l=>({invoice_line_id:l.id,qty:Number(qty[l.id]),disposition:disposition[l.id]??"sellable",reason:reason.trim()}));
 }
 async function submit(){
  setError(null);const selectedLines=selected();
  if(!selectedLines.length){setError("Select at least one return quantity.");return}
  if(!reason.trim()){setError("Return reason is required.");return}
  if(refundMethod==="khata_credit"&&!invoice.customer_id){setError("Khata credit requires a customer on the original invoice.");return}
  if(refundMethod==="cash"&&!instrument.trim()){setError("Select the cash refund instrument id.");return}
  for(const l of selectedLines){const original=lines.find(x=>x.id===l.invoice_line_id);if(!original||l.qty>original.qty){setError("Return quantity exceeds the sold quantity.");return}}
  setBusy(true);
  try{
   const scope={entity_type:"return",action:"return_refund",original_invoice_id:invoice.id,lines:selectedLines,refund_method:refundMethod,refund_instrument_id:refundMethod==="cash"?instrument:null};
   const hash=await sha256Hex(scopeKey(scope));
   const r=await callV1Mutation("request_return",{p_invoice_id:invoice.id,p_lines:selectedLines,p_refund_method:refundMethod,p_refund_instrument_id:refundMethod==="cash"?instrument:null,p_scope_hash:hash,p_reason:reason.trim()});
   if(r.error){setError(r.error.message);return}
   setResult(r.data);setQty({});
  }catch(e){setError(e instanceof Error?e.message:"Return request failed.")}finally{setBusy(false)}
 }
 return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
  <div><h2 className="text-sm font-extrabold">{invoice.canonical_number}</h2><p className="text-xs text-slate-500">Total ₹{Number(invoice.total).toFixed(2)} · Header discount ₹{Number(invoice.discount).toFixed(2)} · proportional discount allocation applies.</p></div>
  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="p-2">Product</th><th className="p-2">Sold</th><th className="p-2">Rate</th><th className="p-2">Return qty</th><th className="p-2">Disposition</th></tr></thead><tbody>
   {lines.map(l=><tr key={l.id} className="border-b border-slate-100 dark:border-white/5"><td className="p-2 font-semibold">{names.get(l.product_id)??l.product_id.slice(0,8)}</td><td className="p-2">{Number(l.qty)}</td><td className="p-2">₹{Number(l.rate).toFixed(2)}</td><td className="p-2"><input type="number" min="0" max={Number(l.qty)} step="0.01" value={qty[l.id]??""} onChange={e=>setQty(x=>({...x,[l.id]:e.target.value}))} className="w-28 rounded-lg border px-2 py-1.5 dark:border-white/10 dark:bg-white/5"/></td><td className="p-2"><select value={disposition[l.id]??"sellable"} onChange={e=>setDisposition(x=>({...x,[l.id]:e.target.value as V1ReturnDisposition}))} className="rounded-lg border px-2 py-1.5 dark:border-white/10 dark:bg-white/5"><option value="sellable">Sellable</option><option value="damaged">Damaged / quarantine</option></select></td></tr>)}
  </tbody></table></div>
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-xs font-bold">Refund method<select value={refundMethod} onChange={e=>setRefundMethod(e.target.value as V1RefundMethod)} className="mt-1 block w-full rounded-lg border px-3 py-2 dark:border-white/10 dark:bg-white/5"><option value="khata_credit" disabled={!invoice.customer_id}>Khata credit</option><option value="cash">Cash (Admin approval)</option></select></label>
   {refundMethod==="cash"&&<label className="text-xs font-bold">Cash instrument UUID<input value={instrument} onChange={e=>setInstrument(e.target.value)} placeholder="Configured cash instrument id" className="mt-1 block w-full rounded-lg border px-3 py-2 dark:border-white/10 dark:bg-white/5"/></label>}
   <label className="text-xs font-bold md:col-span-2">Reason<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason required" className="mt-1 block w-full rounded-lg border px-3 py-2 dark:border-white/10 dark:bg-white/5"/></label>
  </div>
  {error&&<p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}
  {result&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Return requested: {result.return_number}. Admin approval is required before execution. Approval: {result.approval_id}</p>}
  <button type="button" onClick={submit} disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">{busy?"Requesting…":"Request return approval"}</button>
 </section>;
}
