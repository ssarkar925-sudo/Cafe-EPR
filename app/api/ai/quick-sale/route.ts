import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { requireOwnerApproval } from "@/lib/ai/approval-gate";

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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Cafe AI is not connected." }, { status: 503 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "low" },
      instructions: `Extract only a quick-sale request from the owner's message. Support Bengali, Hindi, English and mixed language. Never invent an item. For a quick sale, return item names and positive quantities, payment method and optional customer name. If the request is not clearly a quick sale, return unsupported. Do not calculate prices.`,
      input: message,
      text: {
        format: {
          type: "json_schema",
          name: "quick_sale_command",
          strict: true,
          schema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["quick_sale", "unsupported"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: { type: "string" }, qty: { type: "number" } },
                  required: ["name", "qty"],
                  additionalProperties: false,
                },
              },
              payment_method: { type: "string", enum: ["cash", "upi", "card", "credit", "other"] },
              customer_name: { type: ["string", "null"] },
            },
            required: ["action", "items", "payment_method", "customer_name"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: data?.error?.message || "AI request failed" }, { status: 502 });

  let parsed: ParsedCommand;
  try {
    parsed = JSON.parse(data?.output_text || "{}");
  } catch {
    return NextResponse.json({ error: "AI could not structure the quick-sale request." }, { status: 422 });
  }

  if (parsed.action !== "quick_sale" || !parsed.items?.length) {
    return NextResponse.json({ action: "unsupported", message: "This request is not a complete quick sale. I have not changed anything." });
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
    if (!requested.name?.trim() || qty <= 0) {
      problems.push(`Invalid item: ${requested.name || "unknown"}`);
      continue;
    }
    const needle = clean(requested.name);
    const exact = catalog.filter((x) => clean(String(x.name)) === needle);
    const partial = catalog.filter((x) => clean(String(x.name)).includes(needle) || needle.includes(clean(String(x.name))));
    const matches = exact.length ? exact : partial;
    if (matches.length !== 1) {
      problems.push(matches.length > 1 ? `Ambiguous item: ${requested.name}` : `Item not found: ${requested.name}`);
      continue;
    }
    const item = matches[0];
    if (item.kind === "product" && Number(item.stock_qty) < qty) {
      problems.push(`${item.name}: only ${Number(item.stock_qty)} in stock`);
      continue;
    }
    resolved.push({
      id: item.id,
      kind: item.kind,
      name: item.name,
      qty,
      rate: Number(item.sale_price),
      cost_price: Number(item.cost_price ?? 0),
      gst_rate: Number(item.gst_rate ?? 0),
      hsn_sac: item.kind === "product" ? item.hsn_code ?? null : item.sac_code ?? null,
    });
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
  const total = Number(resolved.reduce((sum, x) => sum + x.qty * x.rate, 0).toFixed(2));
  const payment = [{ method: paymentMethod, amount: total, instrument_id: null }];

  const approval = await requireOwnerApproval("create_sale", {
    source: "cafe-ai-quick-sale",
    original_request: message,
    customer_id: customer?.id ?? null,
    customer_name: customer?.name ?? null,
    customer_state_code: customer?.state_code ?? null,
    customer_gstin: customer?.gstin ?? null,
    payment,
    items: resolved,
    expected_total: total,
  });

  return NextResponse.json({
    action: "approval_required",
    approval_id: approval.id,
    approval,
    summary: {
      customer: customer?.name ?? "Walk-in customer",
      payment_method: paymentMethod,
      total,
      items: resolved.map((x) => ({ name: x.name, qty: x.qty, rate: x.rate, amount: Number((x.qty * x.rate).toFixed(2)) })),
    },
    message: "Quick sale prepared. Owner approval is required before Cafe-EPR is changed.",
  });
}
