import { describe, expect, it } from "vitest";
import {
  type ProviderSection,
  type SettingsField,
  type SettingsTab,
  providerSections,
  settingsTabs,
  generalSettings,
  runtimeSettings,
  deckAuthSettings,
} from "../deck/src/data/settings-schema.js";

describe("deck settings schema", () => {
  it("uses only repo-backed tabs and removes fake model/api groupings", () => {
    expect(settingsTabs.map((tab: SettingsTab) => tab.id)).toEqual([
      "general",
      "runtime",
      "providers",
      "deck",
      "widget",
    ]);
  });

  it("exposes only runtime settings that exist in backend config", () => {
    expect(runtimeSettings.map((field: SettingsField) => field.key)).toEqual([
      "chat.systemPrompt",
      "chat.recentMessageLimit",
    ]);
  });

  it("includes real provider configuration fields", () => {
    const keys = providerSections.flatMap((section: ProviderSection) =>
      section.fields.map((field: SettingsField) => field.key),
    );

    expect(keys).toEqual(
      expect.arrayContaining([
        "codex.authMode",
        "codex.model",
        "codex.sandbox",
        "claude.model",
        "claude.permissionMode",
        "claude.includePartialMessages",
        "gemini.model",
        "gemini.approvalMode",
        "gemini.sandbox",
      ]),
    );
  });

  it("does not include misleading UI-only model tuning fields", () => {
    const labels = [
      ...generalSettings,
      ...runtimeSettings,
      ...deckAuthSettings,
      ...providerSections.flatMap((section: ProviderSection) => section.fields),
    ].map((field: SettingsField) => field.label);

    expect(labels).not.toContain("Temperature");
    expect(labels).not.toContain("Max Tokens");
    expect(labels).not.toContain("Top P");
    expect(labels).not.toContain("OpenAI API Key");
    expect(labels).not.toContain("Anthropic API Key");
    expect(labels).not.toContain("Google AI API Key");
    expect(labels).not.toContain("Uygulama Adı");
  });

  it("keeps all displayed fields editable", () => {
    const allFields = [
      ...generalSettings,
      ...runtimeSettings,
      ...deckAuthSettings,
      ...providerSections.flatMap((section) => section.fields),
    ];

    expect(allFields.every((field) => field.editable)).toBe(true);
  });
});
