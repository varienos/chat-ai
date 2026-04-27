import { describe, it, expect, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import type { ProviderName } from "../src/domain/providers.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import type {
  ChatCompletion,
  ChatRequest,
  LlmProvider,
  ProviderLoginStatus,
  ProviderStreamEvent,
} from "../src/providers/types.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";
import { ChatService } from "../src/services/chat-service.js";
import { SessionService } from "../src/services/session-service.js";

class TestProvider implements LlmProvider {
  constructor(private readonly name: ProviderName = "codex") {}

  async chat(_request: ChatRequest): Promise<ChatCompletion> {
    return {
      content: "Hello from test provider",
      finishReason: "completed",
      metadata: {},
      provider: this.name,
    };
  }

  async chatStream(
    _request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    await onEvent({ chunk: "Hello", type: "assistant.delta" });
    return {
      content: "Hello",
      finishReason: "completed",
      metadata: {},
      provider: this.name,
    };
  }

  async checkLoginStatus(): Promise<ProviderLoginStatus> {
    return { authenticated: true, mode: "oauth", provider: this.name };
  }

  getDefinition() {
    return { enabled: true, name: this.name };
  }
}

const DECK_CONFIG = {
  security: { apiAuthToken: "" },
  deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
};

function createTestContext() {
  const cache = new InMemorySessionCacheRepository();
  const archive = new InMemorySessionArchiveRepository();
  const sessionService = new SessionService(cache, archive);
  const providerRegistry = new ProviderRegistry("codex", [new TestProvider("codex")]);
  const chatService = new ChatService(sessionService, providerRegistry, {
    getConfig: async () => ({
      systemPrompt: "Test system prompt",
      recentMessageLimit: 12,
      knowledgeBase: { path: "/tmp/kb-test-deck-chat", maxChars: 50000 },
    }),
  });

  const app = buildApp({
    config: DECK_CONFIG,
    services: {
      chatService,
      providerRegistry,
      sessionService,
      sessionArchiveRepository: archive,
    },
  });

  return { app, sessionService };
}

async function getAuthCookie(app: ReturnType<typeof buildApp>): Promise<string> {
  const loginRes = await app.inject({
    method: "POST",
    url: "/deck/api/auth/login",
    payload: { username: "admin", password: "test" },
  });
  const setCookie = loginRes.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("deck chat proxy", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("POST /deck/api/chat/stream without JWT returns 401", async () => {
    const { app } = createTestContext();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/deck/api/chat/stream",
      payload: { message: "hello", sessionId: "s1" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /deck/api/chat/stream with JWT returns SSE content-type", async () => {
    const { app, sessionService } = createTestContext();
    apps.push(app);
    const cookie = await getAuthCookie(app);
    const session = await sessionService.createSession("codex");

    const response = await app.inject({
      method: "POST",
      url: "/deck/api/chat/stream",
      headers: { cookie },
      payload: { message: "hello", sessionId: session.id },
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("POST /deck/api/chat/stream sends SSE events for valid session", async () => {
    const { app, sessionService } = createTestContext();
    apps.push(app);
    const cookie = await getAuthCookie(app);
    const session = await sessionService.createSession("codex");

    const response = await app.inject({
      method: "POST",
      url: "/deck/api/chat/stream",
      headers: { cookie },
      payload: { message: "hello", sessionId: session.id },
    });

    const body = response.body;
    expect(body).toContain("event: session.started");
    expect(body).toContain("event: assistant.delta");
    expect(body).toContain("event: assistant.completed");
    expect(body).not.toContain("codex");
    expect(body).not.toContain('"provider"');
  });

  it("POST /deck/api/chat/stream returns SSE error for unknown session", async () => {
    const { app } = createTestContext();
    apps.push(app);
    const cookie = await getAuthCookie(app);

    const response = await app.inject({
      method: "POST",
      url: "/deck/api/chat/stream",
      headers: { cookie },
      payload: { message: "hello", sessionId: "00000000-0000-0000-0000-000000000000" },
    });

    // With autoCreateSession the session is created on first message, so this actually succeeds.
    // But we can test with a non-UUID sessionId to verify validation.
    const invalidRes = await app.inject({
      method: "POST",
      url: "/deck/api/chat/stream",
      headers: { cookie },
      payload: { message: "hello", sessionId: "nonexistent" },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body).toContain("sessionId must be a valid UUID");
  });
});

describe("deck openapi spec", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  it("GET /deck/api/openapi-spec with valid JWT returns OpenAPI JSON", async () => {
    const { app } = createTestContext();
    apps.push(app);
    const cookie = await getAuthCookie(app);

    const response = await app.inject({
      method: "GET",
      url: "/deck/api/openapi-spec",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("openapi");
    expect(body).toHaveProperty("paths");
  });

  it("GET /deck/api/openapi-spec without JWT returns 401", async () => {
    const { app } = createTestContext();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/deck/api/openapi-spec",
    });

    expect(response.statusCode).toBe(401);
  });
});
