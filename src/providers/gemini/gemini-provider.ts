import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

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

export type GeminiApprovalMode = "auto_edit" | "default" | "plan" | "yolo";

interface GeminiProviderOptions {
  approvalMode?: GeminiApprovalMode;
  binaryPath?: string;
  model?: string;
  runner: ProcessRunner;
  sandbox?: boolean;
  settingsPath?: string;
  timeoutMs?: number;
  workingDirectory: string;
}

type GeminiOutputFormat = "json" | "stream-json";

interface GeminiRuntimeState {
  finalContent: string;
  finishReason: string;
  stats?: Record<string, unknown>;
  streamedContent: string;
}

const GEMINI_OAUTH_SETTINGS_PATH = path.join(
  homedir(),
  ".gemini",
  "settings.json",
);
const GEMINI_BLOCKED_ENV_KEYS = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];

export class GeminiProvider implements LlmProvider {
  private readonly approvalMode: GeminiApprovalMode;
  private readonly binaryPath: string;
  private readonly sandbox: boolean;
  private readonly settingsPath: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: GeminiProviderOptions) {
    this.approvalMode = options.approvalMode ?? "plan";
    this.binaryPath = options.binaryPath ?? "gemini";
    this.sandbox = options.sandbox ?? false;
    this.settingsPath = options.settingsPath ?? GEMINI_OAUTH_SETTINGS_PATH;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  getDefinition(): ProviderDefinition {
    return {
      enabled: true,
      name: "gemini",
    };
  }

  async checkLoginStatus(): Promise<ProviderLoginStatus> {
    return {
      authenticated: await hasGeminiOauthSelection(this.settingsPath),
      mode: "oauth",
      provider: "gemini",
    };
  }

  async chat(request: ChatRequest): Promise<ChatCompletion> {
    return this.runGeminiCommand(request);
  }

  async chatStream(
    request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    return this.runGeminiCommand(request, onEvent);
  }

  private async runGeminiCommand(
    request: ChatRequest,
    onEvent?: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    const state: GeminiRuntimeState = {
      finalContent: "",
      finishReason: "completed",
      streamedContent: "",
    };
    const result = await this.options.runner.run({
      args: buildGeminiExecArgs({
        approvalMode: this.approvalMode,
        model: this.options.model,
        outputFormat: "stream-json",
        prompt: request.prompt,
        sandbox: this.sandbox,
      }),
      command: this.binaryPath,
      cwd: this.options.workingDirectory,
      env: buildOauthOnlyEnvironment(GEMINI_BLOCKED_ENV_KEYS),
      onStdoutLine: async (line) => {
        const parsedLine = parseGeminiJsonLine(line);

        if (!parsedLine) {
          return;
        }

        if (
          isGeminiMessageLine(parsedLine) &&
          parsedLine.role === "assistant" &&
          typeof parsedLine.content === "string"
        ) {
          if (parsedLine.delta) {
            state.streamedContent += parsedLine.content;

            if (onEvent) {
              await onEvent({
                chunk: parsedLine.content,
                type: "assistant.delta",
              });
            }
          } else {
            state.finalContent = parsedLine.content;
          }
        }

        if (isGeminiResultLine(parsedLine)) {
          state.finishReason =
            parsedLine.status === "success" ? "completed" : parsedLine.status;
          state.stats = parsedLine.stats;
        }
      },
      timeoutMs: this.timeoutMs,
    });

    if (result.timedOut) {
      throw new TimeoutError("Assistant request timed out");
    }

    if (result.exitCode !== 0) {
      const errMsg = extractGeminiErrorMessage(result.stdout, result.stderr);
      console.error("[assistant] backend command failed");
      const lower = (result.stderr ?? "").toLowerCase();
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
        ...(state.stats ? { stats: state.stats } : {}),
      },
      provider: "gemini",
    };
  }
}

export function buildGeminiExecArgs(options: {
  approvalMode: GeminiApprovalMode;
  model?: string;
  outputFormat: GeminiOutputFormat;
  prompt: string;
  sandbox: boolean;
}) {
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    options.outputFormat,
    "--approval-mode",
    options.approvalMode,
    `--sandbox=${options.sandbox ? "true" : "false"}`,
  ];

  if (options.model) {
    args.push("--model", options.model);
  }

  return args;
}

function parseGeminiJsonLine(line: string): GeminiJsonLine | null {
  const trimmedLine = line.trim();

  if (!trimmedLine.startsWith("{")) {
    return null;
  }

  try {
    return JSON.parse(trimmedLine) as GeminiJsonLine;
  } catch {
    return null;
  }
}

function extractGeminiErrorMessage(stdout: string, stderr: string) {
  const messages = [stderr, stdout]
    .flatMap((output) => output.split("\n"))
    .map((line) => parseGeminiJsonLine(line))
    .filter((line): line is GeminiJsonLine => line !== null)
    .map((line) => {
      if (typeof line.message === "string") {
        return line.message;
      }

      if (typeof line.error === "string") {
        return line.error;
      }

      if (isGeminiResultLine(line) && line.status !== "success") {
        return `Gemini request failed with status: ${line.status}`;
      }

      return null;
    })
    .filter((message): message is string => Boolean(message));

  return messages[0] || stderr.trim() || stdout.trim() || "Gemini command failed";
}

async function hasGeminiOauthSelection(settingsPath: string) {
  try {
    const rawSettings = await readFile(settingsPath, "utf8");
    const parsedSettings = JSON.parse(rawSettings) as {
      security?: {
        auth?: {
          selectedType?: unknown;
        };
      };
    };

    return parsedSettings.security?.auth?.selectedType === "google";
  } catch {
    return false;
  }
}

type GeminiMessageLine = {
  content?: string;
  delta?: boolean;
  error?: string;
  message?: string;
  role?: string;
  type: "message";
};

type GeminiResultLine = {
  error?: string;
  message?: string;
  stats?: Record<string, unknown>;
  status: string;
  type: "result";
};

type GeminiJsonLine =
  | GeminiMessageLine
  | GeminiResultLine
  | {
      error?: string;
      message?: string;
      type: string;
    };

function isGeminiMessageLine(line: GeminiJsonLine): line is GeminiMessageLine {
  return line.type === "message";
}

function isGeminiResultLine(line: GeminiJsonLine): line is GeminiResultLine {
  return line.type === "result";
}
