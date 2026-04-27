import { afterEach, describe, expect, it } from "vitest";

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

class TaggedProvider implements LlmProvider {
  constructor(private readonly name: ProviderName) {}

  private get reply() {
    return this.name === "codex" ? "default-reply" : "override-reply";
  }

  async chat(_request: ChatRequest): Promise<ChatCompletion> {
    return {
      content: this.reply,
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
      chunk: this.reply,
      type: "assistant.delta",
    });

    return {
      content: this.reply,
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

function createWidgetChatApp(config?: {
  providers?: {
    defaultProvider?: ProviderName;
    enabledProviders?: ProviderName[];
  };
  security?: {
    rateLimitMaxRequests?: number;
    rateLimitWindowMs?: number;
  };
  widget?: {
    enabled?: boolean;
  };
}) {
  const cache = new InMemorySessionCacheRepository();
  const archive = new InMemorySessionArchiveRepository();
  const sessionService = new SessionService(cache, archive);
  const providerRegistry = new ProviderRegistry(
    config?.providers?.defaultProvider ?? "codex",
    [
      new TaggedProvider("codex"),
      new TaggedProvider("gemini"),
      new TaggedProvider("claude"),
    ],
  );
  const chatService = new ChatService(sessionService, providerRegistry, {
    getConfig: async () => ({
      systemPrompt: "Widget test prompt",
      recentMessageLimit: 12,
      knowledgeBase: { path: "/tmp/kb-test-widget-chat", maxChars: 50000 },
    }),
  });

  return buildApp({
    config: {
      providers: {
        defaultProvider: config?.providers?.defaultProvider ?? "codex",
        enabledProviders:
          config?.providers?.enabledProviders ?? ["codex", "gemini", "claude"],
      },
      security: {
        apiAuthToken: "",
        rateLimitMaxRequests: config?.security?.rateLimitMaxRequests,
        rateLimitWindowMs: config?.security?.rateLimitWindowMs,
      },
      widget: {
        enabled: config?.widget?.enabled,
      },
    },
    services: {
      chatService,
      providerRegistry,
      sessionArchiveRepository: archive,
      sessionService,
    },
  });
}

describe("public widget chat hardening", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it("rate limits repeated requests to /api/widget/chat", async () => {
    const app = createWidgetChatApp({
      security: {
        rateLimitMaxRequests: 1,
        rateLimitWindowMs: 60_000,
      },
      widget: {
        enabled: true,
      },
    });
    apps.push(app);

    const first = await app.inject({
      method: "POST",
      payload: {
        message: "ilk mesaj",
        sessionId: "11111111-1111-4111-8111-111111111111",
      },
      url: "/api/widget/chat",
    });

    const second = await app.inject({
      method: "POST",
      payload: {
        message: "ikinci mesaj",
        sessionId: "22222222-2222-4222-8222-222222222222",
      },
      url: "/api/widget/chat",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it("rejects /api/widget/chat when the widget is disabled", async () => {
    const app = createWidgetChatApp({
      widget: {
        enabled: false,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        message: "widget kapali mi?",
        sessionId: "33333333-3333-4333-8333-333333333333",
      },
      url: "/api/widget/chat",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      message: "Widget is disabled",
    });
  });

  it("ignores caller-supplied provider overrides on /api/widget/chat", async () => {
    const app = createWidgetChatApp({
      providers: {
        defaultProvider: "codex",
        enabledProviders: ["codex", "gemini", "claude"],
      },
      widget: {
        enabled: true,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        message: "saglayici secmeyi dene",
        provider: "gemini",
        sessionId: "44444444-4444-4444-8444-444444444444",
      },
      url: "/api/widget/chat",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("default-reply");
    expect(response.body).not.toContain("override-reply");
    expect(response.body).not.toContain('"provider"');
    expect(response.body).not.toContain("codex");
    expect(response.body).not.toContain('"provider":"gemini"');
  });
});
