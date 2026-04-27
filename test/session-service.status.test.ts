import { describe, expect, it } from "vitest";
import { SessionService } from "../src/services/session-service.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";

function createService() {
  const archive = new InMemorySessionArchiveRepository();
  const cache = new InMemorySessionCacheRepository();
  const service = new SessionService(cache, archive);
  return { service, archive, cache };
}

describe("session status transitions", () => {
  it("transitions active to error", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");
    expect(session.status).toBe("active");

    await service.updateSessionStatus(session.id, "error");
    const updated = await service.getSession(session.id);
    expect(updated!.status).toBe("error");
  });

  it("transitions active to completed", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");

    await service.updateSessionStatus(session.id, "completed");
    const updated = await service.getSession(session.id);
    expect(updated!.status).toBe("completed");
  });

  it("rejects transition from terminal state", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");
    await service.updateSessionStatus(session.id, "completed");

    await expect(service.updateSessionStatus(session.id, "active"))
      .rejects.toThrow("Session is no longer active");
  });

  it("completeIdleSessions transitions idle sessions", async () => {
    const { service, archive } = createService();
    const session = await service.createSession("codex");

    // Backdate lastActivityAt
    const stored = await archive.getSessionWithMessages(session.id);
    if (stored) {
      stored.session.lastActivityAt = new Date(Date.now() - 3600_000).toISOString();
      await archive.updateSession(stored.session);
    }

    const count = await service.completeIdleSessions(1800_000);
    expect(count).toBe(1);

    const updated = await service.getSession(session.id);
    expect(updated!.status).toBe("completed");
  });
});
