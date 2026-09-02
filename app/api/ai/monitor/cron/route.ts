import { NextResponse } from "next/server";
import { runBusinessMonitorScan } from "@/lib/ai/business-monitor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await runBusinessMonitorScan();
    return NextResponse.json({ ok: true, scannedAt: result.scannedAt, created: result.created.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("[AI Monitor Cron] failed:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Business monitor cron failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
