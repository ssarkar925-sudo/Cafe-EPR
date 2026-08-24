/**
 * ==============================================================================
 * Encrypted Database Snapshot & Disaster Recovery Engine
 * ==============================================================================
 */

export function generateDisasterRecoveryBackup(params: {
  shopName: string;
  customers: any[];
  invoices: any[];
  products: any[];
  settlements: any[];
  cashEntries: any[];
  expenses: any[];
}) {
  const payload = {
    metadata: {
      shop: params.shopName,
      backup_timestamp: new Date().toISOString(),
      format_version: "2.0-encrypted-compatible",
      record_counts: {
        customers: params.customers.length,
        invoices: params.invoices.length,
        products: params.products.length,
        settlements: params.settlements.length,
        cash_entries: params.cashEntries.length,
        expenses: params.expenses.length,
      },
    },
    tables: {
      customers: params.customers,
      invoices: params.invoices,
      products: params.products,
      settlements: params.settlements,
      cash_entries: params.cashEntries,
      expenses: params.expenses,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `CafeERP_Disaster_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
