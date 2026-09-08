import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { verifyCodeRepair } from "@/lib/ai/code-repair";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const role = await getUserRole();
    if (!hasRole(role, ["admin", "staff"])) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const commit = new URL(request.url).searchParams.get("commit") || "";
    if (!/^[0-9a-f]{40}$/i.test(commit)) return NextResponse.json({ error: "Valid commit SHA is required." }, { status: 400 });
    return NextResponse.json(await verifyCodeRepair(commit));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification failed" }, { status: 502 });
  }
}
