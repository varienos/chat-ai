import type { ProviderName } from "../domain/providers.js";
import type { SessionRecord, StoredChatMessage } from "../domain/chat-session.js";
import type { RedisClient } from "../lib/redis.js";

export interface SessionCacheRepository {
  appendMessage(message: StoredChatMessage): Promise<void>;
  countActiveSessionsByProvider(
    providers: ProviderName[],
  ): Promise<Record<ProviderName, number>>;
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  getSummary(sessionId: string): Promise<string | null>;
  listMessages(sessionId: string, limit: number): Promise<StoredChatMessage[]>;
  saveSummary(sessionId: string, summary: string): Promise<void>;
  updateSession(session: SessionRecord): Promise<void>;
}

export class InMemorySessionCacheRepository implements SessionCacheRepository {
  private readonly messages = new Map<string, StoredChatMessage[]>();

  private readonly sessions = new Map<string, SessionRecord>();

  async appendMessage(message: StoredChatMessage): Promise<void> {
    const sessionMessages = this.messages.get(message.sessionId) ?? [];
    sessionMessages.push(message);
    this.messages.set(message.sessionId, sessionMessages);
  }

  async countActiveSessionsByProvider(
    providers: ProviderName[],
  ): Promise<Record<ProviderName, number>> {
    const counts = createEmptyCounts(providers);

    for (const session of this.sessions.values()) {
      if (session.status === "active") {
        counts[session.provider] += 1;
      }
    }

    return counts;
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.sessions.get(id) ?? null;
  }

  async getSummary(sessionId: string): Promise<string | null> {
    return this.sessions.get(sessionId)?.summary ?? null;
  }

  async listMessages(
    sessionId: string,
    limit: number,
  ): Promise<StoredChatMessage[]> {
    const messages = this.messages.get(sessionId) ?? [];

    return messages.slice(-limit);
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    this.sessions.set(sessionId, {
      ...session,
      summary,
    });
  }

  async updateSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }
}

const MAX_CACHED_MESSAGES = 200;

export class RedisSessionCacheRepository implements SessionCacheRepository {
  constructor(private readonly client: RedisClient) {}

  async appendMessage(message: StoredChatMessage): Promise<void> {
    const key = getMessageKey(message.sessionId);
    await this.client.rPush(key, JSON.stringify(message));
    try {
      await this.client.lTrim(key, -MAX_CACHED_MESSAGES, -1);
    } catch {
      // lTrim is housekeeping; rPush already succeeded
    }
  }

  async countActiveSessionsByProvider(
    providers: ProviderName[],
  ): Promise<Record<ProviderName, number>> {
    const counts = createEmptyCounts(providers);
    const sizes = await Promise.all(
      providers.map(async (provider) => ({
        count: await this.client.sCard(getActiveProviderKey(provider)),
        provider,
      })),
    );

    for (const { count, provider } of sizes) {
      counts[provider] = count;
    }

    return counts;
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.client.hSet(getMetaKey(session.id), serializeSession(session));
    await syncActiveSessionIndex(this.client, session);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const values = await this.client.hGetAll(getMetaKey(id));

    if (Object.keys(values).length === 0) {
      return null;
    }

    return deserializeSession(values);
  }

  async getSummary(sessionId: string): Promise<string | null> {
    return this.client.get(getSummaryKey(sessionId));
  }

  async listMessages(
    sessionId: string,
    limit: number,
  ): Promise<StoredChatMessage[]> {
    const values = await this.client.lRange(getMessageKey(sessionId), -limit, -1);

    return values.map((value) => JSON.parse(value) as StoredChatMessage);
  }

  async saveSummary(sessionId: string, summary: string): Promise<void> {
    await this.client.set(getSummaryKey(sessionId), summary);

    const session = await this.getSession(sessionId);

    if (session) {
      await this.updateSession({
        ...session,
        summary,
      });
    }
  }

  async updateSession(session: SessionRecord): Promise<void> {
    const previousValues = await this.client.hGetAll(getMetaKey(session.id));
    const previousSession =
      Object.keys(previousValues).length > 0
        ? deserializeSession(previousValues)
        : null;

    await this.client.hSet(getMetaKey(session.id), serializeSession(session));
    await syncActiveSessionIndex(this.client, session, previousSession);
  }
}

function getMessageKey(sessionId: string) {
  return `session:${sessionId}:messages`;
}

function getMetaKey(sessionId: string) {
  return `session:${sessionId}:meta`;
}

function getSummaryKey(sessionId: string) {
  return `session:${sessionId}:summary`;
}

function getActiveProviderKey(provider: ProviderName) {
  return `sessions:active:${provider}`;
}

function serializeSession(session: SessionRecord) {
  return {
    createdAt: session.createdAt,
    id: session.id,
    lastActivityAt: session.lastActivityAt,
    messageCount: session.messageCount.toString(),
    provider: session.provider,
    status: session.status,
    summary: session.summary ?? "",
    visitorMetadata: session.visitorMetadata ? JSON.stringify(session.visitorMetadata) : "",
  };
}

function deserializeSession(value: Record<string, string>): SessionRecord {
  return {
    createdAt: value.createdAt,
    id: value.id,
    lastActivityAt: value.lastActivityAt,
    messageCount: Number.parseInt(value.messageCount, 10),
    provider: value.provider as SessionRecord["provider"],
    status: (value.status as SessionRecord["status"]) ?? "active",
    summary: value.summary || null,
    visitorMetadata: parseVisitorMetadata(value.visitorMetadata),
  };
}

async function syncActiveSessionIndex(
  client: RedisClient,
  session: SessionRecord,
  previousSession?: SessionRecord | null,
) {
  if (previousSession?.status === "active") {
    await client.sRem(getActiveProviderKey(previousSession.provider), session.id);
  }

  if (session.status === "active") {
    await client.sAdd(getActiveProviderKey(session.provider), session.id);
  }
}

function parseVisitorMetadata(raw: string | undefined): SessionRecord["visitorMetadata"] {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("[session-cache] corrupted visitorMetadata JSON in Redis, treating as null");
    return null;
  }
}

function createEmptyCounts(providers: ProviderName[]) {
  return providers.reduce(
    (counts, provider) => ({
      ...counts,
      [provider]: 0,
    }),
    {} as Record<ProviderName, number>,
  );
}
