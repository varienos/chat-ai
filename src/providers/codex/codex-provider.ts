import type { ProviderName } from "../../domain/providers.js";
import { FatalProviderError, RateLimitError, TimeoutError, ValidationError } from "../../errors.js";
import type { ProcessRunner } from "../../lib/process-runner.js";
import { buildOauthOnlyEnvironment } from "../oauth-only-environment.js";
import type {
  ChatCompletion,
  ChatRequest,
  LlmProvider,
  ProviderDefinition,
  ProviderLoginStatus,
  ProviderStreamEvent,
  SandboxMode,
} from "../types.js";

const CODEX_BLOCKED_ENV_KEYS = ["CODEX_OPENAI_API_KEY", "OPENAI_API_KEY"];
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type CodexAuthMode = "api_key" | "oauth";

interface CodexProviderOptions {
  apiKey?: string;
  authMode?: CodexAuthMode;
  binaryPath?: string;
  enableDangerousBypass?: boolean;
  getRuntimeOptions?: () => Promise<CodexProviderRuntimeOptions>;
  model?: string;
  runner: ProcessRunner;
  sandbox?: SandboxMode;
  skipGitRepoCheck?: boolean;
  timeoutMs?: number;
  workingDirectory: string;
}

interface CodexProviderRuntimeOptions {
  apiKey?: string;
  authMode?: CodexAuthMode;
  binaryPath?: string;
  enableDangerousBypass?: boolean;
  model?: string;
  sandbox?: SandboxMode;
  skipGitRepoCheck?: boolean;
  timeoutMs?: number;
  workingDirectory?: string;
}

interface ResolvedCodexProviderOptions {
  apiKey?: string;
  authMode: CodexAuthMode;
  binaryPath: string;
  enableDangerousBypass: boolean;
  model?: string;
  sandbox: SandboxMode;
  skipGitRepoCheck: boolean;
  timeoutMs: number;
  workingDirectory: string;
}

interface ParsedCodexOutput {
  content: string;
  finishReason: string;
  metadata: Record<string, unknown>;
}

export class CodexProvider implements LlmProvider {
  private readonly apiKey?: string;
  private readonly authMode: CodexAuthMode;
  private readonly binaryPath: string;
  private readonly enableDangerousBypass: boolean;
  private readonly model: string | undefined;
  private readonly sandbox: SandboxMode;
  private readonly skipGitRepoCheck: boolean;
  private readonly timeoutMs: number;

  constructor(private readonly options: CodexProviderOptions) {
    this.apiKey = options.apiKey;
    this.authMode = options.authMode ?? "oauth";
    this.binaryPath = options.binaryPath ?? "codex";
    this.enableDangerousBypass = options.enableDangerousBypass ?? false;
    this.model = options.model;
    this.sandbox = options.sandbox ?? "read-only";
    this.skipGitRepoCheck = options.skipGitRepoCheck ?? true;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  getDefinition(): ProviderDefinition {
    return {
      enabled: true,
      name: "codex",
    };
  }

  async checkLoginStatus(): Promise<ProviderLoginStatus> {
    const runtimeOptions = await this.resolveRuntimeOptions();

    if (runtimeOptions.authMode === "api_key") {
      return {
        authenticated: Boolean(runtimeOptions.apiKey),
        mode: "api_key",
        provider: "codex",
      };
    }

    const result = await this.options.runner.run({
      args: ["login", "status"],
      command: runtimeOptions.binaryPath,
      cwd: runtimeOptions.workingDirectory,
      env: this.buildExecutionEnvironment(runtimeOptions),
      timeoutMs: runtimeOptions.timeoutMs,
    });

    return {
      authenticated: result.exitCode === 0,
      mode: "oauth",
      provider: "codex",
    };
  }

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    const runtimeOptions = await this.resolveRuntimeOptions();

    if (runtimeOptions.authMode === "api_key") {
      return this.chatWithOpenAiApi(request, runtimeOptions);
    }

    const result = await this.options.runner.run({
      args: buildCodexExecArgs({
        enableDangerousBypass: runtimeOptions.enableDangerousBypass,
        model: runtimeOptions.model,
        prompt: request.prompt,
        sandbox: runtimeOptions.sandbox,
        skipGitRepoCheck: runtimeOptions.skipGitRepoCheck,
      }),
      command: runtimeOptions.binaryPath,
      cwd: runtimeOptions.workingDirectory,
      env: this.buildExecutionEnvironment(runtimeOptions),
      timeoutMs: runtimeOptions.timeoutMs,
    });

    if (result.timedOut) {
      throw new TimeoutError("Assistant request timed out");
    }

    if (result.exitCode !== 0) {
      console.error("[assistant] backend command failed");
      const msg = (result.stderr ?? "").toLowerCase();
      if (msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("401") || msg.includes("403")) {
        throw new FatalProviderError("Assistant authentication failed");
      }
      throw new ValidationError("Assistant request failed");
    }

    const parsed = parseCodexOutput(result.stdout);

    return {
      content: parsed.content,
      finishReason: parsed.finishReason,
      metadata: {
        ...parsed.metadata,
        durationMs: result.durationMs,
      },
      provider: "codex",
    };
  }

  async chatStream(
    request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    const runtimeOptions = await this.resolveRuntimeOptions();

    if (runtimeOptions.authMode === "api_key") {
      const completion = await this.chatWithOpenAiApi(request, runtimeOptions);
      await onEvent({
        chunk: completion.content,
        type: "assistant.delta",
      });

      return completion;
    }

    let streamedContent = "";

    const result = await this.options.runner.run({
      args: buildCodexExecArgs({
        enableDangerousBypass: runtimeOptions.enableDangerousBypass,
        model: runtimeOptions.model,
        prompt: request.prompt,
        sandbox: runtimeOptions.sandbox,
        skipGitRepoCheck: runtimeOptions.skipGitRepoCheck,
      }),
      command: runtimeOptions.binaryPath,
      cwd: runtimeOptions.workingDirectory,
      env: this.buildExecutionEnvironment(runtimeOptions),
      onStdoutLine: async (line) => {
        const parsedLine = parseCodexJsonLine(line);

        if (
          parsedLine?.type === "item.completed" &&
          parsedLine.item?.type === "agent_message" &&
          typeof parsedLine.item.text === "string"
        ) {
          streamedContent = parsedLine.item.text;
          await onEvent({
            chunk: parsedLine.item.text,
            type: "assistant.delta",
          });
        }
      },
      timeoutMs: runtimeOptions.timeoutMs,
    });

    if (result.timedOut) {
      throw new TimeoutError("Assistant request timed out");
    }

    if (result.exitCode !== 0) {
      console.error("[assistant] backend command failed");
      const msg = (result.stderr ?? "").toLowerCase();
      if (msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("401") || msg.includes("403")) {
        throw new FatalProviderError("Assistant authentication failed");
      }
      throw new ValidationError("Assistant request failed");
    }

    const parsed = parseCodexOutput(result.stdout);

    return {
      content: streamedContent || parsed.content,
      finishReason: parsed.finishReason,
      metadata: {
        ...parsed.metadata,
        durationMs: result.durationMs,
      },
      provider: "codex",
    };
  }

  private async resolveRuntimeOptions(): Promise<ResolvedCodexProviderOptions> {
    const override = await this.options.getRuntimeOptions?.();

    return {
      apiKey: override?.apiKey ?? this.apiKey,
      authMode: override?.authMode ?? this.authMode,
      binaryPath: override?.binaryPath ?? this.binaryPath,
      enableDangerousBypass:
        override?.enableDangerousBypass ?? this.enableDangerousBypass,
      model: override?.model ?? this.model,
      sandbox: override?.sandbox ?? this.sandbox,
      skipGitRepoCheck: override?.skipGitRepoCheck ?? this.skipGitRepoCheck,
      timeoutMs: override?.timeoutMs ?? this.timeoutMs,
      workingDirectory: override?.workingDirectory ?? this.options.workingDirectory,
    };
  }

  private buildExecutionEnvironment(runtimeOptions: ResolvedCodexProviderOptions) {
    const environment = buildOauthOnlyEnvironment(CODEX_BLOCKED_ENV_KEYS);

    if (runtimeOptions.authMode !== "api_key") {
      return environment;
    }

    return {
      ...environment,
      OPENAI_API_KEY: runtimeOptions.apiKey,
    };
  }

  private async chatWithOpenAiApi(
    request: ChatRequest,
    runtimeOptions: ResolvedCodexProviderOptions,
  ): Promise<ChatCompletion> {
    if (!runtimeOptions.apiKey?.trim()) {
      throw new FatalProviderError("Assistant credentials are not configured");
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), runtimeOptions.timeoutMs);

    let response: Response;
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        body: JSON.stringify({
          input: request.prompt,
          model: runtimeOptions.model ?? "gpt-5.4",
        }),
        headers: {
          Authorization: `Bearer ${runtimeOptions.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new TimeoutError("Assistant request timed out");
      }

      throw new ValidationError("Assistant request failed");
    } finally {
      clearTimeout(timeout);
    }

    const body = await parseOpenAiResponseBody(response);
    if (!response.ok) {
      throw mapOpenAiApiError(response.status, body);
    }

    const content = extractOpenAiResponseText(body);
    if (!content) {
      throw new ValidationError("Assistant response was empty");
    }

    return {
      content,
      finishReason: extractOpenAiFinishReason(body),
      metadata: {
        durationMs: Date.now() - startedAt,
        responseId: typeof body.id === "string" ? body.id : undefined,
        usage: isRecord(body.usage) ? body.usage : undefined,
      },
      provider: "codex",
    };
  }
}

export function buildCodexExecArgs(options: {
  enableDangerousBypass?: boolean;
  model?: string;
  prompt: string;
  sandbox: SandboxMode;
  skipGitRepoCheck: boolean;
}) {
  const args = ["exec", "--json", "-s", options.sandbox];

  if (options.model) {
    args.push("-m", options.model);
  }

  if (options.skipGitRepoCheck) {
    args.push("--skip-git-repo-check");
  }

  if (options.enableDangerousBypass) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }

  args.push("--", options.prompt);

  return args;
}

function parseCodexOutput(stdout: string): ParsedCodexOutput {
  let content = "";
  let finishReason = "completed";
  let usage: Record<string, unknown> | undefined;

  for (const line of stdout.split("\n")) {
    const parsedLine = parseCodexJsonLine(line);

    if (!parsedLine) {
      continue;
    }

    if (
      parsedLine.type === "item.completed" &&
      parsedLine.item?.type === "agent_message" &&
      typeof parsedLine.item.text === "string"
    ) {
      content = parsedLine.item.text;
    }

    if (parsedLine.type === "turn.completed" && parsedLine.usage) {
      usage = parsedLine.usage;
    }
  }

  if (!content) {
    throw new ValidationError("Assistant response was empty");
  }

  return {
    content,
    finishReason,
    metadata: usage ? { usage } : {},
  };
}

function parseCodexJsonLine(line: string): CodexJsonLine | null {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmedLine) as CodexJsonLine;
  } catch {
    return null;
  }
}

async function parseOpenAiResponseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {
      error: {
        message: text,
      },
    };
  }
}

function mapOpenAiApiError(status: number, body: Record<string, unknown>) {
  const message = extractOpenAiErrorMessage(body) ?? `HTTP ${status}`;

  if (status === 401 || status === 403) {
    return new FatalProviderError("Assistant authentication failed");
  }

  if (status === 429) {
    return new RateLimitError("Assistant request limit exceeded");
  }

  return new ValidationError("Assistant request failed");
}

function extractOpenAiErrorMessage(body: Record<string, unknown>): string | undefined {
  const error = body.error;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  if (typeof body.message === "string") {
    return body.message;
  }

  return undefined;
}

function extractOpenAiResponseText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") {
    return body.output_text.trim();
  }

  const output = Array.isArray(body.output) ? body.output : [];
  return output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        return [];
      }

      return item.content
        .filter(isRecord)
        .map((content) => content.text)
        .filter((text): text is string => typeof text === "string");
    })
    .join("")
    .trim();
}

function extractOpenAiFinishReason(body: Record<string, unknown>): string {
  if (typeof body.status === "string") {
    return body.status;
  }

  return "completed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

type CodexJsonLine =
  | {
      item?: {
        text?: string;
        type?: string;
      };
      type: "item.completed";
    }
  | {
      thread_id: string;
      type: "thread.started";
    }
  | {
      type: "turn.started";
    }
  | {
      type: "turn.completed";
      usage?: Record<string, unknown>;
    };
