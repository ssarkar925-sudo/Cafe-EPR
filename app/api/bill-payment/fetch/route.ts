import { NextRequest, NextResponse } from "next/server";
import { getBillProvider } from "@/lib/bill-payment/provider-adapter";
import { getBillerConfig, getFallbackBillerConfig } from "@/lib/bill-payment/biller-metadata";

export const dynamic = "force-dynamic";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const billerId = clean(searchParams.get("billerId"));
  const category = clean(searchParams.get("category"));

  if (!billerId) {
    return NextResponse.json(
      { ok: false, source: "invalid_input", error: "Biller ID is required." },
      { status: 400 }
    );
  }

  // Extract all parameter keys
  const parameters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== "billerId" && key !== "category") {
      parameters[key] = clean(value);
    }
  });

  const biller = getBillerConfig(billerId) || getFallbackBillerConfig(category || "electricity", billerId);

  // Validate required parameters
  for (const param of biller.parameters) {
    if (param.required && !parameters[param.key]) {
      return NextResponse.json(
        {
          ok: false,
          source: "invalid_input",
          error: `Parameter "${param.label}" is required.`,
        },
        { status: 400 }
      );
    }
  }

  const provider = getBillProvider();
  const result = await provider.fetchBill({
    billerId,
    category,
    parameters,
  });

  return NextResponse.json(result, { status: result.source === "timeout" ? 504 : 200 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const billerId = clean(body?.billerId);
    const category = clean(body?.category);
    const parameters: Record<string, string> = {};

    if (body?.parameters && typeof body.parameters === "object") {
      for (const [k, v] of Object.entries(body.parameters)) {
        parameters[k] = clean(v);
      }
    } else if (body?.consumerId) {
      parameters.consumerId = clean(body.consumerId);
    }

    if (!billerId) {
      return NextResponse.json(
        { ok: false, source: "invalid_input", error: "Biller ID is required." },
        { status: 400 }
      );
    }

    const provider = getBillProvider();
    const result = await provider.fetchBill({
      billerId,
      category,
      parameters,
    });

    return NextResponse.json(result, { status: result.source === "timeout" ? 504 : 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        source: "provider_error",
        error: error instanceof Error ? error.message : "Bill lookup failed",
      },
      { status: 500 }
    );
  }
}
