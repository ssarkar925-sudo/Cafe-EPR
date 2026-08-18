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
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <Modal
      as="form"
      onSubmit={submit}
      onClose={onClose}
      title={editing ? "Edit Category" : "Add Category"}
      subtitle={editing ? "Update the category details" : "Create a new category"}
      icon="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
      accent="indigo"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Add category"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
}