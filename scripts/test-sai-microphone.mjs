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

console.log("SAI microphone and speech-input regression tests");
check(source.includes("navigator.mediaDevices?.getUserMedia"), "SAI preflights the real microphone device");
check(source.includes("NotAllowedError"), "Microphone permission denial is distinguished explicitly");
check(source.includes("NotFoundError"), "Missing microphone device is distinguished explicitly");
check(source.includes("NotReadableError"), "Busy/unavailable microphone is distinguished explicitly");
check(source.includes("Chrome has not granted live microphone capture"), "Live capture denial is reported separately from browser site permission");
check(source.includes("Chrome reports the microphone is allowed"), "Speech not-allowed does not falsely claim microphone permission is missing");
check(source.includes('if (language.startsWith("bn")) return "bn-IN"'), "Bengali speech locale is selected");
check(source.includes('if (language.startsWith("hi")) return "hi-IN"'), "Hindi speech locale is selected");
check(source.includes('if (language.startsWith("en")) return "en-IN"'), "Indian English speech locale is selected");
check(source.includes("stream.getTracks().forEach((track) => track.stop())"), "Microphone preflight stream is released cleanly");
check(source.includes('recognition.lang = getSpeechLocale()'), "Speech recognition uses the detected locale");
check(source.includes('errorCode === "audio-capture"'), "Audio capture failures are surfaced separately");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;

check(source.includes("getMicrophonePermissionState"), "SAI checks browser microphone permission state");
check(source.includes('permission === "granted"'), "Granted microphone permission skips duplicate getUserMedia preflight");
check(source.includes("prepareVoiceInput"), "Voice startup uses the permission-aware preparation path");
