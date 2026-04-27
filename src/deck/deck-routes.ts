import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import type { SessionArchiveRepository } from "../repositories/session-archive-repository.js";
import {
  createDeckAuthHook,
  decorateDeckRequest,
  validateCredentials,
  signDeckToken,
  setAuthCookie,
  clearAuthCookie,
  type LoginRateLimiter,
} from "./deck-auth.js";
import { createChatStreamHandler } from "./deck-chat.js";
import { registerKnowledgeRoutes } from "./deck-knowledge.js";
import { createOpenApiSpecHandler } from "./deck-openapi.js";
import {
  createSessionListHandler,
  createSessionDetailHandler,
  createSessionStatsHandler,
} from "./deck-sessions.js";
import {
  type MutableSettingKey,
  type RuntimeConfigStore,
  MUTABLE_SETTINGS,
  buildSettingsList,
} from "./deck-settings.js";
import type { ChatService } from "../services/chat-service.js";
import type { SessionService } from "../services/session-service.js";

export interface DeckServices {
  chatService?: ChatService;
  loginRateLimiter?: LoginRateLimiter;
  runtimeConfigStore?: RuntimeConfigStore;
  sessionArchiveRepository?: SessionArchiveRepository;
  sessionService?: SessionService;
}

export function registerDeckRoutes(
  app: FastifyInstance,
  config: AppConfig,
  services: DeckServices,
) {
  // Guard: skip deck route registration if credentials are not configured
  if (!config.deck.jwtSecret || !config.deck.adminPassword) {
    app.log.warn("Deck admin panel disabled: DECK_JWT_SECRET and DECK_ADMIN_PASSWORD must be set");
    return;
  }

  decorateDeckRequest(app);
  const authHook = createDeckAuthHook(config.deck.jwtSecret);
  const rateLimiter = services.loginRateLimiter;

  // Public: login (with rate limiting)
  app.post("/deck/api/auth/login", async (request, reply) => {
    const ip = request.ip;
    if (rateLimiter && !(await rateLimiter.check(ip))) {
      reply.code(429).send({ message: "Too many login attempts. Try again later." });
      return;
    }

    const body = request.body;
    if (!body || typeof body !== "object") {
      reply.code(400).send({ message: "Request body must be a JSON object" });
      return;
    }
    const { username, password } = body as { username: string; password: string };

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      reply.code(400).send({ message: "username and password are required strings" });
      return;
    }

    if (!validateCredentials(username, password, config.deck.adminUser, config.deck.adminPassword)) {
      reply.code(401).send({ message: "Invalid credentials" });
      return;
    }

    // Clear failed attempts on successful login
    if (rateLimiter) await rateLimiter.reset(ip);

    const token = signDeckToken(username, config.deck.jwtSecret);
    setAuthCookie(reply, token);
    return { ok: true };
  });

  // Protected: logout (clears cookie)
  app.post("/deck/api/auth/logout", { onRequest: [authHook] }, async (_request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  // Protected: /me
  app.get("/deck/api/auth/me", { onRequest: [authHook] }, async (request) => {
    return { username: (request as any).deckUser };
  });

  // Settings routes (require RuntimeConfigStore)
  const store = services.runtimeConfigStore;
  if (store) {
    registerSettingsRoutes(app, store, authHook);
  }

  // Session routes (require SessionArchiveRepository)
  const sessionRepo = services.sessionArchiveRepository;
  if (sessionRepo) {
    registerSessionRoutes(app, sessionRepo, authHook);
  }

  // Chat stream proxy (requires ChatService + SessionService)
  const chatService = services.chatService;
  const sessionService = services.sessionService;
  if (chatService && sessionService) {
    app.post("/deck/api/chat/stream", { onRequest: [authHook] }, createChatStreamHandler(chatService, sessionService));
  }

  // OpenAPI spec endpoint
  app.get("/deck/api/openapi-spec", { onRequest: [authHook] }, createOpenApiSpecHandler(app));

  // Knowledge base routes
  registerKnowledgeRoutes(app, config.knowledgeBase.path, authHook);
}

function registerSettingsRoutes(
  app: FastifyInstance,
  store: RuntimeConfigStore,
  authHook: ReturnType<typeof createDeckAuthHook>,
) {
  // GET /deck/api/settings — return all settings with metadata
  app.get("/deck/api/settings", { onRequest: [authHook] }, async () => {
    const effectiveConfig = await store.getEffectiveConfig();
    const settings = buildSettingsList(effectiveConfig);
    return { settings };
  });

  // PATCH /deck/api/settings — update mutable settings
  app.patch("/deck/api/settings", { onRequest: [authHook] }, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      reply.code(400).send({ message: "Request body must be a JSON object" });
      return;
    }
    const mutableKeys = Object.keys(MUTABLE_SETTINGS) as MutableSettingKey[];

    // Validate all keys first
    const entries = Object.entries(body as Record<string, string>);
    for (const [key] of entries) {
      if (!mutableKeys.includes(key as MutableSettingKey)) {
        reply.code(400).send({ message: `Unknown or immutable setting key: ${key}` });
        return;
      }
    }

    // Validate all values first (no writes yet)
    const allWarnings: string[] = [];
    for (const [key, value] of entries) {
      try {
        const warnings = store.validateValue(key as MutableSettingKey, String(value));
        allWarnings.push(...warnings);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Invalid value";
        reply.code(400).send({ message });
        return;
      }
    }

    // All validated — now write all values
    const updated: Record<string, string> = {};
    for (const [key, value] of entries) {
      await store.setValue(key as MutableSettingKey, String(value));
      updated[key] = String(value);
    }

    return { updated, warnings: allWarnings.length > 0 ? allWarnings : undefined };
  });
}

function registerSessionRoutes(
  app: FastifyInstance,
  repo: SessionArchiveRepository,
  authHook: ReturnType<typeof createDeckAuthHook>,
) {
  // GET /deck/api/sessions — list sessions with filtering/pagination
  app.get("/deck/api/sessions", { onRequest: [authHook] }, createSessionListHandler(repo));

  // GET /deck/api/sessions/stats — session statistics (MUST be before :id to avoid "stats" matching as id)
  app.get("/deck/api/sessions/stats", { onRequest: [authHook] }, createSessionStatsHandler(repo));

  // GET /deck/api/sessions/:id — session detail with messages
  app.get("/deck/api/sessions/:id", { onRequest: [authHook] }, createSessionDetailHandler(repo));
}
