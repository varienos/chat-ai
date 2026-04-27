import { Writable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { MetricsRegistry } from "../src/observability/metrics-registry.js";
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

type ProviderOutcome = ChatCompletion | Error;

class SequencedProvider implements LlmProvider {
  constructor(
    private readonly outcomes: ProviderOutcome[],
    private readonly name: "codex" = "codex",
  ) {}

  async chat(_request: ChatRequest): Promise<ChatCompletion> {
    const outcome = this.outcomes.shift();

    if (!outcome) {
      throw new Error("Missing provider outcome");
    }

    if (outcome instanceof Error) {
      throw outcome;
    }

    return outcome;
  }

  async chatStream(
    request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    const result = await this.chat(request);

    await onEvent({
      chunk: result.content,
      type: "assistant.delta",
    });

    return result;
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

function createLogCapture() {
  let output = "";

  return {
    output: () => output,
    stream: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
  };
}

describe("security and observability", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  function createTestContext(options?: {
    appOptions?: Record<string, unknown>;
    provider?: LlmProvider;
  }) {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const metricsRegistry = new MetricsRegistry();
    const sessionService = new SessionService(cache, archive);
    const providerRegistry = new ProviderRegistry("codex", [
      options?.provider ??
        new SequencedProvider([
          {
            content: "Sureci analiz, teklif ve teslim planiyla baslatiriz.",
            finishReason: "completed",
            metadata: {
              durationMs: 25,
            },
            provider: "codex",
          },
        ]),
    ]);
    const chatService = new ChatService(sessionService, providerRegistry, {
      metricsRegistry,
      getConfig: async () => ({
        systemPrompt: "You answer questions about mobile app development projects.",
        recentMessageLimit: 12,
        knowledgeBase: { path: "/tmp/kb-test-security", maxChars: 50000 },
      }),
    });

    const appOptions = options?.appOptions ?? {};
    const injectedServices =
      "services" in appOptions &&
      appOptions.services &&
      typeof appOptions.services === "object"
        ? (appOptions.services as Record<string, unknown>)
        : {};

    return {
      app: buildApp({
        ...appOptions,
        services: {
          ...injectedServices,
          chatService,
          metricsRegistry,
          providerRegistry,
          sessionService,
        },
      } as never),
      archive,
      sessionService,
    };
  }

  it("requires a bearer token on protected routes when API auth is configured", async () => {
    const context = createTestContext({
      appOptions: {
        config: {
          security: {
            apiAuthToken: "gateway-secret",
          },
        },
      },
    });
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const unauthorized = await context.app.inject({
      method: "POST",
      payload: {
        message: "Merhaba",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toEqual({
      message: "Unauthorized",
    });

    const wrongToken = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token",
      },
      payload: {
        message: "Merhaba",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(wrongToken.statusCode).toBe(401);

    const health = await context.app.inject({
      method: "GET",
      url: "/health",
    });

    expect(health.statusCode).toBe(200);

    const authorized = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "Merhaba",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(authorized.statusCode).toBe(200);
  });

  it("enforces the configured request body size limit", async () => {
    const context = createTestContext({
      appOptions: {
        config: {
          security: {
            apiAuthToken: "gateway-secret",
            requestBodyLimitBytes: 64,
          },
        },
      },
    });
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const response = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "x".repeat(256),
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(response.statusCode).toBe(413);
  });

  it("rate limits repeated chat requests", async () => {
    const context = createTestContext({
      appOptions: {
        config: {
          security: {
            apiAuthToken: "gateway-secret",
            rateLimitMaxRequests: 1,
            rateLimitWindowMs: 60_000,
          },
        },
      },
      provider: new SequencedProvider([
        {
          content: "Ilk cevap",
          finishReason: "completed",
          metadata: {
            durationMs: 10,
          },
          provider: "codex",
        },
        {
          content: "Ikinci cevap",
          finishReason: "completed",
          metadata: {
            durationMs: 10,
          },
          provider: "codex",
        },
      ]),
    });
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const first = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "Mesaj 1",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    const second = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "Mesaj 2",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({
      message: "Rate limit exceeded",
    });
  });

  it("redacts authorization headers in logs", async () => {
    const capture = createLogCapture();
    const context = createTestContext({
      appOptions: {
        config: {
          logging: {
            level: "info",
          },
          security: {
            apiAuthToken: "gateway-secret",
          },
        },
        loggerStream: capture.stream,
      },
    });
    apps.push(context.app);

    const response = await context.app.inject({
      method: "GET",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      url: "/api/providers",
    });

    await context.app.close();

    expect(response.statusCode).toBe(200);
    expect(capture.output()).not.toContain("gateway-secret");
    expect(capture.output()).not.toContain("Bearer gateway-secret");
    expect(capture.output()).toContain("[Redacted]");
  });

  it("returns dependency-aware health and readiness states", async () => {
    const context = createTestContext({
      appOptions: {
        services: {
          dependencyStatusService: {
            async getHealthStatus() {
              return {
                dependencies: {
                  postgres: {
                    status: "up",
                  },
                  redis: {
                    reason: "connection refused",
                    status: "down",
                  },
                },
                status: "degraded",
              };
            },
            async getReadinessStatus() {
              return {
                dependencies: {
                  codexAuth: {
                    reason: "oauth bootstrap missing",
                    status: "down",
                  },
                  postgres: {
                    status: "up",
                  },
                  redis: {
                    status: "up",
                  },
                },
                status: "not_ready",
              };
            },
          },
        },
      },
    });
    apps.push(context.app);

    const health = await context.app.inject({
      method: "GET",
      url: "/health",
    });
    const ready = await context.app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(health.statusCode).toBe(503);
    expect(health.json()).toMatchObject({
      dependencies: {
        redis: {
          reason: "connection refused",
          status: "down",
        },
      },
      status: "degraded",
    });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      dependencies: {
        assistant: {
          reason: "Assistant service is not ready",
          status: "down",
        },
      },
      status: "not_ready",
    });
    expect(ready.body).not.toMatch(/codex|oauth|provider/i);
  });

  it("exposes provider metrics for latency, error rate, timeout count and active sessions", async () => {
    const timeoutError = new Error("Codex command timed out");
    timeoutError.name = "ProviderTimeoutError";

    const context = createTestContext({
      appOptions: {
        config: {
          security: {
            apiAuthToken: "gateway-secret",
          },
        },
      },
      provider: new SequencedProvider([
        {
          content: "Baslangic cevabi",
          finishReason: "completed",
          metadata: {
            durationMs: 25,
          },
          provider: "codex",
        },
        timeoutError,
      ]),
    });
    apps.push(context.app);
    const session = await context.sessionService.createSession("codex");

    const success = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "Ilk soru",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    const failure = await context.app.inject({
      method: "POST",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      payload: {
        message: "Ikinci soru",
        sessionId: session.id,
      },
      url: "/api/chat",
    });

    const metrics = await context.app.inject({
      method: "GET",
      headers: {
        authorization: "Bearer gateway-secret",
      },
      url: "/metrics",
    });

    expect(success.statusCode).toBe(200);
    expect(failure.statusCode).toBe(504);
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      providers: {
        codex: {
          activeSessions: 1,
          averageLatencyMs: 25,
          errorCount: 1,
          errorRate: 0.5,
          timeoutCount: 1,
          totalRequests: 2,
        },
      },
    });
  });
});
