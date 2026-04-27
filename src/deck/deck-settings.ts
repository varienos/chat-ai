import type { AppConfig } from "../config/env.js";
import type { RedisClient } from "../lib/redis.js";

/** Read-only settings exposed alongside mutable ones in the GET response. */
const READ_ONLY_SETTINGS: readonly { key: string; configPath: [keyof AppConfig, string] }[] = [
  { key: "server.port", configPath: ["server", "port"] },
  { key: "server.host", configPath: ["server", "host"] },
  { key: "storage.databaseUrl", configPath: ["storage", "databaseUrl"] },
  { key: "storage.redisUrl", configPath: ["storage", "redisUrl"] },
  { key: "codex.binaryPath", configPath: ["codex", "binaryPath"] },
  { key: "codex.workingDirectory", configPath: ["codex", "workingDirectory"] },
  { key: "codex.enableDangerousBypass", configPath: ["codex", "enableDangerousBypass"] },
  { key: "claude.binaryPath", configPath: ["claude", "binaryPath"] },
  { key: "claude.workingDirectory", configPath: ["claude", "workingDirectory"] },
  { key: "gemini.binaryPath", configPath: ["gemini", "binaryPath"] },
  { key: "gemini.workingDirectory", configPath: ["gemini", "workingDirectory"] },
  { key: "deck.adminUser", configPath: ["deck", "adminUser"] },
  { key: "deck.adminPassword", configPath: ["deck", "adminPassword"] },
  { key: "deck.jwtSecret", configPath: ["deck", "jwtSecret"] },
];

export interface SettingEntry {
  key: string;
  value: unknown;
  mutable: boolean;
  type?: string;
  min?: number;
  max?: number;
}

/** Build the full settings list for the GET endpoint. */
export function buildSettingsList(config: AppConfig): SettingEntry[] {
  const settings: SettingEntry[] = [];

  // Mutable settings with metadata
  for (const [dotKey, meta] of Object.entries(MUTABLE_SETTINGS)) {
    const [section, field] = dotKey.split(".") as [keyof AppConfig, string];
    const rawValue = (config[section] as Record<string, unknown>)[field];
    const value = "sensitive" in meta && meta.sensitive ? "********" : rawValue;
    const entry: SettingEntry = { key: dotKey, value, mutable: true, type: meta.type };
    if ("min" in meta && typeof meta.min === "number") entry.min = meta.min;
    if ("max" in meta && typeof meta.max === "number") entry.max = meta.max;
    settings.push(entry);
  }

  // Read-only settings
  for (const ro of READ_ONLY_SETTINGS) {
    const [section, field] = ro.configPath;
    let value = (config[section] as Record<string, unknown>)[field];
    if (typeof value === "string" && (ro.key.includes("Url") || ro.key.includes("url"))) {
      value = maskUrlCredentials(value);
    }
    const SENSITIVE_RO_KEYS = new Set(["deck.adminPassword", "deck.jwtSecret"]);
    if (SENSITIVE_RO_KEYS.has(ro.key)) {
      value = "********";
    }
    settings.push({ key: ro.key, value, mutable: false });
  }

  return settings;
}

/**
 * Create an in-memory mock Redis client.
 * Used by buildApp() for the test path where no real Redis is available.
 */
export function createInMemoryRedis(): RedisClient {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    del: async (key: string) => { store.delete(key); },
    keys: async (pattern: string) => {
      const prefix = pattern.replace("*", "");
      return [...store.keys()].filter(k => k.startsWith(prefix));
    },
    mGet: async (keys: string[]) => keys.map(k => store.get(k) ?? null),
  } as unknown as RedisClient;
}

/** Redact userinfo (user:password@) from a connection URL. */
function maskUrlCredentials(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "<invalid URL>";
  }
}

export const MUTABLE_SETTINGS = {
  // ── Chat ──
  "chat.systemPrompt":       { redisKey: "deck:settings:chat.systemPrompt",       type: "string" as const },
  "chat.recentMessageLimit": { redisKey: "deck:settings:chat.recentMessageLimit", type: "number" as const, min: 1, max: 100 },
  // ── General ──
  "providers.defaultProvider":       { redisKey: "deck:settings:providers.defaultProvider",       type: "string" as const, allowedValues: ["codex", "claude", "gemini"] as readonly string[] },
  "providers.enabledProviders":      { redisKey: "deck:settings:providers.enabledProviders",      type: "string" as const },
  "logging.level":                   { redisKey: "deck:settings:logging.level",                   type: "string" as const, allowedValues: ["info", "debug", "warn", "error"] as readonly string[] },
  "security.rateLimitMaxRequests":   { redisKey: "deck:settings:security.rateLimitMaxRequests",   type: "number" as const, min: 1 },
  "security.rateLimitWindowMs":      { redisKey: "deck:settings:security.rateLimitWindowMs",      type: "number" as const, min: 1000 },
  "security.requestBodyLimitBytes":  { redisKey: "deck:settings:security.requestBodyLimitBytes",  type: "number" as const, min: 1024 },
  // ── Codex ──
  "codex.authMode":              { redisKey: "deck:settings:codex.authMode",              type: "string" as const, allowedValues: ["oauth", "api_key"] as readonly string[] },
  "codex.apiKey":                { redisKey: "deck:settings:codex.apiKey",                type: "string" as const, sensitive: true },
  "codex.model":                 { redisKey: "deck:settings:codex.model",                 type: "string" as const },
  "codex.sandbox":               { redisKey: "deck:settings:codex.sandbox",               type: "string" as const, allowedValues: ["read-only", "workspace-write"] as readonly string[] },
  "codex.skipGitRepoCheck":      { redisKey: "deck:settings:codex.skipGitRepoCheck",      type: "boolean" as const },
  "codex.timeoutMs":             { redisKey: "deck:settings:codex.timeoutMs",             type: "number" as const, min: 1000 },
  // ── Claude ──
  "claude.model":                  { redisKey: "deck:settings:claude.model",                  type: "string" as const },
  "claude.permissionMode":         { redisKey: "deck:settings:claude.permissionMode",         type: "string" as const, allowedValues: ["plan", "default", "auto", "dontAsk", "acceptEdits", "bypassPermissions"] as readonly string[] },
  "claude.includePartialMessages": { redisKey: "deck:settings:claude.includePartialMessages", type: "boolean" as const },
  "claude.timeoutMs":              { redisKey: "deck:settings:claude.timeoutMs",              type: "number" as const, min: 1000 },
  // ── Gemini ──
  "gemini.model":            { redisKey: "deck:settings:gemini.model",            type: "string" as const },
  "gemini.approvalMode":     { redisKey: "deck:settings:gemini.approvalMode",     type: "string" as const, allowedValues: ["plan", "default", "auto_edit", "yolo"] as readonly string[] },
  "gemini.sandbox":          { redisKey: "deck:settings:gemini.sandbox",          type: "boolean" as const },
  "gemini.timeoutMs":        { redisKey: "deck:settings:gemini.timeoutMs",        type: "number" as const, min: 1000 },
  // ── Widget ──
  "widget.enabled":        { redisKey: "deck:settings:widget.enabled",        type: "boolean" as const },
  "widget.title":          { redisKey: "deck:settings:widget.title",          type: "string" as const },
  "widget.subtitle":       { redisKey: "deck:settings:widget.subtitle",       type: "string" as const },
  "widget.welcomeMessage": { redisKey: "deck:settings:widget.welcomeMessage", type: "string" as const },
  "widget.primaryColor":   { redisKey: "deck:settings:widget.primaryColor",   type: "string" as const },
  "widget.position":       { redisKey: "deck:settings:widget.position",       type: "string" as const, allowedValues: ["bottom-right", "bottom-left"] as readonly string[] },
  "widget.theme":          { redisKey: "deck:settings:widget.theme",          type: "string" as const, allowedValues: ["light", "dark"] as readonly string[] },
  "widget.fabIconUrl":     { redisKey: "deck:settings:widget.fabIconUrl",     type: "string" as const },
} as const;

export type MutableSettingKey = keyof typeof MUTABLE_SETTINGS;

export class RuntimeConfigStore {
  constructor(
    private redis: RedisClient,
    private baseConfig: AppConfig,
  ) {}

  async getEffectiveConfig(): Promise<AppConfig> {
    const overrides = await this.getOverrides();
    const config = structuredClone(this.baseConfig);

    for (const [dotKey, value] of Object.entries(overrides)) {
      const meta = MUTABLE_SETTINGS[dotKey as MutableSettingKey];
      const [section, field] = dotKey.split(".") as [keyof AppConfig, string];
      const target = config[section] as Record<string, unknown>;
      target[field] = meta.type === "number" ? Number(value)
                    : meta.type === "boolean" ? value === "true"
                    : value;
    }

    return config;
  }

  /** Validate a value without writing to Redis. Throws on invalid input. Returns warnings (if any). */
  validateValue(key: MutableSettingKey, value: string): string[] {
    const meta = MUTABLE_SETTINGS[key];
    if (!meta) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    const warnings: string[] = [];

    if (meta.type === "number") {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error(`Value for "${key}" must be a valid number, got: ${value}`);
      }
      if ("min" in meta && typeof meta.min === "number" && num < meta.min) {
        throw new Error(`Value for "${key}" must be >= ${meta.min}, got: ${num}`);
      }
      if ("max" in meta && typeof meta.max === "number" && num > meta.max) {
        throw new Error(`Value for "${key}" must be <= ${meta.max}, got: ${num}`);
      }
    }

    if (meta.type === "boolean" && value !== "true" && value !== "false") {
      throw new Error(`Value for "${key}" must be "true" or "false", got: ${value}`);
    }

    if ("allowedValues" in meta && meta.allowedValues && !meta.allowedValues.includes(value)) {
      throw new Error(`Value for "${key}" must be one of: ${meta.allowedValues.join(", ")}, got: ${value}`);
    }

    if ("minLength" in meta && typeof meta.minLength === "number" && value.length < meta.minLength) {
      throw new Error(`Value for "${key}" must be at least ${meta.minLength} characters`);
    }

    return warnings;
  }

  async setValue(key: MutableSettingKey, value: string): Promise<string[]> {
    const warnings = this.validateValue(key, value);
    const meta = MUTABLE_SETTINGS[key];
    await this.redis.set(meta.redisKey, value);
    return warnings;
  }

  async getOverrides(): Promise<Partial<Record<MutableSettingKey, string>>> {
    const mutableEntries = Object.entries(MUTABLE_SETTINGS) as [MutableSettingKey, (typeof MUTABLE_SETTINGS)[MutableSettingKey]][];
    const redisKeys = mutableEntries.map(([, meta]) => meta.redisKey);
    const values = await this.redis.mGet(redisKeys);
    const result: Partial<Record<MutableSettingKey, string>> = {};

    for (let i = 0; i < mutableEntries.length; i++) {
      const val = values[i];
      if (val === null) continue;
      result[mutableEntries[i][0]] = val;
    }

    return result;
  }

  async clearValue(key: MutableSettingKey): Promise<void> {
    const meta = MUTABLE_SETTINGS[key];
    if (!meta) {
      throw new Error(`Unknown setting key: ${key}`);
    }
    await this.redis.del(meta.redisKey);
  }
}
