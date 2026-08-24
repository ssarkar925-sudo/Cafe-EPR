/**
 * ==============================================================================
 * AI Inventory Auditor & Stock Velocity Engine
 * ==============================================================================
 */

export type InventoryAuditReport = {
  totalItemsTracked: number;
  totalInventoryValuation: number;
  lowStockItems: { id: string; name: string; stock: number; minStock: number }[];
  deadStockItems: { id: string; name: string; stock: number; cost: number; daysIdle: number }[];
  topSellers: { id: string; name: string; unitsSold: number; revenue: number }[];
  marginLeakageAlerts: { id: string; name: string; cost: number; sale: number; marginPercent: number }[];
  healthyStockPercent: number;
};

export function auditInventory(
  products: { id: string; name: string; stock_quantity: number; cost_price: number; sale_price: number; min_stock_alert?: number }[],
  invoices: any[] = []
): InventoryAuditReport {
  let totalValuation = 0;
  const lowStock: InventoryAuditReport["lowStockItems"] = [];
  const deadStock: InventoryAuditReport["deadStockItems"] = [];
  const marginLeakage: InventoryAuditReport["marginLeakageAlerts"] = [];

  for (const p of products) {
    const stock = Number(p.stock_quantity || 0);
    const cost = Number(p.cost_price || 0);
    const sale = Number(p.sale_price || 0);
    const minStock = Number(p.min_stock_alert || 5);

    if (stock > 0 && cost > 0) {
      totalValuation += stock * cost;
    }

    if (stock <= minStock && stock >= 0) {
      lowStock.push({ id: p.id, name: p.name, stock, minStock });
    }

    if (sale <= cost && cost > 0) {
      const margin = sale > 0 ? Math.round(((sale - cost) / sale) * 100) : 0;
      marginLeakage.push({ id: p.id, name: p.name, cost, sale, marginPercent: margin });
    }

    // Dead stock placeholder (stock > 20 and no sales)
    if (stock > 25 && cost > 0) {
      deadStock.push({ id: p.id, name: p.name, stock, cost, daysIdle: 45 });
    }
  }

  const healthyItems = products.length - lowStock.length - marginLeakage.length;
  const healthyPercent = products.length > 0 ? Math.max(0, Math.round((healthyItems / products.length) * 100)) : 100;

  return {
    totalItemsTracked: products.length,
    totalInventoryValuation: Math.round(totalValuation * 100) / 100,
    lowStockItems: lowStock,
    deadStockItems: deadStock,
    topSellers: [],
    marginLeakageAlerts: marginLeakage,
    healthyStockPercent: healthyPercent,
  };
}
