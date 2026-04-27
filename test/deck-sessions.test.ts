import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";

describe("SessionArchiveRepository deck extensions", () => {
  let repo: InMemorySessionArchiveRepository;

  beforeEach(async () => {
    repo = new InMemorySessionArchiveRepository();
    await repo.createSession({ id: "s1", provider: "codex", status: "active", createdAt: "2026-03-10T00:00:00.000Z", lastActivityAt: "2026-03-13T00:00:00.000Z", messageCount: 5, summary: null, visitorMetadata: null });
    await repo.createSession({ id: "s2", provider: "claude", status: "active", createdAt: "2026-03-12T00:00:00.000Z", lastActivityAt: "2026-03-12T00:00:00.000Z", messageCount: 3, summary: null, visitorMetadata: null });
    await repo.appendMessage({ id: "m1", sessionId: "s1", role: "user", content: "hello docker", provider: "codex", createdAt: "2026-03-13T10:00:00.000Z", metadata: {} });
    await repo.appendMessage({ id: "m2", sessionId: "s1", role: "assistant", content: "Docker help", provider: "codex", latencyMs: 1500, createdAt: "2026-03-13T10:00:01.500Z", metadata: {} });
  });

  describe("listSessions", () => {
    it("returns paginated sessions", async () => {
      const result = await repo.listSessions({ page: 1, limit: 10 });
      expect(result.total).toBe(2);
      expect(result.sessions).toHaveLength(2);
    });

    it("filters by provider", async () => {
      const result = await repo.listSessions({ provider: "codex", page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("filters by date range", async () => {
      const result = await repo.listSessions({ from: new Date("2026-03-11"), to: new Date("2026-03-13"), page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s2");
    });

    it("searches message content", async () => {
      const result = await repo.listSessions({ search: "docker", page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("sorts by message_count ascending", async () => {
      const result = await repo.listSessions({ sortBy: "message_count", sortOrder: "asc", page: 1, limit: 10 });
      expect(result.sessions[0].id).toBe("s2");
      expect(result.sessions[1].id).toBe("s1");
    });
  });

  describe("getSessionWithMessages", () => {
    it("returns session with all messages", async () => {
      const result = await repo.getSessionWithMessages("s1");
      expect(result).not.toBeNull();
      expect(result!.session.id).toBe("s1");
      expect(result!.messages).toHaveLength(2);
    });

    it("returns null for unknown session", async () => {
      expect(await repo.getSessionWithMessages("unknown")).toBeNull();
    });
  });

  describe("getSessionStats", () => {
    it("returns per-provider statistics", async () => {
      const stats = await repo.getSessionStats();
      expect(stats.byProvider.codex).toBeDefined();
      expect(stats.byProvider.codex!.totalSessions).toBe(1);
      expect(stats.byProvider.codex!.totalMessages).toBe(2);
      expect(stats.byProvider.gemini).toBeUndefined();
    });

    it("returns daily volume", async () => {
      const stats = await repo.getSessionStats();
      expect(stats.dailyVolume).toBeInstanceOf(Array);
      expect(stats.dailyVolume.length).toBeGreaterThan(0);
      expect(stats.dailyVolume[0]).toHaveProperty("date");
      expect(stats.dailyVolume[0]).toHaveProperty("provider");
      expect(stats.dailyVolume[0]).toHaveProperty("count");
    });
  });
});

describe("deck session routes", () => {
  let app: ReturnType<typeof buildApp>;
  let token: string;
  let archiveRepo: InMemorySessionArchiveRepository;

  beforeEach(async () => {
    archiveRepo = new InMemorySessionArchiveRepository();
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
      },
      services: {
        sessionArchiveRepository: archiveRepo,
      },
    });

    // Login to get auth cookie
    const loginRes = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "test" },
    });
    const setCookie = loginRes.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    token = raw?.split(";")[0] ?? "";

    // Seed test data
    await archiveRepo.createSession({
      id: "s1",
      provider: "codex",
      status: "active",
      createdAt: "2026-03-10T00:00:00.000Z",
      lastActivityAt: "2026-03-13T00:00:00.000Z",
      messageCount: 5,
      summary: null,
      visitorMetadata: null,
    });
    await archiveRepo.createSession({
      id: "s2",
      provider: "claude",
      status: "active",
      createdAt: "2026-03-12T00:00:00.000Z",
      lastActivityAt: "2026-03-12T00:00:00.000Z",
      messageCount: 3,
      summary: null,
      visitorMetadata: null,
    });
    await archiveRepo.appendMessage({
      id: "m1",
      sessionId: "s1",
      role: "user",
      content: "hello docker",
      provider: "codex",
      createdAt: "2026-03-13T10:00:00.000Z",
      metadata: {},
    });
    await archiveRepo.appendMessage({
      id: "m2",
      sessionId: "s1",
      role: "assistant",
      content: "Docker help",
      provider: "codex",
      latencyMs: 1500,
      createdAt: "2026-03-13T10:00:01.500Z",
      metadata: {},
    });
  });

  afterEach(async () => {
    await app?.close();
  });

  describe("GET /deck/api/sessions", () => {
    it("returns paginated session list", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
    });

    it("filters by provider query param", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions?provider=codex",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe("s1");
    });

    it("supports search query param", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions?search=docker",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe("s1");
    });

    it("supports pagination params", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions?page=1&limit=1",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions).toHaveLength(1);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(1);
    });

    it("returns 401 without JWT", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /deck/api/sessions/stats", () => {
    it("returns session stats", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/stats",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.byProvider).toBeDefined();
      expect(body.byProvider.codex).toBeDefined();
      expect(body.byProvider.codex.totalSessions).toBe(1);
      expect(body.dailyVolume).toBeInstanceOf(Array);
    });

    it("supports date range filtering", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/stats?from=2026-03-12T00:00:00.000Z&to=2026-03-14T00:00:00.000Z",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.byProvider).toBeDefined();
    });

    it("returns 401 without JWT", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/stats",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /deck/api/sessions/:id", () => {
    it("returns session with messages", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/s1",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.session.id).toBe("s1");
      expect(body.messages).toHaveLength(2);
    });

    it("returns 404 for unknown session", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/nonexistent",
        headers: { cookie: token },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.message).toBe("Session not found");
    });

    it("returns 401 without JWT", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/deck/api/sessions/s1",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
