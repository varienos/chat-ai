import { describe, expect, it } from "vitest";

import { RedisSessionCacheRepository } from "../src/repositories/session-cache-repository.js";

class FakeRedisClient {
  private readonly hashes = new Map<string, Record<string, string>>();
  private readonly sets = new Map<string, Set<string>>();

  async get(key: string) {
    return this.hashes.get(`string:${key}`)?.value ?? null;
  }

  async hGetAll(key: string) {
    return { ...(this.hashes.get(key) ?? {}) };
  }

  async hSet(key: string, value: Record<string, string>) {
    const current = this.hashes.get(key) ?? {};
    this.hashes.set(key, {
      ...current,
      ...value,
    });
  }

  async keys() {
    throw new Error("KEYS should not be called for active session counting");
  }

  async lRange() {
    return [];
  }

  async rPush() {}

  async sAdd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(member);
    this.sets.set(key, set);
  }

  async sCard(key: string) {
    return this.sets.get(key)?.size ?? 0;
  }

  async sRem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
  }

  async set(key: string, value: string) {
    this.hashes.set(`string:${key}`, {
      value,
    });
  }
}

describe("RedisSessionCacheRepository", () => {
  it("counts active sessions from provider indexes without scanning all session keys", async () => {
    const client = new FakeRedisClient();
    const repository = new RedisSessionCacheRepository(client as never);

    await repository.createSession({
      createdAt: "2026-03-13T10:00:00.000Z",
      id: "session-codex-1",
      lastActivityAt: "2026-03-13T10:00:00.000Z",
      messageCount: 0,
      provider: "codex",
      status: "active",
      summary: null,
      visitorMetadata: null,
    });
    await repository.createSession({
      createdAt: "2026-03-13T10:00:01.000Z",
      id: "session-codex-2",
      lastActivityAt: "2026-03-13T10:00:01.000Z",
      messageCount: 0,
      provider: "codex",
      status: "active",
      summary: null,
      visitorMetadata: null,
    });
    await repository.createSession({
      createdAt: "2026-03-13T10:00:02.000Z",
      id: "session-gemini-1",
      lastActivityAt: "2026-03-13T10:00:02.000Z",
      messageCount: 0,
      provider: "gemini",
      status: "active",
      summary: null,
      visitorMetadata: null,
    });

    const counts = await repository.countActiveSessionsByProvider([
      "codex",
      "gemini",
      "claude",
    ]);

    expect(counts).toEqual({
      claude: 0,
      codex: 2,
      gemini: 1,
    });
  });

  it("keeps provider counts stable when active sessions are updated", async () => {
    const client = new FakeRedisClient();
    const repository = new RedisSessionCacheRepository(client as never);
    const session = {
      createdAt: "2026-03-13T10:00:00.000Z",
      id: "session-codex-1",
      lastActivityAt: "2026-03-13T10:00:00.000Z",
      messageCount: 0,
      provider: "codex" as const,
      status: "active" as const,
      summary: null,
      visitorMetadata: null,
    };

    await repository.createSession(session);
    await repository.updateSession({
      ...session,
      lastActivityAt: "2026-03-13T10:05:00.000Z",
      messageCount: 2,
      summary: "Updated summary",
    });

    const counts = await repository.countActiveSessionsByProvider(["codex"]);

    expect(counts).toEqual({
      codex: 1,
    });
  });
});
