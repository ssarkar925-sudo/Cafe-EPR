"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/ui/modal";
import { logAudit } from "@/lib/audit";

type AvatarModalProps = {
  open: boolean;
  name?: string;
  email?: string;
  avatarUrl?: string | null;
  currentAvatar?: string | null;
  userId: string;
  onClose: () => void;
  onSaved?: (url: string | null) => void;
  onAvatarUpdated?: (url: string | null) => void;
};

export default function AvatarModal({
  open,
  name = "User",
  email = "",
  avatarUrl,
  currentAvatar,
  userId,
  onClose,
  onSaved,
  onAvatarUpdated,
}: AvatarModalProps) {
  const initialAvatar = avatarUrl ?? currentAvatar ?? null;
  const [preview, setPreview] = useState<string | null>(initialAvatar);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  if (!open) return null;

  const notifySaved = (url: string | null) => {
    onSaved?.(url);
    onAvatarUpdated?.(url);
  };

  const flash = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  async function uploadAvatar(file: File) {
    setUploading(true);
    setToast(null);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
      const path = `user-${userId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) {
        flash("error", error.message);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setPreview(data.publicUrl);
      flash("success", "Photo uploaded — press Save.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setToast(null);
    const { error } = await supabase.from("profiles").update({ avatar_url: preview }).eq("id", userId);
    setSaving(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    notifySaved(preview);
    logAudit({ action: "upload", entity: "profile", entity_id: userId, description: "Profile photo updated" });
    flash("success", "Photo saved.");
  }

  async function remove() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    setSaving(false);
    if (error) {
      flash("error", error.message);
      return;
    }
    setPreview(null);
    notifySaved(null);
    logAudit({ action: "upload", entity: "profile", entity_id: userId, description: "Profile photo removed" });
    flash("success", "Photo removed.");
  }

  return (
    <Modal noHeader onClose={onClose} size="sm" bodyClassName="p-0" footer={
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={save} disabled={saving || uploading || preview === initialAvatar} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
      </div>
    }>
      <div className="relative bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#020617] px-6 pb-6 pt-8 text-center">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white">×</button>
        <div className="relative mx-auto h-28 w-28">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 via-indigo-500 to-purple-500 opacity-70 blur-lg" />
          {preview ? <img src={preview} alt="Avatar" className="relative h-28 w-28 rounded-full border-4 border-white/20 object-cover shadow-xl" /> : <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/20 bg-gradient-to-br from-blue-500 to-indigo-600 text-4xl font-bold text-white shadow-xl">{name.slice(0, 1).toUpperCase()}</div>}
          <button type="button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg ring-2 ring-slate-200 hover:bg-slate-50">+</button>
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">{name}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{email}</p>
      </div>
      <div className="px-6 py-5">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50">{uploading ? "Uploading…" : preview ? "Choose another photo" : "Upload a photo"}</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAvatar(file); e.target.value = ""; }} />
        {preview && <button type="button" onClick={remove} disabled={saving} className="mt-2 w-full rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">Remove photo</button>}
        {toast && <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-medium text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"}`}>{toast.text}</div>}
      </div>
    </Modal>
  );
}
