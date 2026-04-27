import { type AppConfig } from "../config/env.js";
import { createPostgresPool } from "../lib/postgres.js";
import { NodeProcessRunner } from "../lib/process-runner.js";
import { createRedisClient } from "../lib/redis.js";
import {
  RuntimeDependencyStatusService,
  type DependencyState,
} from "../observability/dependency-status-service.js";
import { MetricsRegistry } from "../observability/metrics-registry.js";
import type { ProviderName } from "../domain/providers.js";
import { ProviderRegistry } from "../providers/provider-registry.js";
import { ClaudeProvider } from "../providers/claude/claude-provider.js";
import { CodexProvider } from "../providers/codex/codex-provider.js";
import { GeminiProvider } from "../providers/gemini/gemini-provider.js";
import { PostgresSessionArchiveRepository } from "../repositories/session-archive-repository.js";
import { RedisSessionCacheRepository } from "../repositories/session-cache-repository.js";
import { RedisRateLimitStore } from "../security/rate-limiter.js";
import { createRedisLoginRateLimiter } from "../deck/deck-auth.js";
import { RuntimeConfigStore } from "../deck/deck-settings.js";
import { ChatService } from "../services/chat-service.js";
import { SessionService } from "../services/session-service.js";
import { applyPostgresSchema } from "../storage/postgres-schema.js";

export async function createRuntimeServices(config: AppConfig) {
  const redisClient = createRedisClient(config.storage.redisUrl);
  await redisClient.connect();

  const postgresPool = createPostgresPool(config.storage.databaseUrl);
  await applyPostgresSchema(postgresPool);
  const sessionArchiveRepository = new PostgresSessionArchiveRepository(postgresPool);
  const sessionService = new SessionService(
    new RedisSessionCacheRepository(redisClient),
    sessionArchiveRepository,
  );
  const metricsRegistry = new MetricsRegistry();
  const runtimeConfigStore = new RuntimeConfigStore(redisClient, config);
  const processRunner = new NodeProcessRunner(getAllowedCommands(config));
  const providerRegistry = new ProviderRegistry(
    config.providers.defaultProvider,
    createRuntimeProviders(config, processRunner, runtimeConfigStore),
  );
  const loginRateLimiter = createRedisLoginRateLimiter(redisClient);
  const chatService = new ChatService(sessionService, providerRegistry, {
    metricsRegistry,
    getConfig: async () => {
      const effective = await runtimeConfigStore.getEffectiveConfig();
      return {
        systemPrompt: effective.chat.systemPrompt,
        recentMessageLimit: effective.chat.recentMessageLimit,
        knowledgeBase: effective.knowledgeBase,
      };
    },
  });
  const dependencyStatusService = new RuntimeDependencyStatusService({
    checkPostgres: async () => {
      await postgresPool.query("select 1");
    },
    checkProviderAuth: async () => {
      return checkProviderAuthStatuses(providerRegistry);
    },
    checkRedis: async () => {
      const response = await redisClient.ping();

      if (response !== "PONG") {
        throw new Error("Redis ping failed");
      }
    },
  });
  const rateLimitStore = new RedisRateLimitStore(redisClient);

  return {
    async close() {
      try {
        await redisClient.quit();
      } catch (err) {
        console.error("[shutdown] Redis quit failed:", err);
      }
      try {
        await postgresPool.end();
      } catch (err) {
        console.error("[shutdown] Postgres pool end failed:", err);
      }
    },
    loginRateLimiter,
    runtimeConfigStore,
    sessionArchiveRepository,
    services: {
      chatService,
      dependencyStatusService,
      metricsRegistry,
      providerRegistry,
      rateLimitStore,
      sessionService,
    },
  };
}

function createRuntimeProviders(
  config: AppConfig,
  processRunner: NodeProcessRunner,
  runtimeConfigStore?: RuntimeConfigStore,
) {
  return config.providers.enabledProviders.map((providerName) =>
    createRuntimeProvider(providerName, config, processRunner, runtimeConfigStore),
  );
}

function createRuntimeProvider(
  providerName: ProviderName,
  config: AppConfig,
  processRunner: NodeProcessRunner,
  runtimeConfigStore?: RuntimeConfigStore,
) {
  switch (providerName) {
    case "claude":
      return new ClaudeProvider({
        binaryPath: config.claude.binaryPath,
        includePartialMessages: config.claude.includePartialMessages,
        model: config.claude.model,
        permissionMode: config.claude.permissionMode,
        runner: processRunner,
        timeoutMs: config.claude.timeoutMs,
        workingDirectory: config.claude.workingDirectory,
      });
    case "gemini":
      return new GeminiProvider({
        approvalMode: config.gemini.approvalMode,
        binaryPath: config.gemini.binaryPath,
        model: config.gemini.model,
        runner: processRunner,
        sandbox: config.gemini.sandbox,
        timeoutMs: config.gemini.timeoutMs,
        workingDirectory: config.gemini.workingDirectory,
      });
    case "codex":
    default:
      return new CodexProvider({
        apiKey: config.codex.apiKey,
        authMode: config.codex.authMode,
        binaryPath: config.codex.binaryPath,
        enableDangerousBypass: config.codex.enableDangerousBypass,
        getRuntimeOptions: runtimeConfigStore
          ? async () => (await runtimeConfigStore.getEffectiveConfig()).codex
          : undefined,
        model: config.codex.model,
        runner: processRunner,
        sandbox: config.codex.sandbox,
        skipGitRepoCheck: config.codex.skipGitRepoCheck,
        timeoutMs: config.codex.timeoutMs,
        workingDirectory: config.codex.workingDirectory,
      });
  }
}

function getAllowedCommands(config: AppConfig) {
  return Array.from(
    new Set([
      config.codex.binaryPath,
      config.gemini.binaryPath,
      config.claude.binaryPath,
    ]),
  );
}

async function checkProviderAuthStatuses(providerRegistry: ProviderRegistry) {
  const output: Record<string, DependencyState> = {};

  for (const provider of providerRegistry.list()) {
    const loginStatus = await providerRegistry
      .require(provider.name)
      .checkLoginStatus();

    output[`${provider.name}Auth`] = loginStatus.authenticated
      ? {
          status: "up",
        }
      : {
          reason:
            loginStatus.mode === "api_key"
              ? "API key missing"
              : "OAuth bootstrap missing",
          status: "down",
        };
  }

  return output;
}
