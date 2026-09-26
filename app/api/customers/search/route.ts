import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normalizePhone,
  normalizeSearchText,
  rankCustomerResults,
  type CustomerSearchRecord,
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

    // UUID support: exact match on id
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe);
    if (isUuid) {
      ors.push(`id.eq.${safe}`);
    }

    // Code matching without hyphens (e.g. CUST00125 -> CUST-00125)
    const custMatch = safe.match(/^cust-?(\d+)$/i);
    if (custMatch) {
      const numPart = custMatch[1];
      ors.push(`code.ilike.%CUST-${numPart}%`);
      ors.push(`code.ilike.%${numPart}%`);
    }

    // Aadhaar last 4 match (4 digits): query transactions table for customers with this Aadhaar last 4
    let aadhaarMatchedCustomerIds: string[] = [];
    if (digits.length === 4) {
      try {
        const { data: txnMatches } = await supabase
          .from("transactions")
          .select("customer_id")
          .eq("aadhaar_last4", digits)
          .not("customer_id", "is", null)
          .limit(10);
        if (txnMatches && txnMatches.length > 0) {
          aadhaarMatchedCustomerIds = Array.from(
            new Set(txnMatches.map((t) => t.customer_id).filter(Boolean))
          );
        }
      } catch {
        // graceful fallback
      }
      if (aadhaarMatchedCustomerIds.length > 0) {
        ors.push(`id.in.(${aadhaarMatchedCustomerIds.join(",")})`);
      }
    }

    let builder = supabase
      .from("customers")
      .select(RESULT_FIELDS)
      .or(ors.join(","))
      .order("name", { ascending: true })
      .limit(Math.min(limit * 3, 100));
    if (!includeInactive) builder = builder.eq("is_active", true);

    const { data, error } = await builder;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const customerList: Array<CustomerSearchRecord & { is_active?: boolean | null }> = (data ?? []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      is_active: c.is_active,
      aadhaarLast4: null,
    }));

    if (customerList.length > 0) {
      try {
        const custIds = customerList.map((c) => c.id);
        const { data: txns } = await supabase
          .from("transactions")
          .select("customer_id, aadhaar_last4, created_at")
          .in("customer_id", custIds)
          .not("aadhaar_last4", "is", null)
          .order("created_at", { ascending: false });

        if (txns && txns.length > 0) {
          const aadhaarMap = new Map<string, string>();
          for (const t of txns) {
            if (t.customer_id && t.aadhaar_last4 && !aadhaarMap.has(t.customer_id)) {
              aadhaarMap.set(t.customer_id, String(t.aadhaar_last4).slice(-4));
            }
          }
          for (const c of customerList) {
            if (aadhaarMap.has(c.id)) {
              c.aadhaarLast4 = aadhaarMap.get(c.id);
            }
          }
        }
      } catch {
        // non-fatal
      }
      if (digits.length === 4) {
        for (const c of customerList) {
          if (aadhaarMatchedCustomerIds.includes(c.id) && !c.aadhaarLast4) {
            c.aadhaarLast4 = digits;
          }
        }
      }
    }

    const ranked = rankCustomerResults(customerList, raw, limit);
    return NextResponse.json({
      results: ranked.map(({ record, match }) => {
        const custCode = record.code ?? null;
        const phone = record.phone ?? null;
        const aadhaarLast4 = record.aadhaarLast4 ?? null;
        return {
          id: record.id,
          customerId: custCode || record.id,
          customerCode: custCode,
          code: custCode,
          name: record.name ?? null,
          phone: phone,
          mobile: phone,
          aadhaarLast4: aadhaarLast4 || undefined,
          aadhaar_last4: aadhaarLast4 || undefined,
          is_active: (record as { is_active?: boolean | null }).is_active ?? true,
          match_tier: match.tier,
          match_field: match.field,
        };
      }),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Search failed" }, { status: 500 });
  }
}
