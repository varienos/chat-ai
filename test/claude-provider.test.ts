import { describe, expect, it } from "vitest";

import { TimeoutError } from "../src/errors.js";
import {
  ClaudeProvider,
  buildClaudePrintArgs,
} from "../src/providers/claude/claude-provider.js";
import { FakeProcessRunner } from "./support/fake-process-runner.js";

describe("ClaudeProvider", () => {
  it("builds print args in tool-disabled plan mode", () => {
    expect(
      buildClaudePrintArgs({
        includePartialMessages: true,
        outputFormat: "stream-json",
        permissionMode: "plan",
        prompt: "hello",
      }),
    ).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--permission-mode",
      "plan",
      "--tools",
      "",
      "--no-session-persistence",
      "--include-partial-messages",
      "--",
      "hello",
    ]);
  });

  it("accepts only first-party OAuth auth status", async () => {
    const originalEnv = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      API_AUTH_TOKEN: process.env.API_AUTH_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
      DECK_ADMIN_PASSWORD: process.env.DECK_ADMIN_PASSWORD,
      DECK_JWT_SECRET: process.env.DECK_JWT_SECRET,
      REDIS_URL: process.env.REDIS_URL,
    };
    process.env.ANTHROPIC_API_KEY = "anthropic-parent-key";
    process.env.API_AUTH_TOKEN = "gateway-secret";
    process.env.DATABASE_URL = "postgres://user:password@example.test/db";
    process.env.DECK_ADMIN_PASSWORD = "deck-password";
    process.env.DECK_JWT_SECRET = "deck-jwt-secret";
    process.env.REDIS_URL = "redis://cache.example.test:6379";

    const runner = new FakeProcessRunner([
      {
        durationMs: 5,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: JSON.stringify({
          apiProvider: "firstParty",
          authMethod: "claude.ai",
          loggedIn: true,
        }),
        timedOut: false,
      },
    ]);
    const provider = new ClaudeProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    try {
      await expect(provider.checkLoginStatus()).resolves.toEqual({
        authenticated: true,
        mode: "oauth",
        provider: "claude",
      });
      expect(runner.executions[0]?.env?.ANTHROPIC_API_KEY).toBeUndefined();
      expect(runner.executions[0]?.env?.API_AUTH_TOKEN).toBeUndefined();
      expect(runner.executions[0]?.env?.DATABASE_URL).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_ADMIN_PASSWORD).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_JWT_SECRET).toBeUndefined();
      expect(runner.executions[0]?.env?.REDIS_URL).toBeUndefined();
    } finally {
      restoreEnv(originalEnv);
    }
  });

  it("rejects non-oauth Claude auth states", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 5,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: JSON.stringify({
          apiProvider: "api",
          authMethod: "api_key",
          loggedIn: true,
        }),
        timedOut: false,
      },
    ]);
    const provider = new ClaudeProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    await expect(provider.checkLoginStatus()).resolves.toEqual({
      authenticated: false,
      mode: "oauth",
      provider: "claude",
    });
  });

  it("parses Claude stream-json output with noisy hook lines", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 18,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          '{"type":"system","subtype":"hook_started","session_id":"ses_123"}',
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Merhaba"}}}',
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" dunya"}}}',
          '{"type":"assistant","message":{"content":[{"type":"text","text":"Merhaba dunya"}],"usage":{"output_tokens":2}}}',
          '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}}',
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new ClaudeProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    const result = await provider.chat({
      prompt: "Selam ver",
      sessionId: "ses_123",
    });

    expect(result.content).toBe("Merhaba dunya");
    expect(result.finishReason).toBe("end_turn");
    expect(result.metadata).toMatchObject({
      durationMs: 18,
      usage: {
        output_tokens: 2,
      },
    });
  });

  it("emits assistant delta events during Claude streaming", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 18,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Merhaba"}}}',
          '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" dunya"}}}',
          '{"type":"assistant","message":{"content":[{"type":"text","text":"Merhaba dunya"}]}}',
          '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"}}}',
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new ClaudeProvider({
      runner,
      workingDirectory: process.cwd(),
    });
    const seenChunks: string[] = [];

    const result = await provider.chatStream(
      {
        prompt: "Selam ver",
        sessionId: "ses_123",
      },
      (event) => {
        if (event.type === "assistant.delta") {
          seenChunks.push(event.chunk);
        }
      },
    );

    expect(seenChunks).toEqual(["Merhaba", " dunya"]);
    expect(result.content).toBe("Merhaba dunya");
  });

  it("raises a timeout error when Claude does not finish in time", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 61_000,
        exitCode: null,
        signal: "SIGKILL",
        stderr: "",
        stdout: "",
        timedOut: true,
      },
    ]);
    const provider = new ClaudeProvider({
      runner,
      timeoutMs: 50,
      workingDirectory: process.cwd(),
    });

    await expect(
      provider.chat({
        prompt: "Cevap ver",
        sessionId: "ses_123",
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

function restoreEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}
