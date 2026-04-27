import { describe, expect, it } from "vitest";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import type { SessionRecord } from "../src/domain/chat-session.js";

function makeSession(id: string, status: "active" | "completed" | "error", provider = "codex"): SessionRecord {
  return {
    id,
    provider: provider as any,
    status,
    messageCount: 1,
    summary: null,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    visitorMetadata: null,
  };
}

describe("session archive status filter", () => {
  it("filters sessions by status", async () => {
    const repo = new InMemorySessionArchiveRepository();
    await repo.createSession(makeSession("s1", "active"));
    await repo.createSession(makeSession("s2", "completed"));
    await repo.createSession(makeSession("s3", "error"));

    const active = await repo.listSessions({ page: 1, limit: 10, status: "active" });
    expect(active.sessions).toHaveLength(1);
    expect(active.sessions[0].id).toBe("s1");

    const completed = await repo.listSessions({ page: 1, limit: 10, status: "completed" });
    expect(completed.sessions).toHaveLength(1);
    expect(completed.sessions[0].id).toBe("s2");

    const all = await repo.listSessions({ page: 1, limit: 10 });
    expect(all.sessions).toHaveLength(3);
  });

  it("completes idle sessions beyond timeout", async () => {
    const repo = new InMemorySessionArchiveRepository();
    const old = makeSession("s-old", "active");
    old.lastActivityAt = new Date(Date.now() - 3600_000).toISOString();
    const recent = makeSession("s-recent", "active");

    await repo.createSession(old);
    await repo.createSession(recent);

    const transitioned = await repo.completeIdleSessions(1800_000);
    expect(transitioned).toHaveLength(1);
    expect(transitioned[0].id).toBe("s-old");

    const result = await repo.listSessions({ page: 1, limit: 10, status: "completed" });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("s-old");
  });
});
