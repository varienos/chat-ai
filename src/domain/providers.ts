import type { AppConfig } from "../config/env.js";

export const PROVIDER_NAMES = ["codex", "gemini", "claude"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export function isProviderName(value: string): value is ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName);
}

export function getEnabledProviders(config: AppConfig): ProviderName[] {
  return config.providers.enabledProviders;
}
