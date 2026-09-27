import { registerPlugin } from "@capacitor/core";

export interface AepsCollectorPlugin {
  setApiConfig(options: { apiUrl: string; accessToken: string }): Promise<void>;
  clearSession(): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  isEnabled(): Promise<{ enabled: boolean; accessibilityEnabled: boolean }>;
  setPortalPackage(options: { packageName: string; portalCode: string; sourceId?: string; enabled?: boolean }): Promise<{ success: boolean }>;
  getPortalPackages(): Promise<{ packages: { packageName: string; portalCode: string; sourceId?: string }[] }>;
  discoverPortalApps(): Promise<{ apps: { packageName: string; label: string }[] }>;
  openAccessibilitySettings(): Promise<void>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  getStatus(): Promise<{ enabled: boolean; accessibilityEnabled: boolean; lastSync: string; lastError: string; apiConfigured: boolean }>;
}

export const AepsCollector = registerPlugin<AepsCollectorPlugin>("AepsCollector");
