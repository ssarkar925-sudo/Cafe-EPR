import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchText, rankCustomerResults } from "@/lib/customer-search";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";
import { calculateGstInvoice } from "@/lib/gst";

export const dynamic = "force-dynamic";

type ParsedItem = { name: string; qty: number };
type ParsedCommand = {
  action: "quick_sale" | "unsupported";
  items: ParsedItem[];
  payment_method: "cash" | "upi" | "card" | "credit" | "other";
  customer_name: string | null;
};

const DEPRECATED_GEMINI_MODELS = new Set(["gemini-2.0-flash-001"]);
const DEFAULT_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function getGeminiModels() {
  const configured = (process.env.GEMINI_MODEL || "").trim();
  const requested = configured && !DEPRECATED_GEMINI_MODELS.has(configured) ? configured : "gemini-2.5-flash";
  return Array.from(new Set([requested, ...DEFAULT_GEMINI_MODELS])).filter((model) => !DEPRECATED_GEMINI_MODELS.has(model));
}

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-zA-Z0-9\s]+/g, " ").trim();
}

function safeLike(value: string) {
  return value.replace(/[\\%_]/g, "");
}

function parseQuickSaleLocally(message: string): ParsedCommand | null {
  const text = message.trim();
  const lower = text.toLowerCase();
  const payment_method: ParsedCommand["payment_method"] = /\bupi\b/i.test(lower)
    ? "upi"
    : /\bcard\b/i.test(lower)
    ? "card"
    : /\bcredit|khata\b/i.test(lower)
    ? "credit"
    : "cash";

  const custMatch = text.match(/(?:for|customer|to)\s+([A-Za-z\s]+?)(?:,|\.|\s+(?:cash|upi|card|pay)|$)/i);
  const customer_name = custMatch ? custMatch[1].trim() : null;

  const items: ParsedItem[] = [];
  const regex = /(\d+)\s+([a-zA-Z\s]+?)(?:and|\+|,|\.|$|cash|upi|card)/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const qty = parseInt(m[1], 10);
    const name = m[2].trim();
    if (qty > 0 && name.length > 1 && !["for", "to", "customer", "and", "cash", "upi", "card"].includes(name.toLowerCase())) {
      items.push({ name, qty });
    }
  }
  if (!items.length) return null;
  return { action: "quick_sale", items, payment_method, customer_name };
}

export async function POST(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });
    if (message.length > 16000) return NextResponse.json({ error: "Message is too long" }, { status: 413 });

    let parsed: ParsedCommand | null = null;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey.length > 15 && !apiKey.includes("[SENSITIVE")) {
      const requestBody = {
        systemInstruction: { parts: [{ text: "Extract only a counter sale request from the owner's message. Support Bengali, Hindi, English and mixed language. Never invent an item. For a sale, return item names and positive quantities, payment method and optional customer name. If the request is not clearly a sale, return unsupported. Do not calculate prices." }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              action: { type: "STRING", enum: ["quick_sale", "unsupported"] },
              items: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, qty: { type: "NUMBER" } }, required: ["name", "qty"] } },
              payment_method: { type: "STRING", enum: ["cash", "upi", "card", "credit", "other"] },
              customer_name: { type: "STRING" },
            },
            required: ["action", "items", "payment_method"],
          },
        },
      };

      for (const model of getGeminiModels()) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(30000),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data?.candidates?.[0]?.content?.parts) {
            const outputText = data.candidates[0].content.parts.map((part: any) => part?.text).filter(Boolean).join("\n");
            parsed = JSON.parse(outputText || "{}");
            break;
          }
        } catch {
          // fall through to next model or local fallback
        }
      }
    }

    // Fallback to local heuristic parser if Gemini is unavailable
    if (!parsed || parsed.action !== "quick_sale") {
      parsed = parseQuickSaleLocally(message);
    }

    if (!parsed || parsed.action !== "quick_sale" || !parsed.items?.length) {
      return NextResponse.json({ action: "unsupported", message: "This request is not a complete sale. I have not changed anything." });
    }

    const supabase = await createClient();
    const [{ data: products, error: productsError }, { data: services, error: servicesError }] = await Promise.all([
      supabase.from("products").select("id,name,sale_price,cost_price,stock_qty,hsn_code,gst_rate").eq("is_active", true),
      supabase.from("services").select("id,name,sale_price,cost_price,sac_code,gst_rate").eq("is_active", true),
    ]);
    if (productsError) return NextResponse.json({ error: productsError.message }, { status: 500 });
    if (servicesError) return NextResponse.json({ error: servicesError.message }, { status: 500 });

    const catalog = [
      ...(products ?? []).map((p: any) => ({ ...p, kind: "product" as const })),
      ...(services ?? []).map((s: any) => ({ ...s, kind: "service" as const })),
    ];
    const resolved: any[] = [];
    const problems: string[] = [];
    for (const requested of parsed.items) {
      const qty = Math.floor(Number(requested.qty));
      if (!requested.name?.trim() || qty <= 0) { problems.push(`Invalid item: ${requested.name || "unknown"}`); continue; }
      const needle = clean(requested.name);
      const exact = catalog.filter((x) => clean(String(x.name)) === needle);
      const partial = catalog.filter((x) => clean(String(x.name)).includes(needle) || needle.includes(clean(String(x.name))));
      const matches = exact.length ? exact : partial;
      if (matches.length !== 1) { problems.push(matches.length > 1 ? `Ambiguous item: ${requested.name}` : `Item not found: ${requested.name}`); continue; }
      const item = matches[0];
      if (item.kind === "product" && Number(item.stock_qty) < qty) { problems.push(`${item.name}: only ${Number(item.stock_qty)} in stock`); continue; }
      resolved.push({ id: item.id, kind: item.kind, name: item.name, qty, rate: Number(item.sale_price), cost_price: Number(item.cost_price ?? 0), gst_rate: Number(item.gst_rate ?? 0), hsn_sac: item.kind === "product" ? item.hsn_code ?? null : item.sac_code ?? null });
    }
    if (problems.length) return NextResponse.json({ action: "needs_input", problems, message: "I have not changed anything. Please correct these items." }, { status: 422 });

    let customer: any = null;
    if (parsed.customer_name?.trim()) {
      const rawName = parsed.customer_name.trim();
      // PostgREST OR-safe pattern (safeLike strips wildcards; commas/parens break OR syntax).
      const name = safeLike(rawName).replace(/[,()]/g, "").slice(0, 60);
      const digits = rawName.replace(/\D/g, "").slice(0, 20);
      const ors = [`name.ilike.%${name}%`];
      if (digits.length >= 7) ors.push(`phone.ilike.%${digits}%`);
      const { data: customers } = await supabase.from("customers").select("id,name,code,phone,state_code,gstin,balance").eq("is_active", true).or(ors.join(",")).limit(10);
      // Canonical ranking: a single exact-tier winner resolves unambiguously.
      const ranked = rankCustomerResults(customers ?? [], rawName, 10);
      const exactWinners = ranked.filter((r) => r.match.tier === "exact-id" || r.match.tier === "exact-phone" || r.match.tier === "exact-name");
      if (ranked.length === 0) return NextResponse.json({ action: "needs_input", message: `Customer '${parsed.customer_name}' was not found. I have not changed anything.` }, { status: 422 });
      if (exactWinners.length === 1) {
        customer = exactWinners[0].record;
      } else if (ranked.length === 1) {
        customer = ranked[0].record;
      } else {
        return NextResponse.json({ action: "needs_input", message: `More than one customer matches '${parsed.customer_name}'. Please choose one.`, customers: ranked.slice(0, 5).map((r: any) => ({ id: r.record.id, name: r.record.name, phone: r.record.phone })) }, { status: 422 });
      }
    }

    const paymentMethod = parsed.payment_method === "other" ? "cash" : parsed.payment_method;
    const gst = calculateGstInvoice({ lines: resolved.map((x) => ({ qty: x.qty, rate: x.rate, gstRate: x.gst_rate, hsnSac: x.hsn_sac, taxTreatment: x.gst_rate > 0 ? "taxable" : "non_gst" })), invoiceLumpSumDiscount: 0, supplierStateCode: "19", customerStateCode: customer?.state_code ?? null, customerGstin: customer?.gstin ?? null });
    const total = gst.invoiceTotal;
    const { data: instruments } = await supabase.from("payment_instruments").select("id,name,type").eq("is_active", true).eq("type", paymentMethod).order("name").limit(1);
    const instrumentId = instruments?.[0]?.id ?? null;
    const payment = [{ method: paymentMethod, amount: total, instrument_id: instrumentId }];
    const approval = await requireOwnerApproval("create_sale", { source: "cafe-ai-quick-sale", original_request: message, customer_id: customer?.id ?? null, customer_name: customer?.name ?? null, customer_state_code: customer?.state_code ?? null, customer_gstin: customer?.gstin ?? null, payment, items: resolved, expected_total: total });

    return NextResponse.json({ action: "approval_required", approval_id: approval.id, approval, summary: { customer: customer?.name ?? "Walk-in customer", payment_method: paymentMethod, total, items: resolved.map((x) => ({ name: x.name, qty: x.qty, rate: x.rate, amount: Number((x.qty * x.rate).toFixed(2)) })) }, message: "Sale prepared. Owner approval is required before Cafe-EPR is changed." });
  } catch (error) {
    console.error("AI sale drafting failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cafe AI sale drafting failed" }, { status: 502 });
  }
}
