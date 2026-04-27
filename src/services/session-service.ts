import { randomUUID } from "node:crypto";

import type {
  NewChatMessage,
  SessionRecord,
  SessionStatus,
  StoredChatMessage,
  VisitorMetadata,
} from "../domain/chat-session.js";
import { ValidationError } from "../errors.js";
import type { ProviderName } from "../domain/providers.js";
import type { SessionArchiveRepository } from "../repositories/session-archive-repository.js";
import type { SessionCacheRepository } from "../repositories/session-cache-repository.js";

interface BuildPromptInput {
  latestUserMessage?: string;
  recentMessageLimit: number;
  sessionId: string;
  systemPrompt: string;
}

export class SessionService {
  constructor(
    private readonly cacheRepository: SessionCacheRepository,
    private readonly archiveRepository: SessionArchiveRepository,
  ) {}

  async appendMessage(
    sessionId: string,
    message: NewChatMessage,
  ): Promise<StoredChatMessage> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const storedMessage: StoredChatMessage = {
      content: message.content,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      latencyMs: message.latencyMs,
      metadata: message.metadata ?? {},
      provider: message.provider,
      role: message.role,
      sessionId,
    };
    const updatedSession: SessionRecord = {
      ...session,
      lastActivityAt: storedMessage.createdAt,
      messageCount: session.messageCount + 1,
    };

    // Archive first (source of truth) — if Postgres fails, don't pollute Redis cache
    await this.archiveRepository.appendMessage(storedMessage);
    await this.archiveRepository.updateSession(updatedSession);
    // Cache is best-effort — archive already has the data
    try {
      await this.cacheRepository.appendMessage(storedMessage);
      await this.cacheRepository.updateSession(updatedSession);
    } catch (err) {
      console.error(`[session-service] cache write failed for session ${sessionId}:`, err instanceof Error ? err.message : err);
    }

    return storedMessage;
  }

  async buildPrompt(input: BuildPromptInput): Promise<string> {
    const summary = await this.cacheRepository.getSummary(input.sessionId);
    const messages = await this.cacheRepository.listMessages(
      input.sessionId,
      input.recentMessageLimit,
    );
    const sections = [input.systemPrompt];

    if (summary) {
      sections.push(`Session summary:\n${summary}`);
    }

    if (messages.length > 0 || input.latestUserMessage) {
      sections.push("Conversation:");

      for (const message of messages) {
        sections.push(`${capitalizeRole(message.role)}: ${message.content}`);
      }

      if (input.latestUserMessage) {
        sections.push(`User: ${input.latestUserMessage}`);
      }
    }

    return sections.join("\n\n");
  }

  async createSession(provider: ProviderName, id?: string, visitorMetadata?: VisitorMetadata): Promise<SessionRecord> {
    const createdAt = new Date().toISOString();
    const session: SessionRecord = {
      createdAt,
      id: id ?? randomUUID(),
      lastActivityAt: createdAt,
      messageCount: 0,
      provider,
      status: "active",
      summary: null,
      visitorMetadata: visitorMetadata ?? null,
    };

    // Archive first (source of truth)
    await this.archiveRepository.createSession(session);
    try {
      await this.cacheRepository.createSession(session);
    } catch (err) {
      console.error(`[session-service] cache createSession failed for ${session.id}:`, err instanceof Error ? err.message : err);
    }

    return session;
  }

  async countActiveSessionsByProvider(
    providers: ProviderName[],
  ): Promise<Record<ProviderName, number>> {
    return this.cacheRepository.countActiveSessionsByProvider(providers);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.cacheRepository.getSession(id);
  }

  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== "active") {
      throw new ValidationError("Session is no longer active");
    }
    const updated: SessionRecord = { ...session, status };
    await this.archiveRepository.updateSession(updated);
    try {
      await this.cacheRepository.updateSession(updated);
    } catch (err) {
      console.error(`[session] cache update failed for ${sessionId}:`, err);
    }
  }

  async completeIdleSessions(timeoutMs: number): Promise<number> {
    const transitioned = await this.archiveRepository.completeIdleSessions(timeoutMs);
    for (const { id } of transitioned) {
      try {
        const session = await this.cacheRepository.getSession(id);
        if (session) {
          await this.cacheRepository.updateSession({ ...session, status: "completed" });
        }
      } catch (err) {
        console.error(`[session] cache cleanup failed for ${id}:`, err);
      }
    }
    return transitioned.length;
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updatedSession: SessionRecord = {
      ...session,
      summary,
    };

    // Archive first (source of truth)
    await this.archiveRepository.updateSession(updatedSession);
    try {
      await this.cacheRepository.saveSummary(sessionId, summary);
      await this.cacheRepository.updateSession(updatedSession);
    } catch (err) {
      console.error(`[session-service] cache saveSummary failed for session ${sessionId}:`, err instanceof Error ? err.message : err);
    }
  }
}

function capitalizeRole(role: StoredChatMessage["role"]) {
  return role === "assistant" ? "Assistant" : "User";
}
