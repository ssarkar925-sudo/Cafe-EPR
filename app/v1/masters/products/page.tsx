import { createClient } from "@/lib/supabase/server";
import { getV1SessionContext, requireV1BackOffice } from "@/lib/v1/v1-auth-context";
import { listReferenceRows, listTenantRows } from "@/lib/v1/v1-server-reads";
import V1Forbidden from "@/components/v1/v1-forbidden";
import { MasterManager, type MasterEntityConfig } from "../forms";

/**
 * Products (server + shared manager island). Fields mirror the V1 product
 * contract exactly: no tax behavior, no extra attributes. cost_price is a
 * reference default only — FIFO lots carry real costs. HSN is a dormant
 * validated reference, never a computation input.
 */
export default async function V1Products() {
  const session = await getV1SessionContext();
  if (!requireV1BackOffice(session)) return <V1Forbidden surface="Products" />;

  const supabase = await createClient();
  const [products, hsn] = await Promise.all([
    listTenantRows<Record<string, unknown>>(
      supabase,
      "products",
      "id, name, sku, barcode, unit, sale_price, cost_price, hsn_code, is_active",
      session.tenantId,
      { column: "name" },
      500,
    ),
    listReferenceRows<{ code: string }>(supabase, "hsn_codes", "code", { column: "code" }, 500),
  ]);

  const error = products.error ?? hsn.error;
  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      </div>
    );
  }

  const config: MasterEntityConfig = {
    rpc: "mg_product_upsert",
    idParam: "p_id",
    fields: [
      { key: "name", param: "p_name", label: "Name", type: "text", required: true, placeholder: "Product name" },
      { key: "sku", param: "p_sku", label: "SKU", type: "text", placeholder: "Optional" },
      { key: "barcode", param: "p_barcode", label: "Barcode", type: "text", placeholder: "Optional, unique per tenant" },
      { key: "unit", param: "p_unit", label: "Unit", type: "text", placeholder: "pc" },
      { key: "sale_price", param: "p_sale_price", label: "Sale price (₹)", type: "number" },
      { key: "cost_price", param: "p_cost_price", label: "Cost price ref (₹)", type: "number" },
      { key: "hsn_code", param: "p_hsn_code", label: "HSN (dormant ref)", type: "select", options: hsn.rows.map((h) => h.code) },
      { key: "is_active", param: "p_is_active", label: "Active", type: "checkbox" },
    ],
  };

  return (
    <MasterManager
      title="Products"
      description="Tenant catalog. Barcodes are unique per tenant; HSN is a dormant reference only."
      config={config}
      columns={[
        { key: "name", label: "Name" },
        { key: "barcode", label: "Barcode", mono: true },
        { key: "unit", label: "Unit" },
        { key: "sale_price", label: "Sale price" },
        { key: "hsn_code", label: "HSN", mono: true },
        { key: "is_active", label: "Active" },
      ]}
      rows={products.rows}
    />
  );
}
