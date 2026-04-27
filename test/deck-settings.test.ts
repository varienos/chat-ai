import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RuntimeConfigStore, MUTABLE_SETTINGS } from "../src/deck/deck-settings.js";
import { loadConfig } from "../src/config/env.js";
import { buildApp } from "../src/app.js";

function createMockRedis() {
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
  };
}

describe("RuntimeConfigStore", () => {
  it("returns base config when no overrides exist", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base prompt" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("base prompt");
  });

  it("merges redis override into effective config", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base prompt" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "overridden prompt");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("overridden prompt");
  });

  it("validates number type with min/max", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await expect(store.setValue("chat.recentMessageLimit", "0")).rejects.toThrow();
    await expect(store.setValue("chat.recentMessageLimit", "101")).rejects.toThrow();
    await store.setValue("chat.recentMessageLimit", "50");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.recentMessageLimit).toBe(50);
  });

  it("rejects unknown keys", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await expect(store.setValue("unknown.key" as any, "value")).rejects.toThrow();
  });

  it("clears an override to revert to default", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "override");
    await store.clearValue("chat.systemPrompt");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("base");
  });

  it("getOverrides returns only set values", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "custom");
    const overrides = await store.getOverrides();
    expect(overrides).toEqual({ "chat.systemPrompt": "custom" });
  });
});

describe("deck settings routes", () => {
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeEach(() => {
  });

  async function createAppAndLogin() {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
      },
    });
    const loginRes = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "test" },
    });
    const setCookie = loginRes.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    token = raw?.split(";")[0] ?? "";
  }

  afterEach(async () => {
    await app?.close();
  });

  it("GET /deck/api/settings returns all settings with metadata", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "GET",
      url: "/deck/api/settings",
      headers: { cookie: token },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.settings).toBeInstanceOf(Array);

    // Check mutable settings have metadata
    const systemPrompt = body.settings.find((s: any) => s.key === "chat.systemPrompt");
    expect(systemPrompt).toBeDefined();
    expect(systemPrompt.mutable).toBe(true);
    expect(systemPrompt.type).toBe("string");

    const recentMessageLimit = body.settings.find((s: any) => s.key === "chat.recentMessageLimit");
    expect(recentMessageLimit).toBeDefined();
    expect(recentMessageLimit.mutable).toBe(true);
    expect(recentMessageLimit.type).toBe("number");
    expect(recentMessageLimit.min).toBe(1);
    expect(recentMessageLimit.max).toBe(100);

    // Check read-only settings are included
    const port = body.settings.find((s: any) => s.key === "server.port");
    expect(port).toBeDefined();
    expect(port.mutable).toBe(false);

    const host = body.settings.find((s: any) => s.key === "server.host");
    expect(host).toBeDefined();
    expect(host.mutable).toBe(false);
  });

  it("GET /deck/api/settings without JWT returns 401", async () => {
    await createAppAndLogin();
    const res = await app.inject({ method: "GET", url: "/deck/api/settings" });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH /deck/api/settings updates mutable setting", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/deck/api/settings",
      headers: { cookie: token },
      payload: { "chat.systemPrompt": "updated prompt" },
    });
    expect(res.statusCode).toBe(200);

    // Verify it persisted
    const getRes = await app.inject({
      method: "GET",
      url: "/deck/api/settings",
      headers: { cookie: token },
    });
    const settings = JSON.parse(getRes.body).settings;
    const sp = settings.find((s: any) => s.key === "chat.systemPrompt");
    expect(sp.value).toBe("updated prompt");
  });

  it("PATCH /deck/api/settings rejects unknown key", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/deck/api/settings",
      headers: { cookie: token },
      payload: { "unknown.key": "value" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /deck/api/settings rejects invalid number", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/deck/api/settings",
      headers: { cookie: token },
      payload: { "chat.recentMessageLimit": "0" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH /deck/api/settings without JWT returns 401", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/deck/api/settings",
      payload: { "chat.systemPrompt": "new" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("PATCH /deck/api/settings returns updated values on success", async () => {
    await createAppAndLogin();
    const res = await app.inject({
      method: "PATCH",
      url: "/deck/api/settings",
      headers: { cookie: token },
      payload: { "chat.systemPrompt": "new prompt", "chat.recentMessageLimit": "25" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.updated).toBeDefined();
    expect(body.updated["chat.systemPrompt"]).toBe("new prompt");
    expect(body.updated["chat.recentMessageLimit"]).toBe("25");
  });
});
