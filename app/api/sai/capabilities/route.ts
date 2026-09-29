import "@/lib/sai/capabilities/business-observe";
import "@/lib/sai/capabilities/pos-observe";
import "@/lib/sai/capabilities/customer-intelligence";
import "@/lib/sai/capabilities/aeps-intelligence";
import "@/lib/sai/capabilities/portal-watcher-observe";
import "@/lib/sai/capabilities/service-intelligence";
import "@/lib/sai/capabilities/finance-intelligence";
import { NextResponse } from "next/server";
import { getUserRole, hasRole } from "@/lib/authz";
import { listSaiCapabilityDescriptors, validateSaiCapabilityRegistry } from "@/lib/sai/core/capabilities";

export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getUserRole();
  if (!hasRole(role, ["admin", "manager", "staff"])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    validateSaiCapabilityRegistry();
    return NextResponse.json({
      capabilities: listSaiCapabilityDescriptors(),
      count: listSaiCapabilityDescriptors().length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "SAI capability registry invalid" },
      { status: 500 },
    );
  }
}
