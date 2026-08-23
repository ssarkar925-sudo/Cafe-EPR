"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import WhatsAppSendModal from "@/components/whatsapp/whatsapp-send-modal";
import { getLocalWhatsAppLogs, type WhatsAppLogEntry } from "@/lib/whatsapp";

const SQL_MIGRATION = `-- WhatsApp Message History Tracker Table
create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  recipient_name text,
  message_type text not null default 'custom',
  ref_id text,
  ref_number text,
  message_text text not null,
  status text not null default 'sent',
  provider text not null default 'local_gateway',
  error_message text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists whatsapp_logs_created_at_idx on public.whatsapp_logs (created_at desc);
create index if not exists whatsapp_logs_phone_idx on public.whatsapp_logs (recipient_phone);

alter table public.whatsapp_logs enable row level security;

create policy "whatsapp_logs read" on public.whatsapp_logs for select to authenticated using (true);
create policy "whatsapp_logs insert" on public.whatsapp_logs for insert to authenticated with check (true);
create policy "whatsapp_logs update" on public.whatsapp_logs for update to authenticated using (true);
`;

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  pos_invoice: { label: "POS Invoice", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  quick_sale: { label: "Quick Sale", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" },
  banking_txn: { label: "Banking Txn", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  due_reminder: { label: "Due Reminder", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  day_close: { label: "Day Close", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
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
  const [logs, setLogs] = useState<WhatsAppLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<WhatsAppLogEntry | null>(null);
  const [resendLog, setResendLog] = useState<WhatsAppLogEntry | null>(null);
  const [stats, setStats] = useState({ total: 0, today: 0, sent: 0, failed: 0 });
  const [hasCloudTable, setHasCloudTable] = useState<boolean | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  async function loadLogs() {
    setLoading(true);
    try {
      const localLogs = getLocalWhatsAppLogs();
      let combinedLogs = [...localLogs];

      const { data, error } = await supabase
        .from("whatsapp_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        setHasCloudTable(false);
      } else if (data) {
        setHasCloudTable(true);
        // Merge Supabase logs and Local logs (deduplicate)
        const idMap = new Set(data.map((d) => d.id));
        const missingLocal = localLogs.filter((l) => l.id && !idMap.has(l.id));
        combinedLogs = [...(data as WhatsAppLogEntry[]), ...missingLocal];
      }

      // Sort by date descending
      combinedLogs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setLogs(combinedLogs);

      // Calculate stats
      const todayStr = new Date().toISOString().slice(0, 10);
      const total = combinedLogs.length;
      const today = combinedLogs.filter((l) => l.created_at?.startsWith(todayStr)).length;
      const sent = combinedLogs.filter((l) => l.status === "sent" || l.status === "delivered").length;
      const failed = combinedLogs.filter((l) => l.status === "failed").length;
      setStats({ total, today, sent, failed });
    } catch (e) {
      console.warn("Could not load WhatsApp logs:", e);
      const localLogs = getLocalWhatsAppLogs();
      setLogs(localLogs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        l.recipient_phone?.toLowerCase().includes(q) ||
        l.recipient_name?.toLowerCase().includes(q) ||
        l.ref_number?.toLowerCase().includes(q) ||
        l.message_text?.toLowerCase().includes(q);

      const matchType = typeFilter === "all" || l.message_type === typeFilter;
      const matchStatus = statusFilter === "all" || l.status === statusFilter;

      return matchSearch && matchType && matchStatus;
    });
  }, [logs, search, typeFilter, statusFilter]);

  function exportCsv() {
    if (filteredLogs.length === 0) return;
    const headers = ["ID", "Date & Time", "Recipient Phone", "Recipient Name", "Type", "Ref Number", "Status", "Provider", "Message Text"];
    const rows = filteredLogs.map((l) => [
      l.id || "",
      l.created_at || "",
      l.recipient_phone,
      l.recipient_name || "",
      l.message_type,
      l.ref_number || "",
      l.status,
      l.provider,
      '"' + (l.message_text || "").replace(/"/g, '""') + '"',
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `whatsapp_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Cloud Sync Status Banner */}
      {hasCloudTable === false && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">💾</span>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">Local Device Message Tracker Active</h4>
                <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  Message history is stored locally in your browser. To sync history across multiple devices in Supabase Cloud, run the SQL script in your Supabase SQL Editor.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(SQL_MIGRATION);
                setCopiedSql(true);
                setTimeout(() => setCopiedSql(false), 3000);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
            >
              {copiedSql ? "✓ SQL Copied to Clipboard!" : "📋 Copy Supabase SQL"}
            </button>
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Tracked</p>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Sent Today</p>
          <p className="mt-1 text-2xl font-black text-blue-600 dark:text-blue-400">{stats.today}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Delivered</p>
          <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.sent}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Failed / Errors</p>
          <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">{stats.failed}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-2.5 h-4 w-4 text-slate-400">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search phone, name, invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-blue-500 focus:bg-white dark:border-white/10 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Message Types</option>
            <option value="pos_invoice">POS Invoices</option>
            <option value="quick_sale">Quick Sales</option>
            <option value="banking_txn">Banking / Remittance</option>
            <option value="due_reminder">Due Reminders</option>
            <option value="day_close">Day Close Slips</option>
            <option value="custom">Custom Messages</option>
            <option value="test">Test Messages</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Delivery Statuses</option>
            <option value="sent">Sent / Delivered</option>
            <option value="failed">Failed</option>
            <option value="fallback_link">Direct Link Opened</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLogs}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50 font-bold text-slate-600 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="py-3 pl-4 pr-2">Date &amp; Time</th>
                <th className="py-3 px-3">Recipient</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Reference #</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Message Preview</th>
                <th className="py-3 pl-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading WhatsApp history...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No WhatsApp messages found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((l, idx) => {
                  const typeInfo = TYPE_LABEL[l.message_type] || TYPE_LABEL.custom;
                  const isSuccess = l.status === "sent" || l.status === "delivered";
                  const isFail = l.status === "failed";

                  return (
                    <tr key={l.id || idx} className="transition hover:bg-slate-50/70 dark:hover:bg-white/5">
                      <td className="whitespace-nowrap py-3 pl-4 pr-2 font-medium text-slate-600 dark:text-slate-400">
                        {fmtDateTime(l.created_at)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {l.recipient_name || "Customer"}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          +{l.recipient_phone}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-3 px-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                        {l.ref_number || "-"}
                      </td>
                      <td className="whitespace-nowrap py-3 px-3">
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            ✓ Delivered
                          </span>
                        )}
                        {isFail && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300" title={l.error_message || ""}>
                            ✕ Failed
                          </span>
                        )}
                        {l.status === "fallback_link" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            ↗ Link Opened
                          </span>
                        )}
                      </td>
                      <td className="max-w-[260px] truncate py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400" title={l.message_text}>
                        {l.message_text}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(l)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => setResendLog(l)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          >
                            Resend / Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Message Detail Modal */}
      {selectedLog && (
        <Modal
          onClose={() => setSelectedLog(null)}
          title="WhatsApp Message Details"
          subtitle={`Recipient: +${selectedLog.recipient_phone} (${selectedLog.recipient_name || "Customer"})`}
          accent="emerald"
          size="md"
        >
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-bold uppercase text-slate-400">Date &amp; Time</p>
                <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{fmtDateTime(selectedLog.created_at)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-bold uppercase text-slate-400">Reference Number</p>
                <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{selectedLog.ref_number || "None"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                <p className="mt-0.5 font-bold uppercase text-slate-900 dark:text-white">{selectedLog.status}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-[10px] font-bold uppercase text-slate-400">Provider</p>
                <p className="mt-0.5 font-bold uppercase text-slate-900 dark:text-white">{selectedLog.provider}</p>
              </div>
            </div>

            {selectedLog.error_message && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                <p className="font-bold">Error Message:</p>
                <p className="mt-0.5">{selectedLog.error_message}</p>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Full Message Content:</p>
              <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                {selectedLog.message_text}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(selectedLog.message_text);
                  alert("Message copied to clipboard!");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200"
              >
                📋 Copy Text
              </button>
              <button
                type="button"
                onClick={() => {
                  const logToResend = selectedLog;
                  setSelectedLog(null);
                  setResendLog(logToResend);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500"
              >
                Resend / Edit Message
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Resend / Edit Message Modal */}
      {resendLog && (
        <WhatsAppSendModal
          open={Boolean(resendLog)}
          onClose={() => setResendLog(null)}
          phone={resendLog.recipient_phone}
          recipientName={resendLog.recipient_name || undefined}
          initialMessage={resendLog.message_text}
          messageType={resendLog.message_type}
          refId={resendLog.ref_id || undefined}
          refNumber={resendLog.ref_number || undefined}
          onSent={loadLogs}
        />
      )}
    </div>
  );
}
