"use client";

import { FormEvent, useEffect, useState } from "react";

type Memory = {
  id: string;
  category: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  updated_at: string;
};

export default function AIMemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("preference");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadMemories() {
    try {
      const res = await fetch("/api/ai/memory", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load memory");
      setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load memory");
    }
  }

  useEffect(() => {
    void loadMemories();
  }, []);

  async function saveMemory(event: FormEvent) {
    event.preventDefault();
    const cleanKey = key.trim();
    const cleanValue = value.trim();
    if (!cleanKey || !cleanValue || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ai/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, memory_key: cleanKey, memory_value: cleanValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save memory");
      setKey("");
      setValue("");
      setNotice("Saved to your AI memory.");
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save memory");
    } finally {
      setBusy(false);
    }
  }

  async function forgetMemory(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/ai/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not forget memory");
      setNotice("Memory forgotten. The agent will no longer use it.");
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not forget memory");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white">AI Memory</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Save your preferences and business instructions. You can forget any memory at any time.</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">OWNER CONTROLLED</span>
      </div>

      <form onSubmit={saveMemory} className="mt-4 grid gap-2 sm:grid-cols-[150px_1fr_1fr_auto]">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-200">
          <option value="preference">Preference</option>
          <option value="business">Business</option>
          <option value="instruction">Instruction</option>
          <option value="communication">Communication</option>
        </select>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="What should I remember?" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-white" />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Example: Always call me Saikat" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-slate-950 dark:text-white" />
        <button type="submit" disabled={busy || !key.trim() || !value.trim()} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Remember"}</button>
      </form>

      {notice && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">{notice}</div>}
      {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}

      <div className="mt-4 space-y-2">
        {memories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400 dark:border-white/10">No active memories yet.</div>
        ) : memories.slice(0, 8).map((memory) => (
          <div key={memory.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-slate-950/60">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">{memory.category}</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-100">{memory.memory_key}</span>
              </div>
              <div className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">{String(memory.memory_value)}</div>
            </div>
            <button type="button" onClick={() => void forgetMemory(memory.id)} disabled={busy} className="shrink-0 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[10px] font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10">Forget</button>
          </div>
        ))}
      </div>
    </section>
  );
}
