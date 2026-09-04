"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import type { Category } from "./categories-client";

type Props = {
  state: { mode: "create" } | { mode: "edit"; category: Category };
  onClose: () => void;
  onSave: (
    input: { name: string; description: string },
    category?: Category
  ) => Promise<void>;
};

export default function CategoryFormModal({ state, onClose, onSave }: Props) {
  const editing = state.mode === "edit" ? state.category : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({ name, description }, editing ?? undefined);
    setSaving(false);
  }

  const inputClass =
    "w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white";
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Category" : "Add Catalog Category"}
      subtitle={editing ? "Update the category hierarchy details" : "Create a new category for POS quick filters and grouping"}
      icon="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
      accent="indigo"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-3d-tactile-secondary rounded-xl px-4 py-2 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="btn-3d-tactile-primary rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Category"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Category Name *</label>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hot Beverages, Printing, Stationery"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Description / Notes</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional group details or shelf placement"
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}