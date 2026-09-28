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
check(source.includes("SpeechRecognition") || source.includes("webkitSpeechRecognition"), "SAI uses browser speech recognition");
check(source.includes('recognition.start()'), "Voice input starts recognition directly from the user action");
check(!source.includes("getMicrophonePermissionState"), "SAI does not gate voice on the Permissions API state");
check(!source.includes("prepareVoiceInput"), "Voice startup has no redundant microphone preflight gate");
check(source.includes("Chrome allowed the microphone, but speech recognition was rejected"), "Speech rejection does not falsely claim microphone permission is blocked");
check(source.includes('errorCode === "audio-capture"'), "Audio capture failures are surfaced separately");
check(source.includes('if (language.startsWith("bn")) return "bn-IN"'), "Bengali speech locale is supported");
check(source.includes('if (language.startsWith("hi")) return "hi-IN"'), "Hindi speech locale is supported");
check(source.includes('if (language.startsWith("en")) return "en-IN"'), "Indian English speech locale is supported");
check(source.includes('recognition.lang = getSpeechLocale()'), "Speech recognition uses the selected locale");
check(source.includes("recognition.onerror"), "Recognition errors are surfaced to the user");
check(source.includes("recognition.onresult"), "Recognition transcripts are captured");

console.log(`\n${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
