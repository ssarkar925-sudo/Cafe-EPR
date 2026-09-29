import fs from "node:fs";

const source = fs.readFileSync("components/sai/sai-background-layer.tsx", "utf8");
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

console.log("SAI microphone capture regression tests");
check(source.includes("MediaRecorder"), "SAI uses MediaRecorder for microphone capture");
check(source.includes("navigator.mediaDevices?.getUserMedia"), "SAI captures from the actual microphone device");
check(source.includes("echoCancellation"), "Microphone capture enables echo cancellation");
check(source.includes("noiseSuppression"), "Microphone capture enables noise suppression");
check(source.includes("autoGainControl"), "Microphone capture enables automatic gain control");
check(source.includes("MediaRecorder.isTypeSupported"), "Recorder selects a browser-supported MIME type");
check(source.includes("/api/sai/transcribe"), "Recorded audio is sent to server transcription");
check(source.includes("transcribing"), "UI has an explicit transcription state");
check(!source.includes("SpeechRecognition"), "SAI no longer depends on browser SpeechRecognition");
check(!source.includes("webkitSpeechRecognition"), "SAI no longer depends on WebKit SpeechRecognition");
check(source.includes("getUserMedia"), "Voice input is grounded in real browser media capture");
check(source.includes("recording"), "Voice flow exposes a recording state");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
