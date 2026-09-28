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
  const recognitionRef = useRef<any>(null);
  const voiceTranscriptRef = useRef("");
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
      recognitionRef.current?.abort?.();
    };
  }, []);

  function getSpeechLocale(): string {
    const language = String(navigator.language || "").toLowerCase();
    if (language.startsWith("bn")) return "bn-IN";
    if (language.startsWith("hi")) return "hi-IN";
    if (language.startsWith("en")) return "en-IN";
    return navigator.language || "en-IN";
  }

  async function getMicrophonePermissionState(): Promise<"granted" | "prompt" | "denied" | "unknown"> {
    try {
      const permissions = (navigator as any).permissions;
      if (!permissions?.query) return "unknown";
      const status = await permissions.query({ name: "microphone" });
      return status?.state === "granted" || status?.state === "prompt" || status?.state === "denied"
        ? status.state
        : "unknown";
    } catch {
      return "unknown";
    }
  }

  async function requestMicrophoneWhenNeeded(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Microphone access is not available in this browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setVoiceError("");
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") {
        setVoiceError("Chrome has not granted live microphone capture to SAI. Recheck the site microphone setting.");
      } else if (name === "NotFoundError") {
        setVoiceError("No microphone device was found.");
      } else if (name === "NotReadableError") {
        setVoiceError("Microphone is busy or unavailable. Close another app using it and try again.");
      } else if (name === "SecurityError") {
        setVoiceError("Microphone access is blocked by the browser security policy.");
      } else {
        setVoiceError("Unable to access the microphone.");
      }
      return false;
    }
  }

  async function prepareVoiceInput(): Promise<boolean> {
    const permission = await getMicrophonePermissionState();

    // When Chrome already reports "granted", do not run a second getUserMedia
    // preflight. SpeechRecognition can own the microphone capture itself, and
    // some Chromium/OS combinations reject the parallel media request even
    // though the site permission is already granted.
    if (permission === "granted") {
      setVoiceError("");
      return true;
    }

    if (permission === "denied") {
      setVoiceError("Microphone permission is blocked for this site in Chrome.");
      return false;
    }

    // "prompt" or an unavailable Permissions API: request the microphone once
    // from the user gesture, then let SpeechRecognition take over.
    return requestMicrophoneWhenNeeded();
  }

  async function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }

    const Recognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceError("Voice input is not supported in this browser.");
      return;
    }

    setVoiceError("");
    const micReady = await prepareVoiceInput();
    if (!micReady) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = getSpeechLocale();

    recognition.onstart = () => {
      setVoiceError("");
      setListening(true);
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript || "")
        .join("")
        .trim();
      if (transcript) {
        voiceTranscriptRef.current = transcript;
        setText(transcript);
      }
    };
    recognition.onerror = (event: any) => {
      setListening(false);
      if (event?.error === "aborted") return;

      const errorCode = String(event?.error || "");
      setVoiceError(
        errorCode === "not-allowed"
          ? "Chrome reports the microphone is allowed, but speech recognition is unavailable. Try again after closing other voice apps."
          : errorCode === "no-speech"
            ? "I could not hear speech. Please speak again."
            : errorCode === "audio-capture"
              ? "The microphone could not be opened. Check the selected input device."
              : "I could not hear that. Please try again.",
      );
    };
    recognition.onend = () => {
      setListening(false);
      const transcript = voiceTranscriptRef.current.trim();
      voiceTranscriptRef.current = "";
      if (transcript) void askPrompt(transcript);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setListening(false);
      setVoiceError("Voice recognition could not start. Please try again.");
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
        body: JSON.stringify({ message: prompt, surface: "global", context: { path: window.location.pathname } }),
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
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="SAI">
          <button aria-label="Close SAI" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/10 backdrop-blur-[1px] dark:bg-black/30" />
          <div className="absolute bottom-20 right-4 w-[min(430px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/98 shadow-[0_24px_80px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-slate-950/98 sm:bottom-20 sm:right-6">
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
                <span>{voiceError || (listening ? "Listening… speak naturally." : "SAI works in the background.")}</span>
                {online === true && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> connected</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
