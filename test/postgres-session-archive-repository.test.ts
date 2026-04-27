import { describe, expect, it } from "vitest";

import { PostgresSessionArchiveRepository } from "../src/repositories/session-archive-repository.js";

class FakePoolClient {
  readonly insertedMessages: unknown[][] = [];
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];

  released = false;

  async query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }> {
    this.queries.push({ text, values });

    if (text.includes("select coalesce(max(seq) + 1, 0) as next_seq")) {
      const sessionId = values?.[0];
      const nextSequence = this.insertedMessages.filter(
        (insertedValues) => insertedValues[1] === sessionId,
      ).length;

      return {
        rows: [{ next_seq: nextSequence }] as unknown as T[],
      };
    }

    if (text.includes("insert into chat_messages")) {
      this.insertedMessages.push(values ?? []);
    }

    return {
      rows: [],
    };
  }

  release() {
    this.released = true;
  }
}

class FakePool {
  readonly client = new FakePoolClient();

  async connect() {
    return this.client;
  }

  async query() {
    return {
      rows: [],
    };
  }
}

describe("PostgresSessionArchiveRepository", () => {
  it("writes deterministic per-session sequence values", async () => {
    const pool = new FakePool();
    const repository = new PostgresSessionArchiveRepository(pool as never);

    await repository.appendMessage({
      content: "First",
      createdAt: "2026-03-13T10:00:00.000Z",
      id: "msg-1",
      metadata: {},
      provider: "codex",
      role: "user",
      sessionId: "session-a",
    });
    await repository.appendMessage({
      content: "Second",
      createdAt: "2026-03-13T10:00:01.000Z",
      id: "msg-2",
      metadata: {},
      provider: "codex",
      role: "assistant",
      sessionId: "session-a",
    });
    await repository.appendMessage({
      content: "Other session",
      createdAt: "2026-03-13T10:00:02.000Z",
      id: "msg-3",
      metadata: {},
      provider: "codex",
      role: "user",
      sessionId: "session-b",
    });

    expect(pool.client.insertedMessages.map((values) => values[2])).toEqual([
      0,
      1,
      0,
    ]);
    expect(pool.client.released).toBe(true);
  });

  it("writes finish reason and error code into dedicated columns", async () => {
    const pool = new FakePool();
    const repository = new PostgresSessionArchiveRepository(pool as never);

    await repository.appendMessage({
      content: "Provider reply",
      createdAt: "2026-03-13T10:00:00.000Z",
      id: "msg-1",
      latencyMs: 45,
      metadata: {
        errorCode: "tool_denied",
        finishReason: "completed",
      },
      provider: "codex",
      role: "assistant",
      sessionId: "session-a",
    });

    expect(pool.client.insertedMessages[0]?.slice(0, 9)).toEqual([
      "msg-1",
      "session-a",
      0,
      "assistant",
      "Provider reply",
      "codex",
      45,
      "completed",
      "tool_denied",
    ]);
    expect(pool.client.insertedMessages[0]?.[9]).toBe(
      JSON.stringify({
        errorCode: "tool_denied",
        finishReason: "completed",
      }),
    );
  });
});
