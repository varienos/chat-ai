import path from "node:path";
import { type ProviderName, isProviderName } from "../domain/providers.js";
import type { ClaudePermissionMode } from "../providers/claude/claude-provider.js";
import type { CodexAuthMode } from "../providers/codex/codex-provider.js";
import type { GeminiApprovalMode } from "../providers/gemini/gemini-provider.js";
import type { SandboxMode } from "../providers/types.js";

export interface AppConfig {
  chat: {
    idleCheckIntervalMs: number;
    recentMessageLimit: number;
    sessionIdleTimeoutMs: number;
    systemPrompt: string;
  };
  claude: {
    binaryPath: string;
    includePartialMessages: boolean;
    model?: string;
    permissionMode: ClaudePermissionMode;
    timeoutMs: number;
    workingDirectory: string;
  };
  codex: {
    apiKey?: string;
    authMode: CodexAuthMode;
    binaryPath: string;
    enableDangerousBypass: boolean;
    model?: string;
    sandbox: SandboxMode;
    skipGitRepoCheck: boolean;
    timeoutMs: number;
    workingDirectory: string;
  };
  gemini: {
    approvalMode: GeminiApprovalMode;
    binaryPath: string;
    model?: string;
    sandbox: boolean;
    timeoutMs: number;
    workingDirectory: string;
  };
  deck: {
    adminUser: string;
    adminPassword: string;
    jwtSecret: string;
  };
  knowledgeBase: {
    path: string;
    maxChars: number;
  };
  logging: {
    level: string;
  };
  security: {
    apiAuthToken: string;
    rateLimitMaxRequests: number;
    rateLimitWindowMs: number;
    requestBodyLimitBytes: number;
  };
  server: {
    host: string;
    port: number;
  };
  storage: {
    databaseUrl: string;
    redisUrl: string;
  };
  providers: {
    defaultProvider: ProviderName;
    enabledProviders: ProviderName[];
  };
  widget: {
    enabled: boolean;
    title: string;
    subtitle: string;
    welcomeMessage: string;
    primaryColor: string;
    position: string;
    theme: string;
    fabIconUrl: string;
  };
}

export interface AppConfigOverride {
  chat?: Partial<AppConfig["chat"]>;
  claude?: Partial<AppConfig["claude"]>;
  codex?: Partial<AppConfig["codex"]>;
  deck?: Partial<AppConfig["deck"]>;
  knowledgeBase?: Partial<AppConfig["knowledgeBase"]>;
  gemini?: Partial<AppConfig["gemini"]>;
  logging?: Partial<AppConfig["logging"]>;
  providers?: Partial<AppConfig["providers"]>;
  security?: Partial<AppConfig["security"]>;
  server?: Partial<AppConfig["server"]>;
  storage?: Partial<AppConfig["storage"]>;
  widget?: Partial<AppConfig["widget"]>;
}

export function loadConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): AppConfig {
  const enabledProviders = parseEnabledProviders(env.ENABLED_PROVIDERS);
  const defaultProvider = parseDefaultProvider(
    env.DEFAULT_PROVIDER,
    enabledProviders,
  );

  return {
    chat: {
      idleCheckIntervalMs: parseInt(env.IDLE_CHECK_INTERVAL_MS ?? "300000", 10),
      recentMessageLimit: Number.parseInt(env.RECENT_MESSAGE_LIMIT ?? "12", 10),
      sessionIdleTimeoutMs: parseInt(env.SESSION_IDLE_TIMEOUT_MS ?? "1800000", 10),
      systemPrompt:
        env.SYSTEM_PROMPT ??
        "You answer customer questions about mobile app development projects. Do not use tools or make file changes.",
    },
    claude: {
      binaryPath: env.CLAUDE_BINARY_PATH ?? "claude",
      includePartialMessages: env.CLAUDE_INCLUDE_PARTIAL_MESSAGES !== "false",
      model: env.CLAUDE_MODEL,
      permissionMode: parseClaudePermissionMode(env.CLAUDE_PERMISSION_MODE),
      timeoutMs: Number.parseInt(env.CLAUDE_TIMEOUT_MS ?? "60000", 10),
      workingDirectory: env.CLAUDE_WORKING_DIRECTORY ?? process.cwd(),
    },
    deck: {
      adminUser: env.DECK_ADMIN_USER ?? "admin",
      adminPassword: env.DECK_ADMIN_PASSWORD ?? "",
      jwtSecret: env.DECK_JWT_SECRET ?? "",
    },
    knowledgeBase: {
      path: env.KNOWLEDGE_BASE_PATH ?? path.join(process.cwd(), "knowledge"),
      maxChars: parseInt(env.KNOWLEDGE_BASE_MAX_CHARS ?? "50000", 10),
    },
    codex: {
      apiKey: env.CODEX_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
      authMode: parseCodexAuthMode(env.CODEX_AUTH_MODE),
      binaryPath: env.CODEX_BINARY_PATH ?? "codex",
      enableDangerousBypass: env.CODEX_ENABLE_DANGEROUS_BYPASS === "true",
      model: env.CODEX_MODEL,
      sandbox: parseSandboxMode(env.CODEX_SANDBOX),
      skipGitRepoCheck: env.CODEX_SKIP_GIT_REPO_CHECK !== "false",
      timeoutMs: Number.parseInt(env.CODEX_TIMEOUT_MS ?? "60000", 10),
      workingDirectory: env.CODEX_WORKING_DIRECTORY ?? process.cwd(),
    },
    gemini: {
      approvalMode: parseGeminiApprovalMode(env.GEMINI_APPROVAL_MODE),
      binaryPath: env.GEMINI_BINARY_PATH ?? "gemini",
      model: env.GEMINI_MODEL,
      sandbox: env.GEMINI_SANDBOX === "true",
      timeoutMs: Number.parseInt(env.GEMINI_TIMEOUT_MS ?? "60000", 10),
      workingDirectory: env.GEMINI_WORKING_DIRECTORY ?? process.cwd(),
    },
    logging: {
      level: env.LOG_LEVEL ?? "info",
    },
    security: {
      apiAuthToken: env.API_AUTH_TOKEN ?? "",
      rateLimitMaxRequests: Number.parseInt(
        env.RATE_LIMIT_MAX_REQUESTS ?? "30",
        10,
      ),
      rateLimitWindowMs: Number.parseInt(env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
      requestBodyLimitBytes: Number.parseInt(
        env.REQUEST_BODY_LIMIT_BYTES ?? "1048576",
        10,
      ),
    },
    server: {
      host: env.HOST ?? "0.0.0.0",
      port: Number.parseInt(env.PORT ?? "3000", 10),
    },
    storage: {
      databaseUrl:
        env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/varienai",
      redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    },
    providers: {
      defaultProvider,
      enabledProviders,
    },
    widget: {
      enabled: env.WIDGET_ENABLED === "true",
      title: env.WIDGET_TITLE ?? "Varien AI Asistan",
      subtitle: env.WIDGET_SUBTITLE ?? "Size nasıl yardımcı olabilirim?",
      welcomeMessage: env.WIDGET_WELCOME_MESSAGE ?? "Merhaba! 👋 Mobil uygulama, web geliştirme veya yapay zeka projeleriniz hakkında sorularınızı yanıtlayabilirim.",
      primaryColor: env.WIDGET_PRIMARY_COLOR ?? "#AA0B5A",
      position: env.WIDGET_POSITION ?? "bottom-right",
      theme: env.WIDGET_THEME ?? "light",
      fabIconUrl: env.WIDGET_FAB_ICON_URL ?? "",
    },
  };
}

export function mergeConfig(
  baseConfig: AppConfig,
  override: AppConfigOverride = {},
): AppConfig {
  return {
    chat: {
      ...baseConfig.chat,
      ...override.chat,
    },
    claude: {
      ...baseConfig.claude,
      ...override.claude,
    },
    codex: {
      ...baseConfig.codex,
      ...override.codex,
    },
    deck: {
      ...baseConfig.deck,
      ...override.deck,
    },
    knowledgeBase: {
      ...baseConfig.knowledgeBase,
      ...override.knowledgeBase,
    },
    gemini: {
      ...baseConfig.gemini,
      ...override.gemini,
    },
    logging: {
      ...baseConfig.logging,
      ...override.logging,
    },
    providers: {
      ...baseConfig.providers,
      ...override.providers,
    },
    security: {
      ...baseConfig.security,
      ...override.security,
    },
    server: {
      ...baseConfig.server,
      ...override.server,
    },
    storage: {
      ...baseConfig.storage,
      ...override.storage,
    },
    widget: {
      ...baseConfig.widget,
      ...override.widget,
    },
  };
}

function parseEnabledProviders(rawValue: string | undefined): ProviderName[] {
  if (!rawValue) {
    return ["codex"];
  }

  const providers = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(isProviderName);

  return providers.length > 0 ? providers : ["codex"];
}

function parseDefaultProvider(
  rawValue: string | undefined,
  enabledProviders: ProviderName[],
): ProviderName {
  if (rawValue && isProviderName(rawValue) && enabledProviders.includes(rawValue)) {
    return rawValue;
  }

  return enabledProviders[0] ?? "codex";
}

function parseSandboxMode(rawValue: string | undefined): SandboxMode {
  switch (rawValue) {
    case "danger-full-access":
    case "workspace-write":
      return rawValue;
    default:
      return "read-only";
  }
}

function parseCodexAuthMode(rawValue: string | undefined): CodexAuthMode {
  switch (rawValue) {
    case "api_key":
      return "api_key";
    default:
      return "oauth";
  }
}

function parseGeminiApprovalMode(
  rawValue: string | undefined,
): GeminiApprovalMode {
  switch (rawValue) {
    case "auto_edit":
    case "default":
    case "yolo":
      return rawValue;
    default:
      return "plan";
  }
}

function parseClaudePermissionMode(
  rawValue: string | undefined,
): ClaudePermissionMode {
  switch (rawValue) {
    case "acceptEdits":
    case "auto":
    case "bypassPermissions":
    case "default":
    case "dontAsk":
      return rawValue;
    default:
      return "plan";
  }
}
