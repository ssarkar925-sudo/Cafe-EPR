"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/lib/supabase/realtime";
import { logAudit } from "@/lib/audit";
import ProductFormModal from "./product-form-modal";
import { inr } from "@/lib/format";
import SearchableSelect from "@/components/ui/searchable-select";

export type Product = {
  id: string; code: string | null; name: string; description: string | null; unit: string;
  category_id: string | null; sale_price: number | string; cost_price: number | string;
  stock_qty: number | string; reorder_level: number | string; is_active: boolean;
  categories: { name: string } | null;
};
export type CategoryRef = { id: string; name: string; is_active: boolean };
type ModalState = { mode: "create" } | { mode: "edit"; product: Product } | null;

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustStockModal({
  product,
  onClose,
  onAdjusted,
}: {
  product: Product;
  onClose: () => void;
  onAdjusted: (productId: string, newStock: number) => void;
}) {
  const [newStock, setNewStock] = useState(String(product.stock_qty));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const currentStock = Number(product.stock_qty);
  const targetStock = Number(newStock);
  const diff = isNaN(targetStock) ? 0 : targetStock - currentStock;

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isNaN(targetStock) || targetStock < 0) {
      setError("New stock must be a non-negative number.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required for every stock adjustment.");
      return;
    }
    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc("adjust_stock_manual", {
      p_product_id: product.id,
      p_new_stock: targetStock,
      p_reason: reason.trim(),
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    logAudit({
      action: "stock_adjustment",
      entity: "product",
      entity_id: product.id,
      description: `Stock adjusted for ${product.name}: ${currentStock} → ${targetStock} (${diff >= 0 ? "+" : ""}${diff}). Reason: ${reason.trim()}`,
      details: data as Record<string, unknown>,
    });
    onAdjusted(product.id, targetStock);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M20 7 12 3 4 7v10l8 4 8-4V7ZM12 3v18M4 7l8 4 8-4M4 17l8-4 8 4" />
                </svg>
              </div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Adjust Stock</h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {product.name} <span className="font-mono text-slate-400">{product.code ?? ""}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleApply} className="px-6 py-5 space-y-4">
          {/* Current Stock (read-only display) */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Current Stock
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-400">
                <path d="M20 7 12 3 4 7v10l8 4 8-4V7Z" />
              </svg>
              <span className="font-black text-slate-800 dark:text-white">{currentStock}</span>
              <span className="text-slate-400">{product.unit}</span>
            </div>
          </div>

          {/* New Stock */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              New Stock *
            </label>
            <input
              type="number"
              step="1"
              min="0"
              required
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
              placeholder="Enter new stock quantity"
            />
            {!isNaN(targetStock) && targetStock !== currentStock && (
              <p className={`mt-1 text-xs font-bold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {diff > 0 ? "▲ Stock IN" : "▼ Stock OUT"}: {Math.abs(diff)} {product.unit}
                {diff > 0 ? " will be added" : " will be removed"}
              </p>
            )}
            {!isNaN(targetStock) && targetStock === currentStock && (
              <p className="mt-1 text-xs text-slate-400">No change — quantity is same as current stock.</p>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reason *
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count correction, Damaged goods removal, Opening stock seed…"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Every adjustment is permanently recorded in the Inventory Journal.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400">
              {error}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isNaN(targetStock) || targetStock < 0 || !reason.trim()}
              className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
            >
              {saving ? "Adjusting…" : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gradient(name: string) {
  const palettes = ["from-blue-500 to-cyan-400","from-violet-500 to-fuchsia-400","from-emerald-500 to-teal-400","from-amber-500 to-orange-400","from-rose-500 to-pink-400","from-indigo-500 to-purple-400"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return palettes[h % palettes.length];
}

// ─── Main Client ──────────────────────────────────────────────────────────────
export default function ProductsClient({ initialProducts, categories, embedded = false }: { initialProducts: Product[]; categories: CategoryRef[]; embedded?: boolean }) {
  useRealtime(["products", "categories", "units", "brands"]);
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [q, setQ] = useState(searchParams?.get("q") || "");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "low_stock">(searchParams?.get("status") === "low_stock" ? "low_stock" : "all");
  const [modal, setModal] = useState<ModalState>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      if (status === "active" && !p.is_active) return false;
      if (status === "inactive" && p.is_active) return false;
      if (status === "low_stock" && (!p.is_active || Number(p.stock_qty) > Number(p.reorder_level))) return false;
      if (cat !== "all" && p.category_id !== cat) return false;
      return !needle || p.name.toLowerCase().includes(needle) || (p.code ?? "").toLowerCase().includes(needle);
    });
  }, [products, q, cat, status]);

  const stats = useMemo(() => {
    let active = 0, low = 0, stockValue = 0;
    for (const p of products) { const qty = Number(p.stock_qty); if (qty > 0) stockValue += qty * Number(p.cost_price); if (!p.is_active) continue; active++; if (qty <= Number(p.reorder_level)) low++; }
    return { total: products.length, active, low, stockValue };
  }, [products]);

  function nextCode() { let max = 0; for (const p of products) { const n = parseInt(String(p.code ?? "").replace(/\D/g, ""), 10); if (!Number.isNaN(n)) max = Math.max(max, n); } return "PRD-" + String(max + 1).padStart(4, "0"); }

  async function saveProduct(
    input: { name: string; code: string; description: string; unit: string; category_id: string | null; sale_price: number; cost_price: number; stock_qty: number; reorder_level: number },
    product?: Product
  ) {
    if (product) {
      // NEVER include stock_qty in the products.update() payload for an existing product.
      // Stock quantity can only be changed via the adjust_stock_manual() RPC.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { stock_qty: _dropped, ...safeUpdatePayload } = input;
      const { error } = await supabase.from("products").update(safeUpdatePayload).eq("id", product.id);
      if (error) return alert(error.message);
      // Keep the original stock_qty unchanged in local state
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, ...safeUpdatePayload } : p));
    } else {
      // Product creation is an inventory event when initial stock is non-zero.
      // The RPC inserts the product at zero, posts opening stock through the
      // protected path, and writes the journal row in the same transaction.
      const { data, error } = await supabase.rpc("create_product_with_opening_stock", {
        p_name: input.name,
        p_code: input.code,
        p_description: input.description || null,
        p_unit: input.unit,
        p_category_id: input.category_id,
        p_sale_price: input.sale_price,
        p_cost_price: input.cost_price,
        p_initial_stock: input.stock_qty,
        p_reorder_level: input.reorder_level,
      });
      if (error) return alert(error.message);
      setProducts((prev) => [data as Product, ...prev]);
    }
    setModal(null);
    logAudit({ action: product ? "update" : "create", entity: "product", entity_id: product?.id ?? null, description: product ? `Product updated: ${input.name}` : `Product created: ${input.name}`, details: { name: input.name } });
  }

  async function setProductActive(id: string, active: boolean) {
    setDeletingId(id);
    const { error } = await supabase.from("products").update({ is_active: active }).eq("id", id);
    setDeletingId(null);
    if (error) return alert(error.message);
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, is_active: active } : p));
    const product = products.find((p) => p.id === id);
    logAudit({ action: active ? "activate" : "deactivate", entity: "product", entity_id: id, description: `${active ? "Product activated" : "Product deactivated"}: ${product?.name ?? id}`, details: { is_active: active } });
  }

  function handleStockAdjusted(productId: string, newStock: number) {
    setProducts((prev) =>
      prev.map((p) => p.id === productId ? { ...p, stock_qty: newStock } : p)
    );
  }

  function exportReorderPo() {
    const lowItems = products.filter((p) => p.is_active && Number(p.stock_qty) <= Number(p.reorder_level));
    if (!lowItems.length) return alert("All products have healthy stock levels. No reorder needed!");
    const rows = [["Item Code","Product Name","Current Stock","Reorder Level","Suggested Order Qty","Est. Unit Cost","Est. Total Cost"], ...lowItems.map((p) => { const cur=Number(p.stock_qty), reorder=Number(p.reorder_level), orderQty=Math.max(10,reorder*2-cur), cost=Number(p.cost_price); return [p.code??"-",p.name,cur,reorder,orderQty,cost,orderQty*cost]; })];
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); a.download=`purchase-order-draft-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  const statCards = [
    { label:"Total Products", value:String(stats.total), icon:"M3 6h18M3 12h18M3 18h18", grad:"from-blue-500 to-indigo-600" },
    { label:"Active", value:String(stats.active), icon:"M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14l-3-3", grad:"from-emerald-500 to-teal-600" },
    { label:"Low Stock", value:String(stats.low), icon:"M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", grad:stats.low>0?"from-rose-500 to-pink-600":"from-slate-400 to-slate-500" },
    { label:"Stock Value", value:inr(stats.stockValue), icon:"M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", grad:"from-amber-500 to-orange-600" },
  ];

  return <div className={`${embedded ? "max-w-none" : "mx-auto max-w-6xl px-4 py-8 lg:px-8"} catalog-premium`}>
    <div className="catalog-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Catalog</p><h1 className="text-2xl font-black text-slate-900 dark:text-white">Products Catalog</h1><p className="text-xs text-slate-500 dark:text-slate-400">Saleable items with inventory tracking and weighted average cost.</p></div>
      <div className="catalog-actions flex flex-wrap items-center gap-2">
        {stats.low > 0 && <button onClick={exportReorderPo} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-black text-amber-800 shadow-sm transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">📦 Export Reorder PO ({stats.low})</button>}
        <button onClick={()=>setModal({mode:"create"})} className="btn-3d-tactile-primary px-4 py-2.5 text-xs font-black">+ Add Product</button>
      </div>
    </div>
    <div className="catalog-stats mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{statCards.map(c=><div key={c.label} onClick={()=>{if(c.label==="Low Stock")setStatus("low_stock");else if(c.label==="Active")setStatus("active");else if(c.label==="Total Products"){setStatus("all");setCat("all");setQ("")}else setStatus("all")}} className="bento-surface-interactive relative cursor-pointer overflow-hidden p-4 dark:bg-slate-900/90"><div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`}/><div className="flex items-center justify-between"><div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{c.label}</p><p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{c.value}</p></div><div className={`icon-box-3d flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d={c.icon}/></svg></div></div></div>)}</div>
    <div className="catalog-toolbar mt-6 flex flex-wrap items-center gap-3"><div className="relative"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, code..." className="w-full max-w-xs rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-900 dark:text-white"/></div><SearchableSelect value={cat} onChange={setCat} options={[{value:"all",label:"All categories"},...categories.filter(c=>c.is_active).map(c=>({value:c.id,label:c.name}))]} searchPlaceholder="Search category…" className="w-52"/><div className="catalog-status flex rounded-xl bg-slate-100 p-1 text-xs font-bold dark:bg-white/5">{(["all","active","inactive","low_stock"] as const).map(s=><button key={s} onClick={()=>setStatus(s)} className={`rounded-lg px-3 py-1.5 transition ${status===s?"bg-white font-black text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white":"text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{s==="low_stock"?"Low Stock":s[0].toUpperCase()+s.slice(1)}</button>)}</div><span className="text-xs font-bold text-slate-400">{filtered.length} products</span></div>
    <div className="bento-surface catalog-table-wrap mt-4 overflow-hidden dark:bg-slate-900/90"><table className="catalog-table w-full text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-400 font-bold dark:border-white/10">{["Product","Category","Cost","Sale","Margin","Stock","Status","Actions"].map((h,i)=><th key={h} className={`px-4 py-3 font-bold uppercase tracking-wider ${i===7?"text-right":""}`}>{h}</th>)}</tr></thead><tbody>{filtered.map(p=>{const cost=Number(p.cost_price),sale=Number(p.sale_price),margin=sale-cost,low=Number(p.stock_qty)<=Number(p.reorder_level);return <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-white/5 dark:hover:bg-white/5"><td className="px-4 py-3"><div className="flex items-center gap-3"><div className={`icon-box-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient(p.name)} text-xs font-black text-white`}>{p.name.slice(0,2).toUpperCase()}</div><div><p className="font-black text-slate-900 dark:text-white">{p.name}</p><p className="text-[11px] text-slate-400">{p.code??"-"}</p></div></div></td><td className="px-4 py-3">{p.categories?<span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{p.categories.name}</span>:<span className="text-slate-400">-</span>}</td><td className="px-4 py-3 text-slate-500">{inr(cost)}</td><td className="px-4 py-3 font-black text-slate-900 dark:text-white">{inr(sale)}</td><td className="px-4 py-3"><span className={`font-black ${margin>=0?"text-emerald-600 dark:text-emerald-400":"text-rose-600 dark:text-rose-400"}`}>{margin>=0?"+":""}{inr(margin)}</span></td><td className="px-4 py-3"><span className={low?"font-black text-rose-600 dark:text-rose-400":"text-slate-700 dark:text-slate-300"}>{p.stock_qty} {p.unit}</span>{low&&<span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">low</span>}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.is_active?"bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300":"bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}>{p.is_active?"Active":"Inactive"}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2">
      {/* Edit product details (price, name, etc.) — stock NOT included */}
      <button onClick={()=>setModal({mode:"edit",product:p})} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">Edit</button>
      {/* Adjust stock via authorized RPC only */}
      <button onClick={()=>setAdjustingProduct(p)} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 shadow-xs transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300" title="Adjust stock quantity (creates inventory journal entry)">⚖ Stock</button>
      <button onClick={()=>setProductActive(p.id,!p.is_active)} disabled={deletingId===p.id} className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${p.is_active?"border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300":"border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>{deletingId===p.id?"...":p.is_active?"Deactivate":"Activate"}</button>
    </div></td></tr>})}{filtered.length===0&&<tr><td colSpan={8} className="catalog-empty px-4 py-8 text-center"><div className="mx-auto max-w-sm"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-white/5">☕</div><p className="font-bold text-slate-800 dark:text-white">No products found</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try changing your filters, or add your first product to make it available in POS.</p><button onClick={()=>setModal({mode:"create"})} className="btn-3d-tactile-primary mt-4 px-4 py-2 text-xs font-black">+ Add Product</button></div></td></tr>}</tbody></table></div>
    {modal&&<ProductFormModal state={modal} categories={categories} suggestedCode={nextCode()} nextCode={nextCode} onClose={()=>setModal(null)} onSave={saveProduct}/>}
    {adjustingProduct&&<AdjustStockModal product={adjustingProduct} onClose={()=>setAdjustingProduct(null)} onAdjusted={handleStockAdjusted}/>}
  </div>;
}
