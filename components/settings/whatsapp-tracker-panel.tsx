"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import {
  getWhatsAppConfig,
  saveCloudWhatsAppConfig,
  fetchCloudWhatsAppConfig,
  getLocalWhatsAppOutbox,
  processWhatsAppOutbox,
  enqueueWhatsAppOutbox,
  type WhatsAppConfig,
  type WhatsAppOutboxMessage,
  type WhatsAppTemplates,
  type WhatsAppAutomationRules,
  DEFAULT_WA_CONFIG,
  DEFAULT_WA_TEMPLATES,
} from "@/lib/whatsapp";

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  pos_invoice: { label: "POS Invoice", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  quick_sale: { label: "Quick Sale", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" },
  payment_receipt: { label: "Payment Receipt", color: "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" },
  due_reminder: { label: "Due Reminder", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  doc_ready: { label: "Doc Ready", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  aeps_confirmation: { label: "AEPS Withdrawal", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
  dmt_confirmation: { label: "DMT Remittance", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  recharge_confirmation: { label: "Recharge", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  daily_summary: { label: "Daily Summary", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  financial_alert: { label: "Financial Alert", color: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  banking_txn: { label: "Banking Txn", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  inbound: { label: "Inbound Customer", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" },
  custom: { label: "Custom Message", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  test: { label: "Test Message", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" },
};

function fmtDateTime(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WhatsAppTrackerPanel() {
  const supabase = createClient();
  const [activeSubtab, setActiveSubtab] = useState<"outbox" | "automations" | "templates">("outbox");
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_WA_CONFIG);
  const [messages, setMessages] = useState<WhatsAppOutboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMsg, setSelectedMsg] = useState<WhatsAppOutboxMessage | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testText, setTestText] = useState("Hello from Sarkar Communication! Your WhatsApp Automation 2.0 gateway is functioning properly.");
  const [sendingTest, setSendingTest] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);

  // Template Editing State
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<keyof WhatsAppTemplates>("pos_invoice");
  const [templateContent, setTemplateContent] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const cfg = await fetchCloudWhatsAppConfig();
      setConfig(cfg);
      setTemplateContent(cfg.templates?.[selectedTemplateKey] || DEFAULT_WA_TEMPLATES[selectedTemplateKey] || "");

      const localOutbox = getLocalWhatsAppOutbox();
      let combined = [...localOutbox];

      const { data: cloudData } = await supabase
        .from("whatsapp_outbox")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (cloudData && cloudData.length > 0) {
        const idMap = new Set(cloudData.map((d: any) => d.id));
        const missingLocal = localOutbox.filter((l) => l.id && !idMap.has(l.id));
        combined = [...(cloudData as WhatsAppOutboxMessage[]), ...missingLocal];
      }

      combined.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setMessages(combined);
    } catch (err) {
      console.warn("Could not load WhatsApp outbox data:", err);
      const local = getLocalWhatsAppOutbox();
      setMessages(local);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("wa-outbox-realtime-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_outbox" },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTemplateKey]);

  const stats = useMemo(() => {
    const total = messages.length;
    const pending = messages.filter((m) => m.status === "PENDING").length;
    const processing = messages.filter((m) => m.status === "PROCESSING").length;
    const sent = messages.filter((m) => m.status === "SENT" || m.status === "DELIVERED" || m.status === "READ").length;
    const failed = messages.filter((m) => m.status === "FAILED").length;
    return { total, pending, processing, sent, failed };
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        m.phone?.toLowerCase().includes(q) ||
        m.recipient_name?.toLowerCase().includes(q) ||
        m.reference_id?.toLowerCase().includes(q) ||
        m.message_body?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || m.status.toLowerCase() === statusFilter.toLowerCase();
      const matchType = typeFilter === "all" || m.message_type === typeFilter;
      return matchSearch && matchStatus && matchType;
    });
  }, [messages, search, statusFilter, typeFilter]);

  async function handleToggleAutomation(key: keyof WhatsAppAutomationRules) {
    const updated: WhatsAppConfig = {
      ...config,
      automations: {
        ...config.automations,
        [key]: !config.automations[key],
      },
    };
    setConfig(updated);
    await saveCloudWhatsAppConfig(updated);
  }

  async function handleSaveTemplate() {
    const updatedTemplates: WhatsAppTemplates = {
      ...(config.templates || DEFAULT_WA_TEMPLATES),
      [selectedTemplateKey]: templateContent,
    };
    const updatedConfig: WhatsAppConfig = {
      ...config,
      templates: updatedTemplates,
    };
    setConfig(updatedConfig);
    await saveCloudWhatsAppConfig(updatedConfig);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }

  async function handleTriggerManualQueueRun() {
    setProcessingQueue(true);
    await processWhatsAppOutbox();
    await loadData();
    setProcessingQueue(false);
  }

  async function handleSendTest() {
    if (!testPhone.trim()) return;
    setSendingTest(true);
    await enqueueWhatsAppOutbox({
      phone: testPhone,
      messageType: "test",
      messageBody: testText,
      referenceType: "manual",
      referenceId: "test_" + Date.now(),
    });
    await processWhatsAppOutbox();
    await loadData();
    setSendingTest(false);
    setTestModalOpen(false);
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📱</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">WhatsApp Automation 2.0 &amp; Outbox</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Durable message queue, event automations, delivery idempotency, and realtime socket transport.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTriggerManualQueueRun}
            disabled={processingQueue}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-700"
          >
            <span>{processingQueue ? "Processing Queue..." : "Process Outbox Queue"}</span>
          </button>
          <button
            onClick={() => setTestModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            Send Test Message
          </button>
        </div>
      </div>

      {/* Subtab Navigation */}
      <div className="flex overflow-x-auto rounded-2xl border border-slate-200 bg-slate-100/70 p-1.5 dark:border-white/10 dark:bg-slate-900">
        {[
          { key: "outbox", label: `📥 Outbox Queue & Logs (${stats.pending} pending)` },
          { key: "automations", label: "⚡ Event Automation Rules" },
          { key: "templates", label: "📝 Message Templates & Variables" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveSubtab(t.key as any)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeSubtab === t.key
                ? "bg-white text-indigo-900 shadow-sm dark:bg-indigo-600 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Queue Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Enqueued</div>
          <div className="mt-1 text-xl font-black text-slate-900 dark:text-white">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider dark:text-amber-300">Pending Queue</div>
          <div className="mt-1 text-xl font-black text-amber-700 dark:text-amber-400">{stats.pending}</div>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider dark:text-indigo-300">Processing</div>
          <div className="mt-1 text-xl font-black text-indigo-700 dark:text-indigo-400">{stats.processing}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider dark:text-emerald-300">Sent / Delivered</div>
          <div className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-400">{stats.sent}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider dark:text-rose-300">Failed Retries</div>
          <div className="mt-1 text-xl font-black text-rose-700 dark:text-rose-400">{stats.failed}</div>
        </div>
      </div>

      {/* ==============================================================================
          SUBTAB 1: OUTBOX QUEUE & LOGS
      ============================================================================== */}
      {activeSubtab === "outbox" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-white/5">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search phone, recipient, text..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="all">All Message Types</option>
                <option value="pos_invoice">POS Invoice</option>
                <option value="quick_sale">Quick Sale</option>
                <option value="payment_receipt">Payment Receipt</option>
                <option value="due_reminder">Due Reminder</option>
                <option value="doc_ready">Document Ready</option>
                <option value="aeps_confirmation">AEPS Confirmation</option>
                <option value="dmt_confirmation">DMT Confirmation</option>
                <option value="recharge_confirmation">Recharge</option>
                <option value="daily_summary">Daily Summary</option>
                <option value="financial_alert">Financial Alert</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 dark:border-white/10">
                  <th className="pb-2.5 font-bold">Recipient</th>
                  <th className="pb-2.5 font-bold">Type</th>
                  <th className="pb-2.5 font-bold">Reference</th>
                  <th className="pb-2.5 font-bold text-center">Status</th>
                  <th className="pb-2.5 font-bold text-center">Attempts</th>
                  <th className="pb-2.5 font-bold text-right">Created At</th>
                  <th className="pb-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 dark:divide-white/5 dark:text-slate-300">
                {filteredMessages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      No messages found in outbox queue.
                    </td>
                  </tr>
                ) : (
                  filteredMessages.map((m) => {
                    const typeMeta = TYPE_LABEL[m.message_type] || { label: m.message_type, color: "bg-slate-100 text-slate-700" };
                    const statusColor = {
                      PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
                      PROCESSING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
                      SENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                      DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                      READ: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
                      FAILED: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
                      CANCELLED: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300",
                    }[m.status] || "bg-slate-100 text-slate-700";

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5">
                        <td className="py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{m.phone}</div>
                          {m.recipient_name && <div className="text-[11px] text-slate-400">{m.recipient_name}</div>}
                        </td>
                        <td className="py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${typeMeta.color}`}>
                            {typeMeta.label}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">
                          {m.reference_id ? <span className="font-mono text-[11px]">{m.reference_id}</span> : "-"}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 text-center font-mono">{m.attempt_count}/4</td>
                        <td className="py-3 text-right text-slate-400">{fmtDateTime(m.created_at)}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setSelectedMsg(m)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================================
          SUBTAB 2: EVENT AUTOMATION RULES
      ============================================================================== */}
      {activeSubtab === "automations" && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-4 dark:border-white/5">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">ERP Event Automation Triggers</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Decoupled event triggers: Automatically enqueue outbox messages when transactions commit in the database.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { key: "auto_send_pos" as const, title: "POS Tax Invoices", desc: "Enqueue invoice receipt with PDF link after sale completes." },
              { key: "auto_send_quick" as const, title: "Quick Counter Sales", desc: "Enqueue receipt for Xerox, Photos, and quick digital services." },
              { key: "auto_send_payment" as const, title: "Payment Receipts", desc: "Enqueue payment confirmation upon balance / invoice payment." },
              { key: "auto_send_due_reminder" as const, title: "Customer Due Reminders", desc: "Allow automatic outstanding due reminders for debtors." },
              { key: "auto_send_document_ready" as const, title: "Document Ready Alerts", desc: "Notify customer when application or print job is ready." },
              { key: "auto_send_aeps" as const, title: "AEPS Cash Withdrawals", desc: "Enqueue official receipt for Aadhaar cash withdrawals." },
              { key: "auto_send_dmt" as const, title: "DMT Remittances", desc: "Enqueue confirmation for Domestic Money Transfers." },
              { key: "auto_send_recharge" as const, title: "Mobile & DTH Recharge", desc: "Enqueue instant recharge transaction confirmations." },
              { key: "auto_send_daily_summary" as const, title: "Daily Owner Summary", desc: "Send daily closing P&L & liquidity brief to shop owner." },
              { key: "auto_send_financial_alerts" as const, title: "Financial Integrity Alarms", desc: "Alert shop owner immediately if Self-Audit flags FAIL/CRITICAL." },
            ].map((rule) => {
              const active = Boolean(config.automations?.[rule.key]);
              return (
                <div key={rule.key} className="flex items-start justify-between rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                  <div className="space-y-1 pr-4">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white sm:text-sm">{rule.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{rule.desc}</p>
                  </div>
                  <button
                    onClick={() => handleToggleAutomation(rule.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ease-in-out duration-200 ${
                      active ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ease-in-out duration-200 ${
                      active ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==============================================================================
          SUBTAB 3: MESSAGE TEMPLATES & VARIABLES
      ============================================================================== */}
      {activeSubtab === "templates" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {[
              { key: "pos_invoice" as const, label: "🧾 POS Tax Invoice" },
              { key: "quick_sale" as const, label: "⚡ Quick Counter Sale" },
              { key: "payment_receipt" as const, label: "💳 Payment Confirmation" },
              { key: "due_reminder" as const, label: "⚠️ Customer Due Reminder" },
              { key: "doc_ready" as const, label: "📂 Document Ready Alert" },
              { key: "aeps_confirmation" as const, label: "🏧 AEPS Cash Withdrawal" },
              { key: "dmt_confirmation" as const, label: "💸 DMT Money Transfer" },
              { key: "recharge_confirmation" as const, label: "📱 Mobile/DTH Recharge" },
              { key: "daily_summary" as const, label: "📊 Daily Owner Summary" },
              { key: "financial_alert" as const, label: "🚨 Financial Integrity Alarm" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setSelectedTemplateKey(t.key);
                  setTemplateContent(config.templates?.[t.key] || DEFAULT_WA_TEMPLATES[t.key] || "");
                }}
                className={`w-full rounded-2xl p-3 text-left text-xs font-bold transition ${
                  selectedTemplateKey === t.key
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-8 dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Template Content Editor</h3>
              {saveSuccess && <span className="text-xs font-bold text-emerald-600">Saved successfully!</span>}
            </div>

            <textarea
              rows={10}
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-bold">Allowed Variables:</span>
              {["{customer_name}", "{invoice_number}", "{amount}", "{paid_amount}", "{due_amount}", "{date}", "{service_name}", "{receipt_url}", "{shop_name}"].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTemplateContent((prev) => prev + " " + tag)}
                  className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300"
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="text-right pt-2">
              <button
                onClick={handleSaveTemplate}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 transition"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedMsg && (
        <Modal onClose={() => setSelectedMsg(null)} title="Outbox Message Details">
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl dark:bg-slate-800">
              <div>
                <span className="text-slate-400">Recipient Phone:</span>
                <div className="font-bold text-slate-900 dark:text-white">{selectedMsg.phone}</div>
              </div>
              <div>
                <span className="text-slate-400">Status:</span>
                <div className="font-bold uppercase text-indigo-600 dark:text-indigo-400">{selectedMsg.status}</div>
              </div>
              <div>
                <span className="text-slate-400">Reference:</span>
                <div className="font-mono text-slate-800 dark:text-slate-200">{selectedMsg.reference_id || "-"}</div>
              </div>
              <div>
                <span className="text-slate-400">Attempts:</span>
                <div className="font-mono text-slate-800 dark:text-slate-200">{selectedMsg.attempt_count} / 4</div>
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-bold">Message Content:</span>
              <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-slate-100 p-3 font-mono text-[11px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {selectedMsg.message_body}
              </pre>
            </div>

            {selectedMsg.error_message && (
              <div className="rounded-xl bg-rose-50 p-3 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                <strong>Error Log:</strong> {selectedMsg.error_message}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Send Test Modal */}
      {testModalOpen && (
        <Modal onClose={() => setTestModalOpen(false)} title="Send Test WhatsApp Message">
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Mobile Number (10 digits)</label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300">Message Text</label>
              <textarea
                rows={4}
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-900 outline-none focus:border-indigo-500 dark:border-white/10 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="text-right">
              <button
                onClick={handleSendTest}
                disabled={sendingTest || !testPhone.trim()}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {sendingTest ? "Enqueuing & Sending..." : "Enqueue & Send Test"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
