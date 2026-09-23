"use client";
import {useState} from "react";
import {callV1Mutation} from "@/lib/v1/v1-rpc";

export default function ReturnActions({id,status}:{id:string;status:string}){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState<string|null>(null);
 async function run(name:string,args:Record<string,unknown>){
  setBusy(true);setMessage(null);const r=await callV1Mutation(name,args);setMessage(r.error?.message??"Completed. Refresh to see the server state.");setBusy(false);
 }
 if(status==="posted"||status==="cancelled"||status==="rejected")return <span className="text-xs text-slate-400">No action</span>;
 return <div className="flex flex-wrap gap-2">
  <button type="button" disabled={busy} onClick={()=>run("execute_return",{p_return_id:id})} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">Execute after approval</button>
  <button type="button" disabled={busy} onClick={()=>run("cancel_return",{p_return_id:id,p_reason:"Cancelled by operator"})} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50">Cancel</button>
  {message&&<span role="status" className="basis-full text-xs text-slate-500">{message}</span>}
 </div>;
}
