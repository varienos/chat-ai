import { FatalProviderError, TimeoutError, ValidationError } from "../../errors.js";
import type { ProcessRunner } from "../../lib/process-runner.js";
import { buildOauthOnlyEnvironment } from "../oauth-only-environment.js";
import type {
  ChatCompletion,
  ChatRequest,
  LlmProvider,
  ProviderDefinition,
  ProviderLoginStatus,
  ProviderStreamEvent,
} from "../types.js";

export type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

interface ClaudeProviderOptions {
  binaryPath?: string;
  includePartialMessages?: boolean;
  model?: string;
  permissionMode?: ClaudePermissionMode;
  runner: ProcessRunner;
  timeoutMs?: number;
  workingDirectory: string;
}

type ClaudeOutputFormat = "json" | "stream-json";

interface ClaudeRuntimeState {
  finalContent: string;
  finishReason: string;
  streamedContent: string;
  usage?: Record<string, unknown>;
}

const CLAUDE_BLOCKED_ENV_KEYS = ["ANTHROPIC_API_KEY"];

export class ClaudeProvider implements LlmProvider {
  private readonly binaryPath: string;
  private readonly includePartialMessages: boolean;
  private readonly permissionMode: ClaudePermissionMode;
  private readonly timeoutMs: number;

  constructor(private readonly options: ClaudeProviderOptions) {
    this.binaryPath = options.binaryPath ?? "claude";
    this.includePartialMessages = options.includePartialMessages ?? true;
    this.permissionMode = options.permissionMode ?? "plan";
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  getDefinition(): ProviderDefinition {
    return {
      enabled: true,
      name: "claude",
    };
  }

  async checkLoginStatus(): Promise<ProviderLoginStatus> {
    const result = await this.options.runner.run({
      args: ["auth", "status", "--json"],
      command: this.binaryPath,
      cwd: this.options.workingDirectory,
      env: buildOauthOnlyEnvironment(CLAUDE_BLOCKED_ENV_KEYS),
      timeoutMs: this.timeoutMs,
    });

    const parsed = parseClaudeStatus(result.stdout);
    const authenticated =
      result.exitCode === 0 &&
      parsed?.loggedIn === true &&
      parsed.authMethod === "claude.ai" &&
      parsed.apiProvider === "firstParty";

    return {
      authenticated,
      mode: "oauth",
      provider: "claude",
    };
  }

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    return this.runClaudeCommand(request);
  }

  async chatStream(
    request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    return this.runClaudeCommand(request, onEvent);
  }

  private async runClaudeCommand(
    request: ChatRequest,
    onEvent?: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    const state: ClaudeRuntimeState = {
      finalContent: "",
      finishReason: "completed",
      streamedContent: "",
    };
    const result = await this.options.runner.run({
      args: buildClaudePrintArgs({
        includePartialMessages: this.includePartialMessages,
        model: this.options.model,
        outputFormat: "stream-json",
        permissionMode: this.permissionMode,
        prompt: request.prompt,
      }),
      command: this.binaryPath,
      cwd: this.options.workingDirectory,
      env: buildOauthOnlyEnvironment(CLAUDE_BLOCKED_ENV_KEYS),
      onStdoutLine: async (line) => {
        const parsedLine = parseClaudeJsonLine(line);

        if (!parsedLine) {
          return;
        }

        if (
          isClaudeStreamEventLine(parsedLine) &&
          parsedLine.event?.type === "content_block_delta" &&
          parsedLine.event.delta?.type === "text_delta" &&
          typeof parsedLine.event.delta.text === "string"
        ) {
          state.streamedContent += parsedLine.event.delta.text;

          if (onEvent) {
            await onEvent({
              chunk: parsedLine.event.delta.text,
              type: "assistant.delta",
            });
          }
        }

        if (isClaudeAssistantLine(parsedLine) && parsedLine.message?.content) {
          state.finalContent = extractClaudeAssistantText(parsedLine.message.content);
          state.usage = parsedLine.message.usage;
        }

        if (
          isClaudeStreamEventLine(parsedLine) &&
          parsedLine.event?.type === "message_delta"
        ) {
          if (parsedLine.event.delta?.stop_reason) {
            state.finishReason = parsedLine.event.delta.stop_reason;
          }

          if (parsedLine.event.usage) {
            state.usage = parsedLine.event.usage;
          }
        }
      },
      timeoutMs: this.timeoutMs,
    });

    if (result.timedOut) {
      throw new TimeoutError("Assistant request timed out");
    }

    if (result.exitCode !== 0) {
      const errMsg = extractClaudeErrorMessage(result.stderr, result.stdout);
      console.error("[assistant] backend command failed");
      const lower = errMsg.toLowerCase();
      if (lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
        throw new FatalProviderError("Assistant authentication failed");
      }
      throw new ValidationError("Assistant request failed");
    }

    const content = state.finalContent || state.streamedContent;

    if (!content) {
      throw new ValidationError("Assistant response was empty");
    }

    return {
      content,
      finishReason: state.finishReason,
      metadata: {
        durationMs: result.durationMs,
        ...(state.usage ? { usage: state.usage } : {}),
      },
      provider: "claude",
    };
  }
}

export function buildClaudePrintArgs(options: {
  includePartialMessages: boolean;
  model?: string;
  outputFormat: ClaudeOutputFormat;
  permissionMode: ClaudePermissionMode;
  prompt: string;
}) {
  const args = [
    "-p",
    "--output-format",
    options.outputFormat,
    "--permission-mode",
    options.permissionMode,
    "--tools",
    "",
    "--no-session-persistence",
  ];

  if (options.includePartialMessages) {
    args.push("--include-partial-messages");
  }

  if (options.model) {
    args.push("--model", options.model);
  }

  args.push("--", options.prompt);

  return args;
}

function parseClaudeStatus(stdout: string) {
  try {
    return JSON.parse(stdout.trim()) as {
      apiProvider?: string;
      authMethod?: string;
      loggedIn?: boolean;
    };
  } catch {
    return null;
  }
}

function parseClaudeJsonLine(line: string): ClaudeJsonLine | null {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmedLine) as ClaudeJsonLine;
  } catch {
    return null;
  }
}

function extractClaudeAssistantText(contentBlocks: Array<Record<string, unknown>>) {
  return contentBlocks
    .filter(
      (block): block is {
        text: string;
        type: "text";
      } => block.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("");
}

function extractClaudeErrorMessage(stdout: string, stderr: string) {
  const parsedLines = [stderr, stdout]
    .flatMap((output) => output.split("\n"))
    .map((line) => parseClaudeJsonLine(line))
    .filter((line): line is ClaudeJsonLine => line !== null);

  for (const parsedLine of parsedLines) {
    if ("error" in parsedLine && typeof parsedLine.error === "string") {
      return parsedLine.error;
    }

    if ("message" in parsedLine && typeof parsedLine.message === "string") {
      return parsedLine.message;
    }
  }

  return stderr.trim() || stdout.trim() || "Claude command failed";
}

type ClaudeStreamEventLine = {
  event?: {
    delta?: {
      stop_reason?: string | null;
      text?: string;
      type?: string;
    };
    type?: string;
    usage?: Record<string, unknown>;
  };
  type: "stream_event";
};

type ClaudeAssistantLine = {
  message?: {
    content: Array<Record<string, unknown>>;
    usage?: Record<string, unknown>;
  };
  type: "assistant";
};

type ClaudeJsonLine =
  | ClaudeStreamEventLine
  | ClaudeAssistantLine
  | {
      error?: string;
      message?: string;
      type: string;
    };

function isClaudeStreamEventLine(
  line: ClaudeJsonLine,
): line is ClaudeStreamEventLine {
  return line.type === "stream_event";
}

function isClaudeAssistantLine(line: ClaudeJsonLine): line is ClaudeAssistantLine {
  return line.type === "assistant";
}
