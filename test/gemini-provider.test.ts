import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TimeoutError } from "../src/errors.js";
import {
  GeminiProvider,
  buildGeminiExecArgs,
} from "../src/providers/gemini/gemini-provider.js";
import { FakeProcessRunner } from "./support/fake-process-runner.js";

describe("GeminiProvider", () => {
  it("builds headless args in plan mode", () => {
    expect(
      buildGeminiExecArgs({
        approvalMode: "plan",
        outputFormat: "stream-json",
        prompt: "hello",
        sandbox: false,
      }),
    ).toEqual([
      "-p",
      "hello",
      "--output-format",
      "stream-json",
      "--approval-mode",
      "plan",
      "--sandbox=false",
    ]);
  });

  it("reports login status from the Gemini OAuth settings file", async () => {
    const settingsPath = path.join(
      mkdtempSync(path.join(tmpdir(), "gemini-settings-")),
      "settings.json",
    );
    writeFileSync(
      settingsPath,
      JSON.stringify({
        security: {
          auth: {
            selectedType: "google",
          },
        },
      }),
    );
    const runner = new FakeProcessRunner([]);
    const provider = new GeminiProvider({
      runner,
      settingsPath,
      workingDirectory: process.cwd(),
    });

    await expect(provider.checkLoginStatus()).resolves.toEqual({
      authenticated: true,
      mode: "oauth",
      provider: "gemini",
    });
    expect(runner.executions).toHaveLength(0);
  });

  it("treats non-google auth selections as unauthenticated", async () => {
    const settingsPath = path.join(
      mkdtempSync(path.join(tmpdir(), "gemini-settings-")),
      "settings.json",
    );
    writeFileSync(
      settingsPath,
      JSON.stringify({
        security: {
          auth: {
            selectedType: "api-key",
          },
        },
      }),
    );
    const runner = new FakeProcessRunner([]);
    const provider = new GeminiProvider({
      runner,
      settingsPath,
      workingDirectory: process.cwd(),
    });

    await expect(provider.checkLoginStatus()).resolves.toEqual({
      authenticated: false,
      mode: "oauth",
      provider: "gemini",
    });
  });

  it("parses stream-json chat output and usage", async () => {
    const originalEnv = {
      API_AUTH_TOKEN: process.env.API_AUTH_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
      DECK_ADMIN_PASSWORD: process.env.DECK_ADMIN_PASSWORD,
      DECK_JWT_SECRET: process.env.DECK_JWT_SECRET,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      REDIS_URL: process.env.REDIS_URL,
    };
    process.env.API_AUTH_TOKEN = "gateway-secret";
    process.env.DATABASE_URL = "postgres://user:password@example.test/db";
    process.env.DECK_ADMIN_PASSWORD = "deck-password";
    process.env.DECK_JWT_SECRET = "deck-jwt-secret";
    process.env.GEMINI_API_KEY = "gemini-parent-key";
    process.env.GOOGLE_API_KEY = "google-parent-key";
    process.env.REDIS_URL = "redis://cache.example.test:6379";

    const runner = new FakeProcessRunner([
      {
        durationMs: 25,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          "Loaded cached credentials.",
          '{"type":"message","role":"assistant","content":"Merhaba","delta":true}',
          '{"type":"message","role":"assistant","content":" dunya","delta":true}',
          '{"type":"result","status":"success","stats":{"duration_ms":25,"output_tokens":2}}',
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new GeminiProvider({
      runner,
      workingDirectory: process.cwd(),
    });

    try {
      const result = await provider.chat({
        prompt: "Selam ver",
        sessionId: "ses_123",
      });

      expect(result.content).toBe("Merhaba dunya");
      expect(result.finishReason).toBe("completed");
      expect(result.metadata).toMatchObject({
        durationMs: 25,
        stats: {
          duration_ms: 25,
          output_tokens: 2,
        },
      });
      expect(runner.executions[0]?.env?.API_AUTH_TOKEN).toBeUndefined();
      expect(runner.executions[0]?.env?.DATABASE_URL).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_ADMIN_PASSWORD).toBeUndefined();
      expect(runner.executions[0]?.env?.DECK_JWT_SECRET).toBeUndefined();
      expect(runner.executions[0]?.env?.GEMINI_API_KEY).toBeUndefined();
      expect(runner.executions[0]?.env?.GOOGLE_API_KEY).toBeUndefined();
      expect(runner.executions[0]?.env?.REDIS_URL).toBeUndefined();
    } finally {
      restoreEnv(originalEnv);
    }
  });

  it("emits assistant delta events during Gemini streaming", async () => {
    const runner = new FakeProcessRunner([
      {
        durationMs: 16,
        exitCode: 0,
        signal: null,
        stderr: "",
        stdout: [
          '{"type":"init","session_id":"ses_123"}',
          '{"type":"message","role":"assistant","content":"Merhaba","delta":true}',
          '{"type":"message","role":"assistant","content":" dunya","delta":true}',
          '{"type":"result","status":"success","stats":{"duration_ms":16}}',
        ].join("\n"),
        timedOut: false,
      },
    ]);
    const provider = new GeminiProvider({
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

  it("raises a timeout error when Gemini does not finish in time", async () => {
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
    const provider = new GeminiProvider({
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
