import { describe, expect, it } from "vitest";

import {
  InMemorySessionArchiveRepository,
  type StoredChatMessage,
} from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";
import { SessionService } from "../src/services/session-service.js";

describe("SessionService", () => {
  it("builds prompts from summary and recent messages", async () => {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const service = new SessionService(cache, archive);
    const session = await service.createSession("codex");

    await service.saveSummary(session.id, "The user asks about mobile app planning.");
    await service.appendMessage(session.id, {
      content: "How long does a mobile app take?",
      provider: "codex",
      role: "user",
    });
    await service.appendMessage(session.id, {
      content: "Most projects start with discovery and scope planning.",
      provider: "codex",
      role: "assistant",
    });

    const prompt = await service.buildPrompt({
      latestUserMessage: "What affects the final timeline?",
      recentMessageLimit: 10,
      sessionId: session.id,
      systemPrompt: "You answer customer questions about mobile app projects.",
    });

    expect(prompt).toContain("You answer customer questions about mobile app projects.");
    expect(prompt).toContain("The user asks about mobile app planning.");
    expect(prompt).toContain("How long does a mobile app take?");
    expect(prompt).toContain("What affects the final timeline?");
  });

  it("writes transcript metadata to the archive store", async () => {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const service = new SessionService(cache, archive);
    const session = await service.createSession("codex");

    await service.appendMessage(session.id, {
      content: "Timeline depends on complexity.",
      latencyMs: 2450,
      metadata: {
        finishReason: "completed",
      },
      provider: "codex",
      role: "assistant",
    });

    const storedMessage = archive.messages[0] as StoredChatMessage | undefined;

    expect(storedMessage?.latencyMs).toBe(2450);
    expect(storedMessage?.metadata.finishReason).toBe("completed");
  });
});
