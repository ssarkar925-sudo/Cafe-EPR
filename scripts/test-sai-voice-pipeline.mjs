import fs from "node:fs";

const component = fs.readFileSync("components/sai/sai-background-layer.tsx", "utf8");
const route = fs.readFileSync("app/api/sai/transcribe/route.ts", "utf8");
const liveRoute = fs.readFileSync("app/api/sai/live-token/route.ts", "utf8");

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("SAI root voice pipeline regression tests");

check(component.includes("MediaRecorder"), "SAI retains recorded-audio transcription fallback");
check(component.includes("startLiveSpeechRecognition"), "SAI offers live speech recognition while speaking");
check(component.includes("interimResults = true"), "SAI renders partial speech before final recognition");
check(component.includes("speechRecognitionUnavailableRef"), "SAI can fall back when live recognition service is unavailable");
check(component.includes("navigator.mediaDevices?.getUserMedia"), "SAI captures from the actual microphone device");
check(component.includes("echoCancellation"), "Microphone capture enables echo cancellation");
check(component.includes("noiseSuppression"), "Microphone capture enables noise suppression");
check(component.includes("autoGainControl"), "Microphone capture enables automatic gain control");
check(component.includes("MediaRecorder.isTypeSupported"), "Recorder selects a browser-supported audio format");
check(component.includes("/api/sai/transcribe"), "Recorded audio is sent to the server transcription endpoint");
check(component.includes("/api/sai/live-token"), "SAI obtains a short-lived Gemini Live token without exposing the API key");
check(component.includes("interimInputTranscription"), "SAI renders Gemini interim captions while speaking");
check(component.includes("inputTranscription"), "SAI commits Gemini final speech segments");
check(component.includes("audio/pcm;rate=16000"), "Microphone audio is streamed as 16 kHz PCM for Gemini Live");
check(component.includes("audioStreamEnd"), "Stopping voice input cleanly finalizes the Gemini stream");
check(component.includes("Connecting to Gemini live transcription"), "UI reports model connection state");
check(component.includes("Transcribing your voice"), "UI exposes the transcription state");
check(component.includes("recording" ), "Voice UI has an explicit recording state");

check(liveRoute.includes('hasRole(role, ["admin", "manager", "staff"])'), "Gemini Live token endpoint is role-gated");
check(liveRoute.includes("settingsProviderConfigured"), "Live transcription follows the selected AI provider configuration");
check(liveRoute.includes("auth_tokens"), "Gemini Live tokens are issued server-side");
check(liveRoute.includes("liveConnectConstraints"), "Live tokens are constrained to transcription-only model settings");
check(liveRoute.includes("gemini-3.5-transcribe-live"), "Live token is scoped to Gemini's real-time transcription model");
check(liveRoute.includes("uses: 1"), "Gemini Live token is single-use");
check(liveRoute.includes("newSessionExpireTime"), "Gemini Live token has a short session-start window");
check(route.includes("request.formData()"), "Server transcription endpoint accepts multipart audio");
check(route.includes('const provider = activeProvider === "openai" ? "openai" : "gemini";'), "Voice transcription honors the selected provider even when its key is missing");
check(!route.includes("fallbackProvider"), "Gemini voice requests are never silently routed to another provider");
check(route.includes("settingsProviderConfigured"), "Legacy active provider selection is respected when settings JSON is absent");
check(route.includes('file instanceof File'), "Server validates an uploaded audio file");
check(route.includes("MAX_AUDIO_BYTES"), "Server limits audio upload size");
check(route.includes('model: "gemini-3.5-transcribe"'), "Gemini 3.5 Transcribe is wired for server voice transcription");
check(route.includes("upload/v1beta/files"), "Gemini voice uses the Files API for recorded audio");
check(route.includes("/v1beta/interactions"), "Gemini voice uses the Interactions API for transcription");
check(route.includes("language_codes: []"), "Gemini voice enables automatic language detection");
check(route.includes("gpt-4o-mini-transcribe"), "OpenAI transcription fallback is wired");
check(route.includes("No speech was detected"), "Empty transcription is handled explicitly");
check(route.includes('hasRole(role, ["admin", "manager", "staff"])'), "Voice transcription is role-gated");
check(route.includes("x-goog-api-key"), "Gemini API key stays server-side");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
