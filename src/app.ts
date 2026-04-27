import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import nodePath from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { loadConfig, mergeConfig, type AppConfigOverride } from "./config/env.js";
import { AuthenticationError, RateLimitError } from "./errors.js";
import { getEnabledProviders } from "./domain/providers.js";
import {
  StaticDependencyStatusService,
  type DependencyStatusService,
} from "./observability/dependency-status-service.js";
import { MetricsRegistry } from "./observability/metrics-registry.js";
import { createChatStreamHandler } from "./deck/deck-chat.js";
import { registerOpenApi } from "./openapi/register-openapi.js";
import { ProviderRegistry } from "./providers/provider-registry.js";
import { StaticProvider } from "./providers/static-provider.js";
import { registerDeckRoutes } from "./deck/deck-routes.js";
import { registerDeckStatic } from "./deck/deck-static.js";
import { RuntimeConfigStore, createInMemoryRedis } from "./deck/deck-settings.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerReadinessRoutes } from "./routes/readiness.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { sanitizeErrorForLog } from "./lib/route-helpers.js";
import { InMemorySessionArchiveRepository, type SessionArchiveRepository } from "./repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "./repositories/session-cache-repository.js";
import { createInMemoryLoginRateLimiter, type LoginRateLimiter } from "./deck/deck-auth.js";
import {
  InMemoryRateLimitStore,
  type RateLimitStore,
} from "./security/rate-limiter.js";
import { ChatService } from "./services/chat-service.js";
import { SessionService } from "./services/session-service.js";

interface AppServices {
  chatService: ChatService;
  dependencyStatusService: DependencyStatusService;
  loginRateLimiter: LoginRateLimiter;
  metricsRegistry: MetricsRegistry;
  providerRegistry: ProviderRegistry;
  rateLimitStore: RateLimitStore;
  runtimeConfigStore: RuntimeConfigStore;
  sessionArchiveRepository: SessionArchiveRepository;
  sessionService: SessionService;
}

interface BuildAppOptions {
  config?: AppConfigOverride;
  loggerStream?: NodeJS.WritableStream;
  services?: Partial<AppServices>;
}

const PUBLIC_PATHS = new Set(
  process.env.NODE_ENV === "production"
    ? ["/health", "/ready", "/api/widget/config", "/api/widget/chat"]
    : ["/health", "/openapi.json", "/ready", "/api/widget/config", "/api/widget/chat"],
);
const PUBLIC_PATH_PREFIXES = process.env.NODE_ENV === "production" ? ["/deck", "/widget/"] : ["/docs", "/deck", "/widget/"];
const RATE_LIMIT_EXEMPT_PATHS = new Set(
  process.env.NODE_ENV === "production"
    ? ["/health", "/ready", "/api/widget/config"]
    : ["/health", "/openapi.json", "/ready", "/api/widget/config"],
);
const RATE_LIMIT_EXEMPT_PREFIXES =
  process.env.NODE_ENV === "production" ? ["/widget/"] : ["/docs", "/widget/"];
const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.x-api-key",
  "res.headers.authorization",
];

export function buildApp(options: BuildAppOptions = {}) {
  const config = mergeConfig(loadConfig(), options.config);
  const app = Fastify({
    bodyLimit: config.security.requestBodyLimitBytes,
    logger: buildLoggerOptions(config, options.loggerStream),
  });
  const providerRegistry =
    options.services?.providerRegistry ?? createDefaultProviderRegistry(config);
  const sessionArchiveRepository =
    options.services?.sessionArchiveRepository ?? new InMemorySessionArchiveRepository();
  const sessionService =
    options.services?.sessionService ?? new SessionService(
      new InMemorySessionCacheRepository(),
      sessionArchiveRepository,
    );
  const metricsRegistry =
    options.services?.metricsRegistry ?? new MetricsRegistry();
  const dependencyStatusService =
    options.services?.dependencyStatusService ??
    new StaticDependencyStatusService();
  const loginRateLimiter =
    options.services?.loginRateLimiter ?? createInMemoryLoginRateLimiter();
  const rateLimitStore =
    options.services?.rateLimitStore ?? new InMemoryRateLimitStore();
  const runtimeConfigStore =
    options.services?.runtimeConfigStore ??
    new RuntimeConfigStore(createInMemoryRedis(), config);
  const chatService =
    options.services?.chatService ??
    new ChatService(sessionService, providerRegistry, {
      metricsRegistry,
      getConfig: async () => ({
        systemPrompt: config.chat.systemPrompt,
        recentMessageLimit: config.chat.recentMessageLimit,
        knowledgeBase: config.knowledgeBase,
      }),
    });

  if (!config.security.apiAuthToken) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("API_AUTH_TOKEN must be set in production");
    }
    app.log.warn("API_AUTH_TOKEN is empty — API auth is disabled (acceptable in development)");
  }

  // CORS for widget — allows cross-origin requests from any site embedding the widget
  const WIDGET_CORS_PATHS = new Set(["/api/widget/chat"]);
  const WIDGET_CORS_PREFIXES = ["/api/widget/", "/widget/"];

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0];
    const isCorsPath = WIDGET_CORS_PATHS.has(path) || WIDGET_CORS_PREFIXES.some(p => path.startsWith(p));
    if (isCorsPath) {
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (request.method === "OPTIONS") {
        reply.header("Access-Control-Max-Age", "86400");
        reply.code(204).send();
        return;
      }
    }
  });

  registerOpenApi(app);
  registerDeckRoutes(app, config, { chatService, loginRateLimiter, runtimeConfigStore, sessionArchiveRepository, sessionService });
  registerDeckStatic(app);

  // Widget config — public endpoint (no auth required)
  app.get("/api/widget/config", async () => {
    try {
      const effectiveConfig = runtimeConfigStore ? await runtimeConfigStore.getEffectiveConfig() : config;
      return {
        enabled: effectiveConfig.widget.enabled,
        title: effectiveConfig.widget.title,
        subtitle: effectiveConfig.widget.subtitle,
        welcomeMessage: effectiveConfig.widget.welcomeMessage,
        primaryColor: effectiveConfig.widget.primaryColor,
        position: effectiveConfig.widget.position,
        theme: effectiveConfig.widget.theme,
        fabIconUrl: effectiveConfig.widget.fabIconUrl,
      };
    } catch (err) {
      app.log.error({ err: sanitizeErrorForLog(err) }, "Failed to load widget config, falling back to static");
      return {
        enabled: config.widget.enabled,
        title: config.widget.title,
        subtitle: config.widget.subtitle,
        welcomeMessage: config.widget.welcomeMessage,
        primaryColor: config.widget.primaryColor,
        position: config.widget.position,
        theme: config.widget.theme,
        fabIconUrl: config.widget.fabIconUrl,
      };
    }
  });

  // Widget chat stream — public endpoint (no Bearer auth, uses same ChatService)
  if (chatService && sessionService) {
    const widgetChatHandler = createChatStreamHandler(chatService, sessionService, {
      allowProviderOverride: false,
      initialProvider: providerRegistry.getDefaultProvider(),
    });

    app.post("/api/widget/chat", async (request, reply) => {
      let widgetEnabled = config.widget.enabled;

      if (runtimeConfigStore) {
        try {
          const effectiveConfig = await runtimeConfigStore.getEffectiveConfig();
          widgetEnabled = effectiveConfig.widget.enabled;
        } catch (err) {
          app.log.error({ err: sanitizeErrorForLog(err) }, "Failed to load widget config before chat request");
        }
      }

      if (!widgetEnabled) {
        reply.code(403).send({ message: "Widget is disabled" });
        return;
      }

      return widgetChatHandler(request, reply);
    });
  }

  // Widget static JS file
  app.get("/widget/varien-chat-widget.js", async (_request, reply) => {
    const filePath = nodePath.join(process.cwd(), "widget", "dist", "varien-chat-widget.js");
    try {
      const content = await fs.readFile(filePath);
      reply.header("Content-Type", "application/javascript");
      reply.header("Cache-Control", "public, max-age=60");
      reply.send(content);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reply.code(404).send({ message: "Widget not found" });
      } else {
        app.log.error({ err: sanitizeErrorForLog(err), filePath }, "Failed to serve widget JS");
        reply.code(500).send({ message: "Internal server error" });
      }
    }
  });

  registerSecurityHooks(app, config, rateLimitStore);
  app.setErrorHandler((error, _request, reply) => {
    if (hasCode(error, "FST_ERR_VALIDATION")) {
      reply.code(400).send({
        message: error.message,
      });
      return;
    }

    if (hasCode(error, "FST_ERR_CTP_BODY_TOO_LARGE")) {
      reply.code(413).send({
        message: error.message,
      });
      return;
    }

    app.log.error({ err: sanitizeErrorForLog(error) }, "unhandled route error");
    reply.code(500).send({ message: "Internal server error" });
  });
  app.register(async (instance) => {
    registerReadinessRoutes(
      instance,
      dependencyStatusService,
      metricsRegistry,
      providerRegistry,
      sessionService,
    );
    registerProviderRoutes(instance, providerRegistry);
    registerSessionRoutes(instance, providerRegistry, sessionService);
    registerChatRoutes(instance, chatService);
  });

  // Idle session cleanup cron
  if (sessionService) {
    const intervalMs = config.chat.idleCheckIntervalMs;
    const timeoutMs = config.chat.sessionIdleTimeoutMs;
    const timer = setInterval(async () => {
      try {
        const count = await sessionService.completeIdleSessions(timeoutMs);
        if (count > 0) {
          app.log.info(`Completed ${count} idle session(s)`);
        }
      } catch (err) {
        app.log.error({ err }, "Idle session cleanup failed");
      }
    }, intervalMs);
    app.addHook("onClose", async () => clearInterval(timer));
  }

  return app;
}

function createDefaultProviderRegistry(config: ReturnType<typeof loadConfig>) {
  const providers = getEnabledProviders(config).map(
    (provider) => new StaticProvider(provider, true),
  );

  return new ProviderRegistry(config.providers.defaultProvider, providers);
}

function buildLoggerOptions(
  config: ReturnType<typeof loadConfig>,
  loggerStream?: NodeJS.WritableStream,
) {
  return {
    level: config.logging.level,
    redact: LOG_REDACT_PATHS,
    serializers: {
      req(request: {
        headers: Record<string, unknown>;
        hostname?: string;
        ip?: string;
        method: string;
        url: string;
      }) {
        return {
          headers: {
            authorization: request.headers.authorization,
            "x-api-key": request.headers["x-api-key"],
          },
          host: request.hostname,
          method: request.method,
          remoteAddress: request.ip,
          url: request.url,
        };
      },
    },
    stream: loggerStream,
  } as never;
}

function registerSecurityHooks(
  app: ReturnType<typeof Fastify>,
  config: ReturnType<typeof loadConfig>,
  rateLimitStore: RateLimitStore,
) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // Preflight handled by CORS hook
    if (request.method === "OPTIONS") {
      return;
    }

    const path = request.raw.url?.split("?")[0] ?? request.url;

    const skipAuth = PUBLIC_PATHS.has(path) || PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
    const skipRateLimit = shouldSkipRateLimit(path);

    if (skipAuth && skipRateLimit) {
      return;
    }

    try {
      if (!skipAuth) {
        enforceAuth(config.security.apiAuthToken, request.headers.authorization);
      }
      if (!skipRateLimit) {
        await enforceRateLimit(config, rateLimitStore, request.ip, path);
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        reply.code(401).send({
          message: error.message,
        });
        return reply;
      }

      if (error instanceof RateLimitError) {
        reply.code(429).send({
          message: error.message,
        });
        return reply;
      }

      throw error;
    }
  });
}

function shouldSkipRateLimit(path: string) {
  if (RATE_LIMIT_EXEMPT_PATHS.has(path)) {
    return true;
  }

  if (RATE_LIMIT_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  return path.startsWith("/deck") && !path.startsWith("/deck/api/");
}

function enforceAuth(expectedToken: string, authorizationHeader?: string) {
  if (!expectedToken) {
    return;
  }

  const expected = `Bearer ${expectedToken}`;
  if (!authorizationHeader || authorizationHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(authorizationHeader))) {
    throw new AuthenticationError();
  }
}

async function enforceRateLimit(
  config: ReturnType<typeof loadConfig>,
  rateLimitStore: RateLimitStore,
  ipAddress: string,
  path: string,
) {
  const result = await rateLimitStore.consume(
    `${ipAddress}:${path}`,
    config.security.rateLimitMaxRequests,
    config.security.rateLimitWindowMs,
  );

  if (!result.allowed) {
    throw new RateLimitError();
  }
}

function hasCode(
  error: unknown,
  code: string,
): error is Error & {
  code: string;
} {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    error.code === code
  );
}
