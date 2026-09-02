"use client";

// Canonical public name for the system-settings workspace.
// Keep the existing SettingsClient implementation and stateful settings
// behavior intact while removing the duplicate user-facing implementation.
export { default } from "@/components/settings/settings-client";
