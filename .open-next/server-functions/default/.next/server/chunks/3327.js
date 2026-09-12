exports.id=3327,exports.ids=[3327],exports.modules={39313:(a,b,c)=>{"use strict";c.d(b,{Lg:()=>e,Pr:()=>d,wn:()=>f});let d={auto_send_pos:!1,auto_send_quick:!1,auto_send_payment:!1,auto_send_due_reminder:!1,auto_send_document_ready:!1,auto_send_aeps:!1,auto_send_dmt:!1,auto_send_recharge:!1,auto_send_daily_summary:!1,auto_send_financial_alerts:!1},e={pos_invoice:`🧾 *TAX INVOICE: {invoice_number}*
📅 Date: {invoice_date}
{customer_name_line}───────────────
💰 Total Bill: {total_amount}
💳 Amount Paid: {paid_amount}
{status_line}
───────────────
📄 View / Download A4 Invoice (PDF):
{receipt_url}

Thank you for choosing {shop_name}!`,quick_sale:`🧾 *QUICK SALE RECEIPT: {sale_number}*
📅 Date: {sale_date}
{customer_name_line}───────────────
📦 Item: {item_name}
💰 Amount Paid: {paid_amount}
───────────────
📄 View / Download Receipt:
{receipt_url}

Thank you for your business!`,payment_receipt:`💳 *PAYMENT CONFIRMATION - {shop_name}*

Dear {customer_name},
We have received your payment of *{paid_amount}* towards Invoice *#{invoice_number}*.

📅 Date: {date}
💰 Remaining Balance Due: {due_amount}
───────────────
📄 View Updated Invoice:
{receipt_url}

Thank you for your timely payment!`,due_reminder:`⚠️ *PAYMENT REMINDER - {shop_name}*

Dear {customer_name},
This is a friendly reminder that you have an outstanding balance of *{due_amount}* on Invoice *#{invoice_number}* (Dated: {invoice_date}).

📄 View Invoice Details & Scan to Pay:
{receipt_url}

Please settle at your earliest convenience. Thank you!`,doc_ready:`📂 *DOCUMENT READY FOR PICKUP - {shop_name}*

Dear {customer_name},
Your requested document / service *{document_name}* is completed and ready for pickup.

📅 Completion Date: {date}
🏷️ Reference: {ref_number}
───────────────
Please visit the store during business hours. Thank you!`,aeps_confirmation:`🏧 *AEPS CASH WITHDRAWAL RECEIPT*
🔢 Txn RRN: {ref_number}
📅 Date: {date}
{customer_name_line}───────────────
💰 Withdrawal Amount: {amount}
🏷️ Service Fee: {service_fee}
✅ Status: SUCCESS
───────────────
📄 View Official Digital Receipt:
{receipt_url}

Thank you for banking with {shop_name}!`,dmt_confirmation:`💸 *MONEY TRANSFER CONFIRMATION*
🔢 Txn RRN: {ref_number}
📅 Date: {date}
{customer_name_line}───────────────
💰 Remittance Amount: {amount}
🏷️ Transfer Fee: {service_fee}
✅ Status: TRANSFERRED
───────────────
📄 View Official Remittance Receipt:
{receipt_url}

Thank you for using {shop_name}!`,recharge_confirmation:`📱 *RECHARGE SUCCESSFUL*
🔢 Txn No: {txn_number}
📅 Date: {date}
───────────────
📱 Mobile / Service: {phone}
💰 Plan Amount: {amount}
✅ Status: SUCCESS
───────────────
Thank you for choosing {shop_name}!`,banking_txn:`📱 *{service_name} RECEIPT*
🔢 Txn No: {txn_number}
📅 Date: {txn_date}
{customer_name_line}───────────────
💰 Amount: {amount}
🏷️ Ref / RRN: {ref_number}
✅ Status: {status}
───────────────
📄 View / Download Receipt (PDF):
{receipt_url}

Thank you for choosing {shop_name}!`,daily_summary:`📊 *DAILY EXECUTIVE SUMMARY - {shop_name}*
📅 Date: {date}
───────────────
💰 Operating Revenue: {total_revenue}
📉 Recorded Expenses: {total_expenses}
📈 Business Profit Before Tax: {net_profit}

🏦 Physical Cash Drawer: {cash_balance}
🏛️ Bank Accounts: {bank_balance}
📱 Digital Float: {float_balance}

🛡️ Financial Integrity: {audit_score}/100 {audit_status}
🔒 Day Close: {day_close_status}
───────────────
Authoritative Canonical ERP System`,financial_alert:`🚨 *FINANCIAL INTEGRITY ALARM - {shop_name}*
⚠️ Priority: {severity}

{alert_reason}

📅 Timestamp: {date}
🛡️ Audit Run Score: {audit_score}/100
───────────────
Please open /ai/self-audit immediately to review and resolve this invariant finding.`,day_close:`📊 *DAILY STORE HANDOVER CERTIFICATE*

🏪 Store: {shop_name}
📅 Date: {close_date}
🔢 Shift Closing: #{closing_number}
───────────────
💰 Net Shift Profit: {net_profit}
💼 Total Liquid Position: {liquid_position}
───────────────
📄 View Handover Audit Certificate:
{receipt_url}`};function f(a){let b=String(a||"").replace(/\D/g,"");return(b.startsWith("00")&&(b=b.slice(2)),b.startsWith("0")&&11===b.length&&(b=b.slice(1)),10===b.length)?`91${b}`:b}},78335:()=>{},89368:(a,b,c)=>{"use strict";c.d(b,{DM:()=>e});let d=Symbol.for("__cloudflare-context__");function e(a={async:!1}){return a.async?g():function(){let a=f();if(a)return a;if(function(){let a=globalThis;return a.__NEXT_DATA__?.nextExport===!0}())throw Error("\n\nERROR: `getCloudflareContext` has been called in sync mode in either a static route or at the top level of a non-static one, both cases are not allowed but can be solved by either:\n  - make sure that the call is not at the top level and that the route is not static\n  - call `getCloudflareContext({async: true})` to use the `async` mode\n  - avoid calling `getCloudflareContext` in the route\n");throw Error(i)}()}function f(){return globalThis[d]}async function g(){let a=f();if(a)return a;{var b;let a=await h();return b=a,globalThis[d]=b,a}}async function h(a){let{getPlatformProxy:b}=await import(`${"__wrangler".replaceAll("_","")}`),c=a?.environment??process.env.NEXT_DEV_WRANGLER_ENV,{env:d,cf:e,ctx:f}=await b({...a,envFiles:[],environment:c});return{env:d,cf:e,ctx:f}}let i='\n\nERROR: `getCloudflareContext` has been called without having called `initOpenNextCloudflareForDev` from the Next.js config file.\nYou should update your Next.js config file as shown below:\n\n   ```\n   // next.config.mjs\n\n   import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\n\n   initOpenNextCloudflareForDev();\n\n   const nextConfig = { ... };\n   export default nextConfig;\n   ```\n\n'},96487:()=>{},99875:(a,b,c)=>{"use strict";c.d(b,{E:()=>h,Z:()=>g});var d=c(5903),e=c(89368);function f(){let a=function(){try{let a=(0,e.DM)();return a?.env||{}}catch{return{}}}(),b=String("[SENSITIVE]").trim(),c=String(process.env.SUPABASE_SERVICE_ROLE_KEY||a.SUPABASE_SERVICE_ROLE_KEY||a.SUPABASE_SECRET_KEY||process.env.SUPABASE_SECRET_KEY||"").trim();if(!b)throw Error("NEXT_PUBLIC_SUPABASE_URL is required for server-side admin operations.");if(!c)throw Error("Supabase server secret is not available to the Worker runtime. Configure SUPABASE_SERVICE_ROLE_KEY as a Worker secret and redeploy.");return{url:b,serviceKey:c}}function g(){let{url:a,serviceKey:b}=f();return(0,d.UU)(a,b,{auth:{autoRefreshToken:!1,persistSession:!1}})}function h(){let{url:a,serviceKey:b}=f();return(0,d.UU)(a,b,{auth:{autoRefreshToken:!1,persistSession:!1}})}}};