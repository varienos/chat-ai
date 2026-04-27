import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexProvider, buildCodexExecArgs } from "../src/providers/codex/codex-provider.js";
import { FakeProcessRunner } from "./support/fake-process-runner.js";

describe("CodexProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds codex exec args for JSON mode", () => {
    expect(
      buildCodexExecArgs({
        prompt: "hello",
        sandbox: "read-only",
        skipGitRepoCheck: true,
      }),
    ).toEqual(["exec", "--json", "-s", "read-only", "--skip-git-repo-check", "--", "hello"]);
  });

  it("builds codex exec args with explicit model", () => {
    expect(
      buildCodexExecArgs({
        model: "gpt-5.4",
        prompt: "hello",
        sandbox: "read-only",
        skipGitRepoCheck: true,
      }),
    ).toEqual(["exec", "--json", "-s", "read-only", "-m", "gpt-5.4", "--skip-git-repo-check", "--", "hello"]);
  });

  it("reports login status without exposing secrets", async () => {
    const originalEnv = {
      API_AUTH_TOKEN: process.env.API_AUTH_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
      DECK_ADMIN_PASSWORD: process.env.DECK_ADMIN_PASSWORD,
      DECK_JWT_SECRET: process.env.DECK_JWT_SECRET,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      REDIS_URL: process.env.REDIS_URL,
    };
    process.env.API_AUTH_TOKEN = "gateway-secret";
    process.env.DATABASE_URL = "postgres://user:password@example.test/db";
    process.env.DECK_ADMIN_PASSWORD = "deck-password";
    process.env.DECK_JWT_SECRET = "deck-jwt-secret";
    process.env.OPENAI_API_KEY = "sk-parent-openai";
    process.env.REDIS_URL = "redis://cache.example.test:6379";

    const runner = new FakeProcessRunner([
      {
        durationMs: 5,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: "Logged in using ChatGPT",
        timedOut: false,
      },
    ]);
    const provider = new CodexProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    try {
      await expect(provider.checkLoginStatus()).resolves.toEqual({
        authenticated: true,
        mode: "oauth",
        provider: "codex",
      });
      expect(runner.executions[0]?.env?.API_AUTH_TOKEN).toBeUndefined();
      expect(runner.executions[0]?.env?.DATABASE_URL).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_ADMIN_PASSWORD).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_JWT_SECRET).toBeUndefined();
      expect(runner.executions[0]?.env?.OPENAI_API_KEY).toBeUndefined();
      expect(runner.executions[0]?.env?.REDIS_URL).toBeUndefined();
    } finally {
      restoreEnv(originalEnv);
    }
  });

  it("reports api_key mode when configured with an OpenAI API key", async () => {
    const runner = new FakeProcessRunner([]);
    const provider = new CodexProvider({
      apiKey: "sk-test",
      authMode: "api_key",
      runner,
      workingDirectory: process.cwd(),
    });

    await expect(provider.checkLoginStatus()).resolves.toEqual({
      authenticated: true,
      mode: "api_key",
      provider: "codex",
    });
    expect(runner.executions).toHaveLength(0);
  });

  it("uses OpenAI Responses API instead of Codex CLI in api_key mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "resp_123",
          output_text: "hello",
          status: "completed",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const runner = new FakeProcessRunner([]);
    const provider = new CodexProvider({
      apiKey: "sk-test",
      authMode: "api_key",
      runner,
      workingDirectory: process.cwd(),
    });

    const result = await provider.chat({
      prompt: "Say hello",
      sessionId: "ses_123",
    });

    expect(result.content).toBe("hello");
    expect(result.metadata.responseId).toBe("resp_123");
    expect(runner.executions).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body))).toEqual({
      input: "Say hello",
      model: "gpt-5.4",
    });
  });

  it("uses runtime Codex settings from Deck overrides", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: "runtime hello",
          status: "completed",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const runner = new FakeProcessRunner([]);
    const provider = new CodexProvider({
      authMode: "oauth",
      getRuntimeOptions: async () => ({
        apiKey: "sk-runtime",
        authMode: "api_key",
        model: "gpt-4.1-mini",
      }),
      runner,
      workingDirectory: process.cwd(),
    });

    await expect(provider.checkLoginStatus()).resolves.toEqual({
      authenticated: true,
      mode: "api_key",
      provider: "codex",
    });
    const result = await provider.chat({
      prompt: "Say hello",
      sessionId: "ses_123",
    });

    expect(result.content).toBe("runtime hello");
    expect(runner.executions).toHaveLength(0);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-runtime");
    expect(JSON.parse(String(init.body))).toEqual({
      input: "Say hello",
      model: "gpt-4.1-mini",
    });
  });

  it("maps OpenAI API 429 responses to a rate limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "quota exceeded",
            },
          }),
          { status: 429 },
        ),
      ),
    );
    const provider = new CodexProvider({
      apiKey: "sk-test",
      authMode: "api_key",
      runner: new FakeProcessRunner([]),
      workingDirectory: process.cwd(),
    });

    await expect(
      provider.chat({
        prompt: "Say hello",
        sessionId: "ses_123",
      }),
    ).rejects.toMatchObject({
      message: "Assistant request limit exceeded",
      name: "RateLimitError",
    });
  });

  it("parses the final assistant message from JSONL output", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 12,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          "{\"type\":\"thread.started\",\"thread_id\":\"thread_1\"}",
          "{\"type\":\"turn.started\"}",
          "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"hello\"}}",
          "{\"type\":\"turn.completed\",\"usage\":{\"input_tokens\":10,\"output_tokens\":3}}",
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new CodexProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    const result = await provider.chat({
      prompt: "Say hello",
      sessionId: "ses_123",
    });

    expect(result.content).toBe("hello");
    expect(result.finishReason).toBe("completed");
  });

  it("emits assistant delta events during chatStream", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 12,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          "{\"type\":\"thread.started\",\"thread_id\":\"thread_1\"}",
          "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"hello\"}}",
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new CodexProvider({
      runner,
      workingDirectory: process.cwd(),
    });
    const seenChunks: string[] = [];

    const result = await provider.chatStream(
      {
        prompt: "Say hello",
        sessionId: "ses_123",
      },
      (event) => {
        if (event.type === "assistant.delta") {
          seenChunks.push(event.chunk);
        }
      },
    );

    expect(seenChunks).toEqual(["hello"]);
    expect(result.content).toBe("hello");
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
