import { describe, expect, it } from "vitest";
import { ChatService } from "../src/services/chat-service.js";
import { SessionService } from "../src/services/session-service.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";
import { ValidationError } from "../src/errors.js";
import type { ProviderRegistry } from "../src/providers/provider-registry.js";

describe("chat service session status guard", () => {
  it("rejects chat on completed session", async () => {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const sessionService = new SessionService(cache, archive);
    const session = await sessionService.createSession("codex");
    await sessionService.updateSessionStatus(session.id, "completed");

    const chatService = new ChatService(sessionService, {} as ProviderRegistry, {
      getConfig: async () => ({ systemPrompt: "", recentMessageLimit: 10, knowledgeBase: { path: "/tmp/kb-test-status", maxChars: 50000 } }),
    });

    await expect(
      chatService.chat({ sessionId: session.id, message: "hello" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects chat on error session", async () => {
    const cache = new InMemorySessionCacheRepository();
    const archive = new InMemorySessionArchiveRepository();
    const sessionService = new SessionService(cache, archive);
    const session = await sessionService.createSession("codex");
    await sessionService.updateSessionStatus(session.id, "error");

    const chatService = new ChatService(sessionService, {} as ProviderRegistry, {
      getConfig: async () => ({ systemPrompt: "", recentMessageLimit: 10, knowledgeBase: { path: "/tmp/kb-test-status", maxChars: 50000 } }),
    });

    await expect(
      chatService.chat({ sessionId: session.id, message: "hello" })
    ).rejects.toThrow("Session is no longer active");
  });
});
