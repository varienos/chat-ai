import { describe, expect, it, vi } from "vitest";

import { applyPostgresSchema } from "../src/storage/postgres-schema.js";

describe("Postgres schema bootstrap", () => {
  it("applies the transcript schema SQL through the provided database connection", async () => {
    const query = vi.fn().mockResolvedValue(undefined);

    await applyPostgresSchema({
      query,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain(
      "create table if not exists chat_sessions",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "create table if not exists chat_messages",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "create unique index if not exists chat_messages_session_seq_idx",
    );
    expect(query.mock.calls[1]?.[0]).toContain(
      "visitor_metadata",
    );
  });
});
