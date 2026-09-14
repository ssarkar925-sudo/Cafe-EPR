import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get("url") || "https://sccomm-whatsapp-gateway.onrender.com";
    const gatewayUrl = rawUrl.trim().replace(/\/$/, "");

    const res = await fetch(`${gatewayUrl}/health`, {
      headers: { "Bypass-Tunnel-Reminder": "true" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return NextResponse.json({
        ok: true,
        status: data.connected ? "connected" : "waiting_for_qr",
        connected: Boolean(data.connected),
        phone: data.userPhone || "",
        service: data.service || "sccomm-whatsapp-gateway",
      });
    }

    return NextResponse.json({
      ok: false,
      status: "offline",
      connected: false,
      error: `Gateway HTTP ${res.status}`,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      status: "offline",
      connected: false,
      error: err?.message || "Gateway unreachable",
    });
  }
}
