import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizePhone,
  normalizeSearchText,
  rankCustomerResults,
} from "@/lib/customer-search";

const RESULT_FIELDS = "id,code,name,phone,is_active";

/**
 * GET /api/customers/search?q=&limit=&include_inactive=
 * Authenticated-only, identification-minimal results (no email/address/balance).
 * Requires >= 2 chars (no directory dumps). Server-side candidate fetch +
 * canonical rankCustomerResults scoring so every selector shares one rule.
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("q") ?? "";
    const limit = Math.max(1, Math.min(50, Number(searchParams.get("limit")) || 20));
    const includeInactive = searchParams.get("include_inactive") === "1";

    const query = normalizeSearchText(raw);
    if (query.length < 2) return NextResponse.json({ results: [] });

    // PostgREST OR-safe pattern: strip wildcard/separator chars.
    const safe = query.replace(/[%(),\\]/g, "").slice(0, 60);
    if (safe.length < 2) return NextResponse.json({ results: [] });
    const digits = normalizePhone(raw).slice(0, 20);

    const ors = [`name.ilike.%${safe}%`, `code.ilike.%${safe}%`];
    if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);

    let builder = supabase
      .from("customers")
      .select(RESULT_FIELDS)
      .or(ors.join(","))
      .order("name", { ascending: true })
      .limit(Math.min(limit * 3, 100));
    if (!includeInactive) builder = builder.eq("is_active", true);

    const { data, error } = await builder;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ranked = rankCustomerResults(data ?? [], raw, limit);
    return NextResponse.json({
      results: ranked.map(({ record, match }) => ({
        id: record.id,
        code: record.code ?? null,
        name: record.name ?? null,
        phone: record.phone ?? null,
        is_active: (record as { is_active?: boolean | null }).is_active ?? true,
        match_tier: match.tier,
        match_field: match.field,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Search failed" }, { status: 500 });
  }
}
