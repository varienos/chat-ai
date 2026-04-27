import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { ProviderName } from "../src/domain/providers.js";
import { FatalProviderError, RateLimitError } from "../src/errors.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import type {
  ChatCompletion,
  ChatRequest,
  LlmProvider,
  ProviderLoginStatus,
  ProviderStreamEvent,
} from "../src/providers/types.js";
import {
  InMemorySessionArchiveRepository,
  type InMemorySessionArchiveRepository as ArchiveRepo,
} from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";
import { ChatService } from "../src/services/chat-service.js";
import { SessionService } from "../src/services/session-service.js";
import { buildAuthHeaders } from "./support/auth.js";

class TestProvider implements LlmProvider {
  constructor(private readonly name: ProviderName = "codex") {}

  async chat(_request: ChatRequest): Promise<ChatCompletion> {
    return {
      content: "Merhaba, sureci analiz ve teklif adimlariyla baslatiriz.",
      finishReason: "completed",
      metadata: {},
      provider: this.name,
    };
  }

  async chatStream(
    _request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    await onEvent({
      chunk: "Merhaba",
      type: "assistant.delta",
    });

    return {
      content: "Merhaba",
      finishReason: "completed",
      metadata: {},
      provider: this.name,
    };
  }

  async checkLoginStatus(): Promise<ProviderLoginStatus> {
    return {
      authenticated: true,
      mode: "oauth",
      provider: this.name,
    };
  }

  getDefinition() {
    return {
      enabled: true,
      name: this.name,
    };
  }
}

class ExplodingProvider extends TestProvider {
  constructor(
    name: ProviderName,
    private readonly error: Error,
  ) {
    super(name);
  }

  override async chat(_request: ChatRequest): Promise<ChatCompletion> {
    throw this.error;
  }
}

describe("chat routes", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  function createTestContext(codexProvider: LlmProvider = new TestProvider("codex")) {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const sessionService = new SessionService(cache, archive);
    const providerRegistry = new ProviderRegistry("codex", [
      codexProvider,
      new TestProvider("gemini"),
      new TestProvider("claude"),
    ]);
    const chatService = new ChatService(sessionService, providerRegistry, {
      getConfig: async () => ({
        systemPrompt: "You answer questions about mobile app development projects.",
        recentMessageLimit: 12,
        knowledgeBase: { path: "/tmp/kb-test-routes-chat", maxChars: 50000 },
      }),
    });

    return {
      app: buildApp({
        services: {
          chatService,
          providerRegistry,
          sessionService,
        },
      }),
      archive,
      sessionService,
    };
  }

  it("handles POST /api/chat and persists the turn", async () => {
    const context = createTestContext();
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Mobil uygulama yaptirmak istiyorum.",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: session.id,
    });
    expect(response.body).not.toContain("codex");
    expect(response.body).not.toContain('"provider"');
    expect(context.archive.messages).toHaveLength(2);
  });

  it("handles POST /api/chat/stream over SSE", async () => {
    const context = createTestContext();
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Surec nasil isliyor?",
        sessionId: session.id,
      },
      url: "/api/chat/stream",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("event: session.started");
    expect(response.body).toContain("event: assistant.delta");
    expect(response.body).toContain("event: assistant.completed");
    expect(response.body).not.toContain("codex");
    expect(response.body).not.toContain('"provider"');
  });

  it("reports provider login status", async () => {
    const context = createTestContext();
    apps.push(context.app);

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      url: "/api/providers/codex/login-status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      authenticated: true,
      mode: "oauth",
      provider: "codex",
    });
  });

  it("uses Gemini on the same chat route when provider override is sent", async () => {
    const context = createTestContext();
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Mobil uygulama teklif surecini ozetle.",
        provider: "gemini",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: session.id,
    });
    expect(response.body).not.toContain("gemini");
    expect(response.body).not.toContain('"provider"');
  });

  it("uses Claude on the same streaming route when provider override is sent", async () => {
    const context = createTestContext();
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Sureci kisa anlat.",
        provider: "claude",
        sessionId: session.id,
      },
      url: "/api/chat/stream",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("claude");
    expect(response.body).not.toContain('"provider"');
  });

  it("returns 400 for invalid chat payloads", async () => {
    const context = createTestContext();
    apps.push(context.app);

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {},
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "body must have required property 'message'",
    });
  });

  it("returns 400 for invalid streaming chat payloads", async () => {
    const context = createTestContext();
    apps.push(context.app);

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {},
      url: "/api/chat/stream",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "body must have required property 'message'",
    });
  });

  it("does not expose raw internal error messages on unexpected 500 responses", async () => {
    const context = createTestContext(
      new ExplodingProvider(
        "codex",
        new Error("Provider crashed while reading OPENAI_API_KEY=sk-test-secret"),
      ),
    );
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Bir hata durumunu dene.",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      message: "Internal server error",
    });
  });

  it("does not expose provider details in provider-facing errors", async () => {
    const context = createTestContext(
      new ExplodingProvider(
        "codex",
        new FatalProviderError("OpenAI API authentication failed: invalid api key"),
      ),
    );
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Bir hata durumunu dene.",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      message: "Assistant service is temporarily unavailable",
    });
    expect(response.body).not.toMatch(/api key|codex|openai|provider/i);
  });

  it("does not expose provider details in rate limit errors", async () => {
    const context = createTestContext(
      new ExplodingProvider(
        "codex",
        new RateLimitError("OpenAI API limit exceeded: quota exceeded"),
      ),
    );
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      payload: {
        message: "Bir hata durumunu dene.",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      message: "Too many requests",
    });
    expect(response.body).not.toMatch(/codex|openai|provider/i);
  });
});
