"use client";

import React, { useState, useEffect } from "react";
import Modal from "@/components/ui/modal";
import {
  notify,
  type NotificationType,
  requestNativeNotificationPermission,
} from "@/components/ui/notification-provider";

interface SendNotificationModalProps {
  open: boolean;
  onClose: () => void;
}

interface Preset {
  id: string;
  name: string;
  category: string;
  type: NotificationType;
  title: string;
  message: string;
  icon: string;
}

const PRESETS: Preset[] = [
  {
    id: "low-stock",
    name: "Low Inventory Warning",
    category: "Inventory",
    type: "warning",
    title: "Low Inventory Alert",
    message: "A4 Paper & 80mm Thermal Receipt Rolls are critically low. Please reorder immediately.",
    icon: "📦",
  },
  {
    id: "khata-due",
    name: "Khata Due Collection",
    category: "Khata",
    type: "info",
    title: "Customer Khata Payment Due",
    message: "Pending customer balance of ₹2,500 is due today. Please follow up with the customer.",
    icon: "💳",
  },
  {
    id: "counter-help",
    name: "Counter Assistance",
    category: "Operations",
    type: "warning",
    title: "Counter 1 Assistance Needed",
    message: "Rush at main desk. Additional staff required for billing settlement and print queue.",
    icon: "🙋",
  },
  {
    id: "day-close",
    name: "Day Close & Cash Count",
    category: "Finance",
    type: "error",
    title: "Day Close & Cash Reconciliation",
    message: "Shift ending in 15 mins. Please count physical cash in drawer and run Day-Close report.",
    icon: "🔒",
  },
  {
    id: "test-alert",
    name: "Test Notification",
    category: "System",
    type: "success",
    title: "CafeERP Multi-Platform Test",
    message: "Notification verified across Web, Android system tray, and Windows desktop Action Center!",
    icon: "🚀",
  },
];

const TYPE_OPTIONS: { type: NotificationType; label: string; color: string; border: string; bg: string }[] = [
  {
    type: "info",
    label: "Info",
    color: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    type: "success",
    label: "Success",
    color: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  {
    type: "warning",
    label: "Warning",
    color: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    type: "error",
    label: "Urgent",
    color: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/40",
  },
];

export default function SendNotificationModal({ open, onClose }: SendNotificationModalProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("low-stock");
  const [type, setType] = useState<NotificationType>("warning");
  const [title, setTitle] = useState("Low Inventory Alert");
  const [message, setMessage] = useState(
    "A4 Paper & 80mm Thermal Receipt Rolls are critically low. Please reorder immediately."
  );
  const [isElectron, setIsElectron] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [sentNotice, setSentNotice] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsElectron(Boolean((window as any).electronAPI?.isElectron));
      if ("Notification" in window) {
        setPermission(Notification.permission);
      }
    }
  }, [open]);

  if (!open) return null;

  const handleApplyPreset = (preset: Preset) => {
    setSelectedPresetId(preset.id);
    setType(preset.type);
    setTitle(preset.title);
    setMessage(preset.message);
  };

  const handleRequestPermission = async () => {
    const result = await requestNativeNotificationPermission();
    setPermission(result);
    if (result === "granted") {
      notify("success", "Native notification permission granted for this device!", "Permission Enabled");
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    // Trigger multi-platform notification (Web banner + sound + haptic + Windows toast + Android status bar)
    notify(type, message.trim(), title.trim() || undefined, 4500);

    setSentNotice(true);
    setTimeout(() => setSentNotice(false), 2600);
  };

  return (
    <Modal
      onClose={onClose}
      title="Send Multi-Platform Notification"
      subtitle="Broadcast alerts to Android system tray, Windows desktop toast, and Web app"
      accent="indigo"
      size="lg"
      icon="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
    >
      <div className="space-y-5 py-1">
        {/* Connected Platform Status Bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Target Platforms:</span>

          {/* Web App */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            🌐 Web App Active
          </span>

          {/* Windows Desktop */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              isElectron
                ? "bg-blue-100/80 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                : "bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isElectron ? "bg-blue-500 animate-pulse" : "bg-slate-400"}`}
            />
            💻 Windows Action Center {isElectron ? "Connected" : "Supported"}
          </span>

          {/* Android App */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              permission === "granted"
                ? "bg-teal-100/80 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                : "bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                permission === "granted" ? "bg-teal-500" : "bg-amber-500"
              }`}
            />
            🤖 Android Status Bar {permission === "granted" ? "Ready" : "Pending Permission"}
          </span>

          {permission !== "granted" && (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="ml-auto rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-700 shadow-sm"
            >
              Enable Native Tray
            </button>
          )}
        </div>

        {/* Quick Presets */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quick Preset Templates
            </span>
            <span className="text-[11px] text-slate-400">Click to autofill</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => {
              const isSelected = selectedPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/70 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850"
                  }`}
                >
                  <span className="text-lg leading-none">{p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{p.category}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notification Compose Form */}
        <form onSubmit={handleSend} className="space-y-4">
          {/* Severity / Type Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Alert Level
            </label>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => setType(opt.type)}
                  className={`rounded-xl border py-2 text-center text-xs font-bold transition ${
                    type === opt.type
                      ? `${opt.border} ${opt.bg} ${opt.color} shadow-sm ring-2 ring-indigo-500/20`
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title Input */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Notification Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Low Stock Alert, Payment Due"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              required
            />
          </div>

          {/* Message Textarea */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Message Content
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter message text that will display on phone lockscreen and desktop toast..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              required
            />
          </div>

          {/* Success Banner */}
          {sentNotice && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-emerald-600">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Dispatched! Toast shown on Windows Action Center and Android status bar.</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
            >
              Close
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  notify(
                    "info",
                    "Device sound & vibration chime test triggered successfully.",
                    "Audio/Haptic Test"
                  );
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300"
              >
                🔊 Test Sound & Vibration
              </button>

              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition hover:opacity-95 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
                <span>Send Alert Now</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
