import { describe, expect, it } from "vitest";

import { loadConfig, mergeConfig } from "../src/config/env.js";
import { getEnabledProviders } from "../src/domain/providers.js";

describe("provider config", () => {
  it("returns codex as the default provider", () => {
    const config = loadConfig({});

    expect(config.providers.defaultProvider).toBe("codex");
    expect(getEnabledProviders(config)).toEqual(["codex"]);
  });

  it("parses provider-specific config without changing the codex-first default", () => {
    const config = loadConfig({
      CLAUDE_BINARY_PATH: "claude",
      ENABLED_PROVIDERS: "codex,gemini,claude",
      GEMINI_BINARY_PATH: "gemini",
    });

    expect(config.providers.defaultProvider).toBe("codex");
    expect(getEnabledProviders(config)).toEqual(["codex", "gemini", "claude"]);
    expect((config as any).gemini.binaryPath).toBe("gemini");
    expect((config as any).claude.binaryPath).toBe("claude");
  });

  it("keeps dangerous execution and security-sensitive defaults locked down", () => {
    const config = loadConfig({});

    expect((config as any).codex.enableDangerousBypass).toBe(false);
    expect((config as any).gemini.approvalMode).toBe("plan");
    expect((config as any).claude.permissionMode).toBe("plan");
    expect((config as any).security.apiAuthToken).toBe("");
    expect((config as any).security.requestBodyLimitBytes).toBeGreaterThan(0);
    expect((config as any).security.rateLimitMaxRequests).toBeGreaterThan(0);
  });

  it("parses codex api key auth mode when configured", () => {
    const config = loadConfig({
      CODEX_AUTH_MODE: "api_key",
      OPENAI_API_KEY: "sk-test",
    });

    expect((config as any).codex.authMode).toBe("api_key");
    expect((config as any).codex.apiKey).toBe("sk-test");
  });
});

describe("deck config", () => {
  it("reads DECK_ADMIN_USER with default 'admin'", () => {
    const config = loadConfig({});
    expect(config.deck.adminUser).toBe("admin");
  });

  it("reads DECK_ADMIN_PASSWORD", () => {
    const config = loadConfig({ DECK_ADMIN_PASSWORD: "secret" });
    expect(config.deck.adminPassword).toBe("secret");
  });

  it("reads DECK_JWT_SECRET", () => {
    const config = loadConfig({ DECK_JWT_SECRET: "jwt-secret-123" });
    expect(config.deck.jwtSecret).toBe("jwt-secret-123");
  });

  it("defaults DECK_ADMIN_PASSWORD and DECK_JWT_SECRET to empty string", () => {
    const config = loadConfig({});
    expect(config.deck.adminPassword).toBe("");
    expect(config.deck.jwtSecret).toBe("");
  });

  it("merges deck config overrides via mergeConfig", () => {
    const base = loadConfig({});
    const merged = mergeConfig(base, { deck: { adminUser: "custom" } });
    expect(merged.deck.adminUser).toBe("custom");
    expect(merged.deck.adminPassword).toBe(""); // base default preserved
  });
});
