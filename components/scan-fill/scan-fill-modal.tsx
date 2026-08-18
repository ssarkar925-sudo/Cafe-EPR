"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/modal";
import { extractForMode, MODE_FIELDS, type ScanFields, type ScanMode } from "@/lib/scan/extract";
import { ocrImage, fileToDataUrl } from "@/lib/scan/ocr";

type Tab = "paste" | "upload" | "camera";

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: "paste", label: "Paste text" },
  { id: "upload", label: "Upload screenshot" },
  { id: "camera", label: "Camera" },
];

export default function ScanFillModal({
  open,
  mode,
  title,
  onClose,
  onApply,
}: {
  open: boolean;
  mode: ScanMode;
  title?: string;
  onClose: () => void;
  onApply: (fields: ScanFields) => void;
}) {
  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [fields, setFields] = useState<ScanFields>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (open) {
      setTab("paste");
      setText("");
      setImage(null);
      setFields({});
      setSelected(new Set());
      setError(null);
    } else {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
  }

  function showFields(f: ScanFields) {
    setFields(f);
    setSelected(new Set(Object.keys(f)));
  }

  function mergeAi(f: ScanFields) {
    setFields((prev) => {
      const merged = { ...prev, ...f };
      setSelected(new Set(Object.keys(merged)));
      return merged;
    });
  }

  async function runOcr(file: File | Blob) {
    setBusy(true);
    setError(null);
    try {
      const t = await ocrImage(file);
      if (!t.trim()) {
        setError("No text could be read from this image. Try a clearer screenshot, or use Enhance with AI.");
        setFields({});
        setSelected(new Set());
        return;
      }
      showFields(extractForMode(t, mode));
    } catch (e) {
      setError(`OCR failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(await fileToDataUrl(file));
    await runOcr(file);
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamOn(true);
    } catch {
      setError("Camera unavailable. Use Upload screenshot instead.");
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setImage(dataUrl);
    stopCamera();
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => runOcr(blob))
      .catch(() => setError("Could not process the captured frame."));
  }

  async function aiExtract() {
    setAiBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { mode };
      if (text.trim()) body.text = text;
      if (image) body.image = image;
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "AI extraction failed");
      mergeAi(json.fields as ScanFields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI extraction failed");
    } finally {
      setAiBusy(false);
    }
  }

  function canAi() {
    return Boolean(text.trim() || image);
  }

  function apply() {
    const out: ScanFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (selected.has(k) && v !== undefined && v !== null) out[k] = v;
    }
    onApply(out);
    onClose();
  }

  const foundCount = Object.keys(fields).length;

  return (
    <Modal
      onClose={onClose}
      title={title ?? "Scan & Fill"}
      subtitle="Paste, upload or scan the transaction — the form fills automatically."
      icon="M4 7V4h16v3M9 20h6M12 4v16"
      accent="violet"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {foundCount > 0
              ? `${foundCount} field${foundCount === 1 ? "" : "s"} found`
              : "No fields found yet"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={foundCount === 0}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to form
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {TAB_LABELS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "paste" && (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste the SMS or portal transaction text here…"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <button
              onClick={() => showFields(extractForMode(text, mode))}
              disabled={!text.trim() || busy}
              className="w-full rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-40"
            >
              Extract fields
            </button>
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-sm text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Choose a screenshot from your phone / computer
            </button>
            {busy && <p className="text-center text-xs text-slate-400">Reading image…</p>}
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Screenshot preview" className="max-h-48 w-full rounded-xl object-contain ring-1 ring-slate-200" />
            )}
          </div>
        )}

        {tab === "camera" && (
          <div className="space-y-2">
            {!camOn ? (
              <button
                onClick={startCamera}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-sm text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                </svg>
                Start camera
              </button>
            ) : (
              <div className="space-y-2">
                <video ref={videoRef} playsInline muted className="max-h-72 w-full rounded-xl bg-slate-900 object-contain" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-2">
                  <button
                    onClick={capture}
                    className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                  >
                    Capture & read
                  </button>
                  <button
                    onClick={stopCamera}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}
            {busy && <p className="text-center text-xs text-slate-400">Reading image…</p>}
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Captured frame" className="max-h-48 w-full rounded-xl object-contain ring-1 ring-slate-200" />
            )}
          </div>
        )}

        {/* Enhance with AI */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-800">Enhance with AI</p>
              <p className="text-[11px] text-slate-400">
                More accurate on any app screenshot. Sends the image/text to Google Gemini.
              </p>
            </div>
            <button
              onClick={aiExtract}
              disabled={aiBusy || !canAi()}
              className="shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiBusy ? "Extracting…" : "Extract with AI"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        {/* Found fields preview */}
        {foundCount > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Found fields — untick anything to skip
            </p>
            <div className="space-y-1.5">
              {MODE_FIELDS[mode]
                .filter((f) => fields[f.key] !== undefined && fields[f.key] !== "")
                .map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(f.key)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(f.key);
                            else next.delete(f.key);
                            return next;
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-slate-500">{f.label}</span>
                    </span>
                    <span className="truncate font-medium text-slate-900">{fields[f.key]}</span>
                  </label>
                ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}