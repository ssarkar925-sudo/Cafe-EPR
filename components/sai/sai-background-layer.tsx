"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Mic, Send, X } from "lucide-react";

type Message = { id: string; role: "user" | "sai"; text: string };

function getSafePosition() {
  if (typeof window === "undefined") return { bottom: 24, right: 24 };
  const bottom = window.innerWidth < 640 ? 76 : 24;
  const right = window.innerWidth < 640 ? 16 : 24;
  return { bottom, right };
}

export default function SAIBackgroundLayer() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [position, setPosition] = useState(getSafePosition);
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const prompt = text.trim();
    if (!prompt || busy) return;
    setText("");
    await askPrompt(prompt);
  }

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop?.();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function pickRecordingMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function transcribeRecording(blob: Blob) {
    setTranscribing(true);
    setVoiceError("");
    try {
      const extension = blob.type.includes("webm")
        ? "webm"
        : blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "mp4"
            : "audio";
      const form = new FormData();
      form.append("audio", blob, `sai-voice.${extension}`);

      const response = await fetch("/api/sai/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Voice transcription failed.");
      }

      const transcript = String(data?.transcript || "").trim();
      if (!transcript) throw new Error("No speech was detected. Please speak again.");

      setText(transcript);
      await askPrompt(transcript);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Voice transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  async function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
  }

  async function toggleVoice() {
    if (transcribing) return;

    if (mediaRecorderRef.current?.state === "recording") {
      await stopVoiceRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Microphone capture is not available in this browser.");
      return;
    }

    const mimeType = pickRecordingMimeType();
    if (!mimeType) {
      setVoiceError("This browser cannot record microphone audio.");
      return;
    }

    setVoiceError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setListening(false);
        setVoiceError("Microphone recording failed. Please try again.");
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };

      recorder.onstop = () => {
        setListening(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        const chunks = audioChunksRef.current;
        audioChunksRef.current = [];
        if (!chunks.length) {
          setVoiceError("No microphone audio was captured. Please try again.");
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        void transcribeRecording(blob);
      };

      recorder.start();
      setListening(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setListening(false);
      if (name === "NotAllowedError") {
        setVoiceError("Chrome is not allowing microphone capture. Check the microphone toggle for this site.");
      } else if (name === "NotFoundError") {
        setVoiceError("No microphone device was found.");
      } else if (name === "NotReadableError") {
        setVoiceError("The selected microphone is busy or unavailable.");
      } else if (name === "SecurityError") {
        setVoiceError("Microphone capture is blocked by browser security.");
      } else {
        setVoiceError("Unable to start microphone recording.");
      }
    }
  }

  useEffect(() => {
    const onResize = () => setPosition(getSafePosition());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/sai/status", { cache: "no-store" });
        if (!cancelled) setOnline(response.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    }
    void check();
    const timer = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function askPrompt(prompt: string) {
    if (!prompt || busy) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: prompt };
    setMessages((current) => [...current, userMessage]);
    setBusy(true);

    try {
      const response = await fetch("/api/sai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          surface: "sai",
          history: messages
            .slice(-10)
            .map((item) => ({
              role: item.role === "sai" ? "assistant" : "user",
              content: item.text,
            })),
          context: { path: window.location.pathname },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "SAI service unavailable");
      setOnline(true);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "sai", text: data?.message || data?.reply || "Done." },
      ]);
    } catch (error) {
      setOnline(false);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "sai",
          text: error instanceof Error ? error.message : "SAI is temporarily unavailable.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask SAI"
        title="Ask SAI"
        className="fixed z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-800 shadow-[0_8px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition hover:scale-[1.04] hover:shadow-[0_12px_36px_rgba(15,23,42,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10 dark:bg-slate-900/95 dark:text-white dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
        style={{ bottom: position.bottom, right: position.right }}
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
          <Bot className="h-4 w-4" />
          {online === true && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />}
        </span>
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-4 z-[80] w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_24px_80px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-slate-950/98 sm:bottom-20 sm:right-6"
          role="dialog"
          aria-modal="false"
          aria-label="SAI"
        >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">SAI</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className={online === false ? "h-1.5 w-1.5 rounded-full bg-amber-500" : "h-1.5 w-1.5 rounded-full bg-emerald-500"} />
                    {online === false ? "Service unavailable" : "Background assistant"}
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[min(55vh,420px)] min-h-24 overflow-y-auto px-4 py-3">
              {messages.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center text-center text-xs text-slate-400">
                  Ask SAI about the screen you are using or your business.
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                      <div className={message.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-xs text-white dark:bg-white dark:text-slate-900" : "max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-white/10 dark:text-slate-200"}>
                        {message.text}
                      </div>
                    </div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> SAI is working…
                    </div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={ask} className="border-t border-slate-100 p-3 dark:border-white/10">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white/25">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Ask SAI…"
                  disabled={busy}
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                />
                <button type="button" onClick={toggleVoice} aria-label={listening ? "Stop voice input" : "Voice input"} title={listening ? "Stop listening" : "Speak to SAI"} className={`rounded-lg p-1.5 transition hover:bg-white dark:hover:bg-white/10 ${listening ? "text-rose-500" : "text-slate-400 hover:text-slate-700 dark:hover:text-white"}`}>
                  <Mic className="h-4 w-4" />
                </button>
                <button type="submit" aria-label="Send" disabled={!text.trim() || busy} className="rounded-lg bg-slate-900 p-1.5 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-[9px] text-slate-400">
                <span>{voiceError || (transcribing ? "Transcribing your voice…" : listening ? "Recording… click the microphone again to stop." : "SAI works in the background.")}</span>
                {online === true && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> connected</span>}
              </div>
            </form>
          </div>
      )}
    </>
  );
}
