import { NextResponse } from "next/server";
import type { ScanMode } from "@/lib/scan/extract";

export const runtime = "nodejs";
export const maxDuration = 30;

const KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const SCHEMAS: Record<ScanMode, { keys: string[]; description: string }> = {
  aeps: {
    description: "an AEPS (Aadhaar-enabled) cash withdrawal from a portal or SMS",
    keys: [
      "amount", "reference", "aadhaar_last4", "customer_mobile", "bank_name",
      "portal_name", "service_fee", "portal_commission", "status", "transaction_date",
    ],
  },
  dmt: {
    description: "a DMT (domestic money transfer) from a portal or SMS",
    keys: [
      "amount", "reference", "sender_name", "sender_mobile", "beneficiary_name",
      "beneficiary_mobile", "beneficiary_bank", "beneficiary_ifsc",
      "beneficiary_account", "upi_id", "service_fee", "portal_commission",
      "status", "transaction_date",
    ],
  },
  upi: {
    description: "a UPI payment received by a merchant from a payment app or SMS",
    keys: [
      "amount", "reference", "beneficiary_name", "customer_mobile", "service_fee",
      "status", "transaction_date",
    ],
  },
  payment: {
    description: "a customer payment (UPI, card, wallet, bank transfer) received at the counter",
    keys: ["amount", "method", "reference"],
  },
};

function buildPrompt(mode: ScanMode): string {
  const s = SCHEMAS[mode];
  return `You are a transaction-data extractor for a shop ERP. Given a screenshot, SMS, or portal text of ${s.description}, extract the requested fields and return ONLY a JSON object (no markdown, no commentary).

Keys: ${s.keys.join(", ")}

Rules:
- amount: plain number, no commas or currency symbols (e.g. 1500.00).
- reference: the RRN / UTR / transaction id as digits.
- aadhaar_last4: the LAST 4 digits only. NEVER the full number.
- beneficiary_name / sender_name: person names only.
- status: exactly one of "success", "pending", "failed".
- transaction_date: ISO date YYYY-MM-DD when present.
- method (payment mode only): exactly one of "upi", "card", "cash", "wallet", "bank".
- Use null for anything you cannot determine. Ignore unrelated text, ads, buttons, headers, and duplicate noise.`;
}

async function callGemini(parts: Record<string, unknown>[]) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no content");
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  if (!KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set. Add it to .env.local (and Vercel) to use AI extraction." },
      { status: 400 }
    );
  }

  let body: { mode?: ScanMode; text?: string; image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const mode = body.mode;
  if (!mode || !(mode in SCHEMAS)) {
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  }

  const parts: Record<string, unknown>[] = [{ text: buildPrompt(mode) }];
  if (body.text) {
    parts.push({ text: `TRANSACTION SOURCE TEXT:\n${body.text}` });
  }
  if (body.image) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(body.image);
    if (!match) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
  }
  if (parts.length < 2) {
    return NextResponse.json({ error: "Nothing to extract from — provide text and/or an image" }, { status: 400 });
  }

  try {
    const raw = await callGemini(parts);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const key of SCHEMAS[mode].keys) {
      const v = parsed[key];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        fields[key] = String(v).trim();
      }
    }
    return NextResponse.json({ fields });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI extraction failed" },
      { status: 502 }
    );
  }
}