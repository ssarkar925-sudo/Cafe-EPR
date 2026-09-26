"use client";

import SettingsHubClient from "@/components/settings/settings-hub-client";

export type PublicSettingsProps = Record<string, any>;

export default function SystemSettingsClient(props?: PublicSettingsProps) {
  return <SettingsHubClient />;
}
