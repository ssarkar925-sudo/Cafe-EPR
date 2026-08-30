import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/authz";
import DashboardClient from "@/components/dashboard/dashboard-client";
import { assembleVerifiedContext } from "@/lib/ai/advisor-engine";
import { getIstDateString, getIstYesterdayDateString } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const isoToday = getIstDateString();
  const yesterday = getIstYesterdayDateString();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  // Parallel server data fetch across all canonical systems
  const [
    { data: { user } },
    role,
    settingsRes,
    poolBalancesRes,
    taxReportRes,
    todayReportRes,
    yesterdayReportRes,
    latestAuditRes,
    closingsRes,
    customersRes,
    productsRes,
    invoicesRes,
    quickSalesRes,
    expensesRes,
    transactionsRes,
    cashEntriesRes,
    settlementsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getUserRole(),
    supabase.from("settings").select("shop_name, gstin, currency_symbol").single(),
    supabase.rpc("get_pool_balances"),
    supabase.rpc("get_tax_preparation_report", { p_start_date: fyStart, p_end_date: fyEnd }),
    supabase.rpc("get_tax_preparation_report", { p_start_date: isoToday, p_end_date: isoToday }),
    supabase.rpc("get_tax_preparation_report", { p_start_date: yesterday, p_end_date: yesterday }),
    supabase.from("audit_runs").select("*, audit_findings(*)").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("closings").select("*, closing_balances(*)").order("close_date", { ascending: false }).limit(15),
    supabase.from("customers").select("id, name, balance, phone").gt("balance", 0).order("balance", { ascending: false }).limit(20),
    supabase.from("products").select("id, name, stock_qty, reorder_level, cost_price, sale_price").eq("is_active", true),
    supabase.from("invoices").select("id, invoice_number, invoice_date, total, paid, due, status, created_at, customers(name)").gte("invoice_date", thirtyDaysAgo).order("invoice_date", { ascending: false }).limit(300),
    supabase.from("quick_sales").select("id, sale_number, amount, cost, sale_date, status, created_at").gte("sale_date", thirtyDaysAgo),
    supabase.from("expenses").select("id, title, amount, category, expense_date, status, created_at").gte("expense_date", thirtyDaysAgo),
    supabase.from("transactions").select("id, transaction_number, service_type, direction, total_amount, service_fee, portal_commission, transaction_date, status, created_at, customers(name)").gte("transaction_date", thirtyDaysAgo),
    supabase.from("cash_entries").select("id, amount, direction, method, entry_date, ref_type, created_at").gte("entry_date", thirtyDaysAgo),
    supabase.from("settlements").select("id, amount, from_pool, to_pool, settlement_date, status, created_at").gte("settlement_date", thirtyDaysAgo),
  ]);

  const profile = user
    ? (await supabase.from("profiles").select("full_name, avatar_url, role").eq("id", user.id).single()).data
    : null;

  const userRole = (role || profile?.role || "admin") as "admin" | "manager" | "staff";
  const shopSettings = settingsRes.data || { shop_name: "Sarkar Communication", gstin: null, currency_symbol: "₹" };

  // Canonical Pool Balances
  const rawPools = (poolBalancesRes.data as any) || {};
  const poolKeys = ["cash", "bank", "wallet", "upi_qr", "aeps", "dmt"];
  let totalLiquid = 0;
  const poolsData: Record<string, any> = {};

  const POOL_METADATA: Record<string, { label: string; icon: string; color: string; href: string }> = {
    cash: { label: "Physical Cash Drawer", icon: "wallet", color: "indigo", href: "/finance/cashbook" },
    bank: { label: "Bank Accounts", icon: "bank", color: "blue", href: "/business/banks" },
    wallet: { label: "Digital Wallets", icon: "wallet", color: "emerald", href: "/finance/settlements" },
    upi_qr: { label: "Shop UPI QR Float", icon: "qr", color: "rose", href: "/business/upi" },
    aeps: { label: "AEPS Platform Float", icon: "card", color: "amber", href: "/business/aeps" },
    dmt: { label: "DMT Transfer Float", icon: "send", color: "violet", href: "/business/dmt" },
  };

  for (const k of poolKeys) {
    const cur = Number(rawPools[k]?.current || 0);
    const op = Number(rawPools[k]?.opening || 0);
    const mv = Number(rawPools[k]?.movements || 0);
    poolsData[k] = {
      label: POOL_METADATA[k]?.label || k,
      opening: op,
      movements: mv,
      current: cur,
      icon: POOL_METADATA[k]?.icon || "wallet",
      color: POOL_METADATA[k]?.color || "indigo",
      href: POOL_METADATA[k]?.href || "/finance/cashbook",
      pctOfTotal: 0,
    };
    totalLiquid += cur;
  }

  for (const k of poolKeys) {
    poolsData[k].pctOfTotal = totalLiquid > 0 ? Math.round((poolsData[k].current / totalLiquid) * 1000) / 10 : 0;
  }

  // Credit Card Facility
  const creditCardLimit = Number(rawPools.credit_card?.opening || 0);
  const creditCardUsed = Number(rawPools.credit_card?.movements || 0);
  const creditCardAvailable = Math.max(0, creditCardLimit - creditCardUsed);

  // Canonical Tax & P&L Report (FY YTD)
  const taxReport = taxReportRes.data || {
    revenue: {
      gross_invoices: 0,
      sales_returns: 0,
      quick_sales: 0,
      net_retail_revenue: 0,
      service_fees: { aeps_fees: 0, dmt_fees: 0, upi_fees: 0, total_service_fees: 0 },
      commissions: { aeps_commissions: 0, dmt_commissions: 0, total_commissions: 0 },
      total_operating_revenue: 0,
    },
    cogs: { total_cogs: 0, gross_profit: 0, gross_margin_pct: 100, cost_data_status: "insufficient_cost_data" },
    expenses: { total_active_expenses: 0, total_cancelled_expenses: 0 },
    pnl: { net_profit: 0, net_profit_margin_pct: 0, is_profitable: true },
    pass_through: { aeps_volume: 0, dmt_volume: 0, upi_volume: 0, total_custodial_throughput: 0 },
  };

  // Daily Reports (Today & Yesterday)
  const todayReport = (todayReportRes.data as any) || {
    revenue: { total_operating_revenue: 0, net_retail_revenue: 0 },
    cogs: { total_cogs: 0 },
    expenses: { total_active_expenses: 0 },
    pnl: { net_profit: 0 },
  };

  const yesterdayReport = (yesterdayReportRes.data as any) || {
    revenue: { total_operating_revenue: 0, net_retail_revenue: 0 },
    cogs: { total_cogs: 0 },
    expenses: { total_active_expenses: 0 },
    pnl: { net_profit: 0 },
  };

  // Operational items
  const invoices = (invoicesRes.data as any[]) || [];
  const quickSales = (quickSalesRes.data as any[]) || [];
  const expenses = (expensesRes.data as any[]) || [];
  const transactions = (transactionsRes.data as any[]) || [];
  const cashEntries = (cashEntriesRes.data as any[]) || [];
  const settlements = (settlementsRes.data as any[]) || [];

  const todayInvoices = invoices.filter((inv) => inv.invoice_date === isoToday && inv.status !== "cancelled");
  const todayQuick = quickSales.filter((q) => q.sale_date === isoToday && q.status === "active");
  const todayExpenses = expenses.filter((e) => e.expense_date === isoToday && e.status !== "cancelled");
  const todayTxns = transactions.filter((t) => (t.transaction_date || "").slice(0, 10) === isoToday && t.status === "success");
  const todayCash = cashEntries.filter((c) => c.entry_date === isoToday);
  const todaySettlements = settlements.filter((s) => (s.settlement_date || "").slice(0, 10) === isoToday && s.status === "completed");

  const todayInvoiceRevenue = todayInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const todayQuickRevenue = todayQuick.reduce((s, q) => s + Number(q.amount || 0), 0);
  
  const todayOperatingRevenue = Number(todayReport.revenue?.total_operating_revenue || (todayInvoiceRevenue + todayQuickRevenue));
  const todayCogs = Number(todayReport.cogs?.total_cogs || 0);
  const todayExpenseTotal = Number(todayReport.expenses?.total_active_expenses || todayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0));
  const todayProfit = Number(todayReport.pnl?.net_profit || (todayOperatingRevenue - todayCogs - todayExpenseTotal));

  const yesterdayRevenue = Number(yesterdayReport.revenue?.total_operating_revenue || 0);
  const yesterdayCogs = Number(yesterdayReport.cogs?.total_cogs || 0);
  const yesterdayExpenseTotal = Number(yesterdayReport.expenses?.total_active_expenses || 0);
  const yesterdayProfit = Number(yesterdayReport.pnl?.net_profit || 0);

  const todayMoneyIn = todayCash.filter((c) => c.direction === "in").reduce((s, c) => s + Number(c.amount || 0), 0);
  const todayMoneyOut = todayCash.filter((c) => c.direction === "out").reduce((s, c) => s + Number(c.amount || 0), 0);
  const todayInternalTransfers = todaySettlements.reduce((s, st) => s + Number(st.amount || 0), 0);

  const todayTxCount = todayInvoices.length + todayQuick.length + todayTxns.length;
  const todayAvgTicket = todayTxCount > 0 ? Math.round((todayOperatingRevenue / todayTxCount) * 100) / 100 : 0;

  // Month-to-date Calculations
  const mtdInvoices = invoices.filter((inv) => inv.invoice_date >= monthStart && inv.status !== "cancelled");
  const mtdQuick = quickSales.filter((q) => q.sale_date >= monthStart && q.status === "active");
  const mtdExpenses = expenses.filter((e) => e.expense_date >= monthStart && e.status !== "cancelled");
  const mtdTxns = transactions.filter((t) => (t.transaction_date || "").slice(0, 10) >= monthStart && t.status === "success");

  const mtdRevenue = mtdInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0) +
    mtdQuick.reduce((s, q) => s + Number(q.amount || 0), 0) +
    mtdTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0);
  const mtdExpenseTotal = mtdExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const mtdProfit = mtdRevenue - mtdExpenseTotal;
  const mtdTxCount = mtdInvoices.length + mtdQuick.length + mtdTxns.length;
  const mtdAvgTicket = mtdTxCount > 0 ? Math.round((mtdRevenue / mtdTxCount) * 100) / 100 : 0;

  // Week-to-date Calculations
  const wtdInvoices = invoices.filter((inv) => inv.invoice_date >= sevenDaysAgo && inv.status !== "cancelled");
  const wtdQuick = quickSales.filter((q) => q.sale_date >= sevenDaysAgo && q.status === "active");
  const wtdExpenses = expenses.filter((e) => e.expense_date >= sevenDaysAgo && e.status !== "cancelled");
  const wtdTxns = transactions.filter((t) => (t.transaction_date || "").slice(0, 10) >= sevenDaysAgo && t.status === "success");

  const wtdRevenue = wtdInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0) +
    wtdQuick.reduce((s, q) => s + Number(q.amount || 0), 0) +
    wtdTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0);
  const wtdExpenseTotal = wtdExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const wtdProfit = wtdRevenue - wtdExpenseTotal;
  const wtdTxCount = wtdInvoices.length + wtdQuick.length + wtdTxns.length;
  const wtdAvgTicket = wtdTxCount > 0 ? Math.round((wtdRevenue / wtdTxCount) * 100) / 100 : 0;

  // Receivables
  const debtors = customersRes.data || [];
  const totalReceivables = debtors.reduce((s, c) => s + Number(c.balance || 0), 0);

  // Inventory
  const products = productsRes.data || [];
  let totalStockValue = 0;
  let isValuationMissingCost = false;
  const lowStockItems: any[] = [];
  const outOfStockItems: any[] = [];

  for (const p of products) {
    const qty = Number(p.stock_qty || 0);
    const cost = Number(p.cost_price || 0);
    const reorder = Number(p.reorder_level || 5);
    if (qty > 0 && (!p.cost_price || Number(p.cost_price) <= 0)) {
      isValuationMissingCost = true;
    }
    totalStockValue += qty * cost;
    if (qty <= 0) {
      outOfStockItems.push({ id: p.id, name: p.name, stockQty: qty, reorderLevel: reorder });
    } else if (qty <= reorder) {
      lowStockItems.push({ id: p.id, name: p.name, stockQty: qty, reorderLevel: reorder });
    }
  }

  // Audit
  const latestAudit = latestAuditRes.data || null;
  const isAuditAvailable = latestAudit !== null;
  const auditScore = isAuditAvailable ? Number(latestAudit.overall_score ?? latestAudit.audit_score ?? 100) : 100;
  const findings = latestAudit?.audit_findings || [];
  const criticalCount = isAuditAvailable ? Number(latestAudit.critical_count ?? findings.filter((f: any) => f.status === "CRITICAL" || f.severity === "critical").length) : 0;
  const failCount = isAuditAvailable ? Number(latestAudit.failed_count ?? findings.filter((f: any) => f.status === "FAIL" || f.severity === "high").length) : 0;
  const warnCount = isAuditAvailable ? Number(latestAudit.warning_count ?? findings.filter((f: any) => f.status === "WARNING" || f.severity === "warning").length) : 0;
  const auditStatus = criticalCount > 0 ? "CRITICAL" : failCount > 0 ? "FAIL" : warnCount > 0 ? "WARNING" : "PASS";

  // Day Close
  const closings = (closingsRes.data as any[]) || [];
  const activeOpenClose = closings.find((c) => c.status === "open");
  const todayClosed = closings.find((c) => c.close_date === isoToday && c.status === "closed");
  const lastClosed = closings.find((c) => c.status === "closed");

  let dayCloseState: "previous_closed_today_open" | "today_ready_for_close" | "today_closed" | "inconsistent_rollover" = "previous_closed_today_open";
  let closeStatus: "open" | "ready_to_close" | "closed" | "inconsistent" = "open";
  let statusLabel = "🟢 Current Business Day Open";
  let expectedCash = poolsData.cash?.current || 0;
  let physicalCash = expectedCash;
  let cashDifference = 0;
  let closingNumber: string | undefined = undefined;
  const lastClosedNumber = lastClosed?.closing_number;
  const lastClosedDate = lastClosed?.close_date;

  if (todayClosed) {
    dayCloseState = "today_closed";
    closeStatus = "closed";
    statusLabel = `✅ Day Closed (${todayClosed.closing_number})`;
    closingNumber = todayClosed.closing_number;
    const cashBal = todayClosed.closing_balances?.find((b: any) => b.pool === "cash");
    if (cashBal) {
      physicalCash = Number(cashBal.final || 0);
      expectedCash = Number(cashBal.computed || 0);
      cashDifference = Number(cashBal.adjustment || 0);
    }
  } else if (activeOpenClose) {
    dayCloseState = "today_ready_for_close";
    closeStatus = "ready_to_close";
    statusLabel = `🟡 Day Close Due (${activeOpenClose.closing_number})`;
    closingNumber = activeOpenClose.closing_number;
    const cashBal = activeOpenClose.closing_balances?.find((b: any) => b.pool === "cash");
    if (cashBal) {
      physicalCash = Number(cashBal.final || 0);
      expectedCash = Number(cashBal.computed || 0);
      cashDifference = Number(cashBal.adjustment || 0);
    }
  } else if (lastClosed && lastClosed.close_date < yesterday) {
    dayCloseState = "inconsistent_rollover";
    closeStatus = "inconsistent";
    statusLabel = `🔴 Past Day (${lastClosed.close_date}) Unclosed`;
  } else {
    dayCloseState = "previous_closed_today_open";
    closeStatus = "open";
    statusLabel = lastClosedNumber
      ? `🟢 Prior Day (${lastClosedNumber}) Closed • Today Open`
      : "🟢 Current Day Open";
  }

  // Daily Chart Trend (Past 14 Days)
  const chartDays: Array<{ date: string; label: string; revenue: number; expenses: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
    
    const dayInv = invoices.filter((inv) => inv.invoice_date === dStr && inv.status !== "cancelled").reduce((s, inv) => s + Number(inv.total || 0), 0);
    const dayQ = quickSales.filter((q) => q.sale_date === dStr && q.status === "active").reduce((s, q) => s + Number(q.amount || 0), 0);
    const dayTx = transactions.filter((t) => (t.transaction_date || "").slice(0, 10) === dStr && t.status === "success").reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0);
    const dayExp = expenses.filter((e) => e.expense_date === dStr && e.status !== "cancelled").reduce((s, e) => s + Number(e.amount || 0), 0);

    chartDays.push({
      date: dStr,
      label: dayLabel,
      revenue: Math.round((dayInv + dayQ + dayTx) * 100) / 100,
      expenses: Math.round(dayExp * 100) / 100,
    });
  }

  // Digital Services Breakdown
  const aepsTxns = transactions.filter((t) => t.service_type === "aeps");
  const dmtTxns = transactions.filter((t) => t.service_type === "dmt");
  const upiTxns = transactions.filter((t) => t.service_type === "upi");
  const rechargeTxns = transactions.filter((t) => t.service_type === "recharge");

  const serviceBreakdown = {
    aeps: {
      count: aepsTxns.length,
      volume: aepsTxns.reduce((s, t) => s + Number(t.total_amount || 0), 0),
      income: aepsTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0),
    },
    dmt: {
      count: dmtTxns.length,
      volume: dmtTxns.reduce((s, t) => s + Number(t.total_amount || 0), 0),
      income: dmtTxns.reduce((s, t) => s + Number(t.service_fee || 0) - Number(t.portal_commission || 0), 0),
    },
    upi: {
      count: upiTxns.length,
      volume: upiTxns.reduce((s, t) => s + Number(t.total_amount || 0), 0),
      income: upiTxns.reduce((s, t) => s + Number(t.service_fee || 0), 0),
    },
    recharge: {
      count: rechargeTxns.length,
      volume: rechargeTxns.reduce((s, t) => s + Number(t.total_amount || 0), 0),
      income: rechargeTxns.reduce((s, t) => s + Number(t.service_fee || 0) + Number(t.portal_commission || 0), 0),
    },
  };

  // Unified Recent Activity Stream
  const activityList: any[] = [];
  for (const inv of invoices.slice(0, 10)) {
    activityList.push({
      id: "inv-" + inv.id,
      type: "sale",
      title: `Invoice #${inv.invoice_number}`,
      subtitle: inv.customers?.name || "Counter Retail Customer",
      amount: Number(inv.total || 0),
      direction: "in",
      status: inv.status,
      date: inv.created_at || inv.invoice_date,
    });
  }
  for (const exp of expenses.slice(0, 8)) {
    activityList.push({
      id: "exp-" + exp.id,
      type: "expense",
      title: exp.title || "Store Expense",
      subtitle: exp.category || "General Overhead",
      amount: Number(exp.amount || 0),
      direction: "out",
      status: exp.status,
      date: exp.created_at || exp.expense_date,
    });
  }
  for (const tx of transactions.slice(0, 8)) {
    activityList.push({
      id: "tx-" + tx.id,
      type: tx.service_type || "service",
      title: `${(tx.service_type || "Service").toUpperCase()} #${tx.transaction_number || ""}`,
      subtitle: tx.customers?.name || "Digital Counter Customer",
      amount: Number(tx.total_amount || 0),
      direction: tx.direction === "out" ? "out" : "in",
      status: tx.status,
      date: tx.created_at || tx.transaction_date,
    });
  }

  activityList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivity = activityList.slice(0, 8);

  // Deterministic Owner Alerts
  const alerts: any[] = [];

  if (auditStatus === "FAIL" || auditStatus === "CRITICAL" || criticalCount > 0) {
    alerts.push({
      id: "alert-audit",
      severity: "critical",
      title: "Financial Integrity Anomaly Detected",
      reason: latestAudit?.summary || "Deterministic mathematical invariant variance flagged by Self-Audit engine.",
      sourceModule: "Self-Audit Engine",
      actionLabel: "Open Self-Audit",
      actionHref: "/ai/self-audit",
    });
  }

  if (activeOpenClose && Math.abs(cashDifference) > 0.01) {
    alerts.push({
      id: "alert-cash-diff",
      severity: "critical",
      title: "Cash Drawer Reconciliation Variance",
      reason: `Physical cash differs from expected cash by ₹${Math.abs(cashDifference).toFixed(2)}.`,
      sourceModule: "Day Close",
      actionLabel: "Reconcile Cash",
      actionHref: "/finance/day-close",
    });
  } else if (lastClosed && lastClosed.close_date < yesterday && !todayClosed) {
    alerts.push({
      id: "alert-day-close",
      severity: "high",
      title: `Past Day Close (${lastClosed.close_date}) Pending`,
      reason: "Previous business day was not closed. Please complete closing to seal starting balances.",
      sourceModule: "Day Close",
      actionLabel: "Perform Day Close",
      actionHref: "/finance/day-close",
    });
  }

  if (totalReceivables > 1000) {
    alerts.push({
      id: "alert-dues",
      severity: "high",
      title: `₹${totalReceivables.toLocaleString("en-IN")} Customer Dues Outstanding`,
      reason: `${debtors.length} customers have unpaid balances pending collection.`,
      sourceModule: "Customer CRM",
      actionLabel: "View Debtors",
      actionHref: "/customers",
    });
  }

  if (lowStockItems.length + outOfStockItems.length > 0) {
    alerts.push({
      id: "alert-stock",
      severity: "warning",
      title: `${lowStockItems.length + outOfStockItems.length} Products Low / Out of Stock`,
      reason: `${outOfStockItems.length} out of stock, ${lowStockItems.length} below reorder threshold.`,
      sourceModule: "Inventory Master",
      actionLabel: "Manage Catalog",
      actionHref: "/catalog/products",
    });
  }

  if (poolsData.bank?.current < 10000) {
    alerts.push({
      id: "alert-bank-low",
      severity: "warning",
      title: "Low Bank Pool Float",
      reason: `Bank balance is ₹${poolsData.bank?.current?.toFixed(2)}, which may restrict morning settlement capacity.`,
      sourceModule: "Settlement Engine",
      actionLabel: "Deposit Cash",
      actionHref: "/finance/settlements",
    });
  }

  const systemHealth: "operational" | "attention" | "critical" =
    alerts.some((a) => a.severity === "critical")
      ? "critical"
      : alerts.length > 0
      ? "attention"
      : "operational";

  const verifiedContext = assembleVerifiedContext({
    periodLabel: "FY 2026-27 YTD",
    startDate: fyStart,
    endDate: fyEnd,
    taxReport,
    poolBalances: rawPools,
    customers: debtors,
    expenses,
    transactions,
    selfAuditReport: {
      audit_score: auditScore,
      status: auditStatus,
      active_anomalies_count: findings.length,
      critical_anomalies_count: criticalCount,
      top_finding: findings[0]?.title,
    },
  });

  const dashboardPackage = {
    profile: {
      name: profile?.full_name || user?.email?.split("@")[0] || "Operator",
      avatarUrl: profile?.avatar_url || null,
      role: userRole,
    },
    shop: {
      name: shopSettings.shop_name || "Sarkar Communication",
      gstin: shopSettings.gstin || null,
      currency: shopSettings.currency_symbol || "₹",
      fyLabel,
      systemHealth,
    },
    period: {
      label: "Today",
      isoToday,
      fyLabel,
      startDate: fyStart,
      endDate: fyEnd,
    },
    pnl: {
      operatingRevenue: taxReport.revenue.total_operating_revenue,
      retailRevenue: taxReport.revenue.net_retail_revenue,
      serviceFeesRevenue: taxReport.revenue.service_fees.total_service_fees,
      commissionsRevenue: taxReport.revenue.commissions.total_commissions,
      cogs: taxReport.cogs.total_cogs,
      cogsStatus: taxReport.cogs.cost_data_status,
      expenses: taxReport.expenses.total_active_expenses,
      businessProfitBeforeTax: taxReport.pnl.net_profit,
      netMarginPct: taxReport.pnl.net_profit_margin_pct,
      expenseToRevenueRatioPct: taxReport.revenue.total_operating_revenue > 0
        ? Math.round((taxReport.expenses.total_active_expenses / taxReport.revenue.total_operating_revenue) * 1000) / 10
        : 0,
      passThroughThroughput: taxReport.pass_through.total_custodial_throughput,
    },
    todayMetrics: {
      revenue: todayOperatingRevenue,
      cogs: todayCogs,
      expenses: todayExpenseTotal,
      profit: todayProfit,
      moneyIn: todayMoneyIn,
      moneyOut: todayMoneyOut,
      internalTransfers: todayInternalTransfers,
      transactionCount: todayTxCount,
      avgTicketSize: todayAvgTicket,
      quickSaleCount: todayQuick.length,
      quickSaleAmount: todayQuickRevenue,
      quickSaleMargin: todayQuick.reduce((s, q) => s + Number(q.amount) - Number(q.cost || 0), 0),
    },
    liquidity: {
      pools: poolsData,
      totalLiquidAssets: totalLiquid,
      creditCardFacility: {
        used: creditCardUsed,
        limit: creditCardLimit,
        available: creditCardAvailable,
      },
    },
    salesPerformance: {
      today: {
        txCount: todayTxCount,
        avgTicket: todayAvgTicket,
        revenue: todayOperatingRevenue,
        profit: todayProfit,
        margin: todayOperatingRevenue > 0 ? Math.round((todayProfit / todayOperatingRevenue) * 1000) / 10 : 0,
      },
      thisWeek: {
        txCount: wtdTxCount,
        avgTicket: wtdAvgTicket,
        revenue: wtdRevenue,
        profit: wtdProfit,
        margin: wtdRevenue > 0 ? Math.round((wtdProfit / wtdRevenue) * 1000) / 10 : 0,
      },
      thisMonth: {
        txCount: mtdTxCount,
        avgTicket: mtdAvgTicket,
        revenue: mtdRevenue,
        profit: mtdProfit,
        margin: mtdRevenue > 0 ? Math.round((mtdProfit / mtdRevenue) * 1000) / 10 : 0,
      },
      fyYtd: {
        txCount: invoices.length + quickSales.length + transactions.length,
        avgTicket: (invoices.length + quickSales.length + transactions.length) > 0
          ? Math.round((taxReport.revenue.total_operating_revenue / (invoices.length + quickSales.length + transactions.length)) * 100) / 100
          : 0,
        revenue: taxReport.revenue.total_operating_revenue,
        profit: taxReport.pnl.net_profit,
        margin: taxReport.pnl.net_profit_margin_pct,
      },
      trends: {
        todayVsYesterdayPct: yesterdayRevenue > 0 ? Math.round(((todayOperatingRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10 : null,
      },
    },
    chartDays,
    serviceBreakdown,
    customerData: {
      totalReceivables,
      customerCountWithDue: debtors.length,
      topDebtors: debtors.map((d: any) => ({ name: d.name || "Customer", balance: Number(d.balance || 0), phone: d.phone })),
    },
    inventoryData: {
      totalStockValue,
      isValuationMissingCost,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStockItems.length,
      lowStockItems,
    },
    auditData: {
      isAvailable: isAuditAvailable,
      score: auditScore,
      status: auditStatus,
      criticalCount,
    },
    dayCloseStatus: {
      state: dayCloseState,
      status: closeStatus,
      statusLabel,
      expectedCash,
      physicalCash,
      difference: cashDifference,
      closingNumber,
      lastClosedNumber,
      lastClosedDate,
    },
    recentActivity,
    alerts,
    morningBrief: {
      yesterdayRevenue,
      yesterdayCogs,
      yesterdayExpenses: yesterdayExpenseTotal,
      yesterdayProfit,
      todayOpeningCash: poolsData.cash?.opening || 0,
      todayOpeningBank: poolsData.bank?.opening || 0,
      attentionCount: alerts.length,
    },
    aiInsight: {
      summary: `Operating revenue stands at ₹${taxReport.revenue.total_operating_revenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })} with recorded expenses of ₹${taxReport.expenses.total_active_expenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, producing business profit before tax of ₹${taxReport.pnl.net_profit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`,
      biggestOpportunity: "Expand high-margin digital counter services (AEPS withdrawals & instant remittances) where fee revenue contributes directly to gross profit without unit inventory cost.",
      statusTag: auditStatus === "PASS" ? "Verified Canonical ERP Ledger" : "⚠️ Integrity Alert",
    },
  };

  return <DashboardClient data={dashboardPackage} verifiedContext={verifiedContext} />;
}
