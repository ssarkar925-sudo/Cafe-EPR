import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

function clean(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function safeLike(value: string) {
  return value.replace(/[\\%_]/g, "");
}

export async function POST(request: Request) {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  // Cafe AI Agent uses Gemini for quick-sale parsing. The existing Chat AI remains unchanged.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI is not connected. Add GEMINI_API_KEY to the server environment." }, { status: 503 });

  const requestedModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const models = Array.from(new Set([requestedModel, "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"]));
  const requestBody = {
    systemInstruction: { parts: [{ text: "Extract only a quick-sale request from the owner's message. Support Bengali, Hindi, English and mixed language. Never invent an item. For a quick sale, return item names and positive quantities, payment method and optional customer name. If the request is not clearly a quick sale, return unsupported. Do not calculate prices." }] },
    contents: [{ role: "user", parts: [{ text: message }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["quick_sale", "unsupported"] },
          items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "number" } }, required: ["name", "qty"], additionalProperties: false } },
          payment_method: { type: "string", enum: ["cash", "upi", "card", "credit", "other"] },
          customer_name: { type: "string", nullable: true },
        },
        required: ["action", "items", "payment_method", "customer_name"],
        additionalProperties: false,
      },
    },
  };

  let data: any = null;
  let lastError = "Gemini request failed";
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(requestBody),
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;
      lastError = data?.error?.message || `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Gemini network request failed";
    }
  }

  if (!data?.candidates?.[0]?.content?.parts) return NextResponse.json({ error: lastError }, { status: 502 });
  const outputText = data.candidates[0].content.parts.map((part: any) => part?.text).filter(Boolean).join("\n");

  let parsed: ParsedCommand;
  try {
    parsed = JSON.parse(outputText || "{}");
  } catch {
    return NextResponse.json({ error: "Gemini could not structure the quick-sale request." }, { status: 422 });
  }

  if (parsed.action !== "quick_sale" || !parsed.items?.length) return NextResponse.json({ action: "unsupported", message: "This request is not a complete quick sale. I have not changed anything." });

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
    const name = safeLike(parsed.customer_name.trim());
    const { data: customers } = await supabase.from("customers").select("id,name,phone,state_code,gstin,balance").eq("is_active", true).ilike("name", `%${name}%`).limit(5);
    if (!customers?.length) return NextResponse.json({ action: "needs_input", message: `Customer '${parsed.customer_name}' was not found. I have not changed anything.` }, { status: 422 });
    if (customers.length > 1) return NextResponse.json({ action: "needs_input", message: `More than one customer matches '${parsed.customer_name}'. Please choose one.`, customers: customers.map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })) }, { status: 422 });
    customer = customers[0];
  }

  const paymentMethod = parsed.payment_method === "other" ? "cash" : parsed.payment_method;
  const gst = calculateGstInvoice({ lines: resolved.map((x) => ({ qty: x.qty, rate: x.rate, gstRate: x.gst_rate, hsnSac: x.hsn_sac, taxTreatment: x.gst_rate > 0 ? "taxable" : "non_gst" })), invoiceLumpSumDiscount: 0, supplierStateCode: "19", customerStateCode: customer?.state_code ?? null, customerGstin: customer?.gstin ?? null });
  const total = gst.invoiceTotal;
  const { data: instruments } = await supabase.from("payment_instruments").select("id,name,type").eq("is_active", true).eq("type", paymentMethod).order("name").limit(1);
  const instrumentId = instruments?.[0]?.id ?? null;
  const payment = [{ method: paymentMethod, amount: total, instrument_id: instrumentId }];
  const approval = await requireOwnerApproval("create_sale", { source: "cafe-ai-quick-sale", original_request: message, customer_id: customer?.id ?? null, customer_name: customer?.name ?? null, customer_state_code: customer?.state_code ?? null, customer_gstin: customer?.gstin ?? null, payment, items: resolved, expected_total: total });

  return NextResponse.json({ action: "approval_required", approval_id: approval.id, approval, summary: { customer: customer?.name ?? "Walk-in customer", payment_method: paymentMethod, total, items: resolved.map((x) => ({ name: x.name, qty: x.qty, rate: x.rate, amount: Number((x.qty * x.rate).toFixed(2)) })) }, message: "Quick sale prepared. Owner approval is required before Cafe-EPR is changed." });
}
