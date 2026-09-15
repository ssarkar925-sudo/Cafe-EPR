import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Quick Sale is discontinued. This endpoint is intentionally disabled and
 * always answers 410 Gone so no client (UI, automation, or script) can
 * create new quick sales. Historical records remain readable elsewhere.
 * Use POS billing (/pos) for new sales.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Quick Sale is discontinued. Use POS billing (/pos) for new sales." },
    { status: 410 }
  );
}
