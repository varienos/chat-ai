import type { Pool, PoolClient } from "pg";

import type { ProviderName } from "../domain/providers.js";
import type { SessionRecord, SessionStatus, StoredChatMessage, VisitorMetadata } from "../domain/chat-session.js";

export interface SessionListFilters {
  from?: Date;
  limit: number;
  page: number;
  provider?: string;
  search?: string;
  sortBy?: "last_activity_at" | "started_at" | "message_count";
  sortOrder?: "asc" | "desc";
  status?: string;
  to?: Date;
}

export interface SessionListResult {
  sessions: SessionRecord[];
  total: number;
}

export interface SessionWithMessages {
  messages: StoredChatMessage[];
  session: SessionRecord;
}

export interface ProviderStats {
  avgLatencyMs: number;
  errorRate: number;
  totalMessages: number;
  totalSessions: number;
}

export interface SessionStats {
  byProvider: Partial<Record<string, ProviderStats>>;
  dailyVolume: Array<{ count: number; date: string; provider: string }>;
}

export interface SessionArchiveRepository {
  appendMessage(message: StoredChatMessage): Promise<void>;
  completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>>;
  createSession(session: SessionRecord): Promise<void>;
  getSessionStats(dateRange?: { from: Date; to: Date }): Promise<SessionStats>;
  getSessionWithMessages(id: string): Promise<SessionWithMessages | null>;
  listSessions(filters: SessionListFilters): Promise<SessionListResult>;
  updateSession(session: SessionRecord): Promise<void>;
}

export class InMemorySessionArchiveRepository implements SessionArchiveRepository {
  readonly messages: StoredChatMessage[] = [];

  readonly sessions = new Map<string, SessionRecord>();

  async appendMessage(message: StoredChatMessage): Promise<void> {
    this.messages.push(message);
  }

  async completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>> {
    const cutoff = Date.now() - timeoutMs;
    const transitioned: Array<{ id: string; provider: string }> = [];
    for (const session of this.sessions.values()) {
      if (session.status === "active" && new Date(session.lastActivityAt).getTime() < cutoff) {
        session.status = "completed";
        transitioned.push({ id: session.id, provider: session.provider });
      }
    }
    return transitioned;
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getSessionStats(
    dateRange?: { from: Date; to: Date },
  ): Promise<SessionStats> {
    let sessions = [...this.sessions.values()];

    if (dateRange) {
      sessions = sessions.filter((s) => {
        const created = new Date(s.createdAt);
        return created >= dateRange.from && created <= dateRange.to;
      });
    }

    const sessionIds = new Set(sessions.map((s) => s.id));

    let filteredMessages = this.messages.filter((m) =>
      sessionIds.has(m.sessionId),
    );

    if (dateRange) {
      filteredMessages = filteredMessages.filter((m) => {
        const created = new Date(m.createdAt);
        return created >= dateRange.from && created <= dateRange.to;
      });
    }

    const byProvider: Partial<Record<string, ProviderStats>> = {};

    for (const session of sessions) {
      const entry = byProvider[session.provider] ?? {
        avgLatencyMs: 0,
        errorRate: 0,
        totalMessages: 0,
        totalSessions: 0,
      };
      entry.totalSessions += 1;
      byProvider[session.provider] = entry;
    }

    for (const message of filteredMessages) {
      const entry = byProvider[message.provider];
      if (entry) {
        entry.totalMessages += 1;
      }
    }

    // Compute avgLatencyMs and errorRate per provider
    for (const provider of Object.keys(byProvider)) {
      const entry = byProvider[provider]!;
      const providerMessages = filteredMessages.filter(
        (m) => m.provider === provider,
      );
      const withLatency = providerMessages.filter(
        (m) => m.latencyMs !== undefined,
      );
      entry.avgLatencyMs =
        withLatency.length > 0
          ? withLatency.reduce((sum, m) => sum + (m.latencyMs ?? 0), 0) /
            withLatency.length
          : 0;

      const errorMessages = providerMessages.filter((m) => {
        const errorCode =
          getStringMetadataValue(m.metadata, "errorCode") ??
          getStringMetadataValue(m.metadata, "error_code");
        return errorCode !== null;
      });
      entry.errorRate =
        providerMessages.length > 0
          ? errorMessages.length / providerMessages.length
          : 0;
    }

    // Compute dailyVolume
    const volumeMap = new Map<string, number>();
    for (const message of filteredMessages) {
      const date = message.createdAt.slice(0, 10);
      const key = `${date}:${message.provider}`;
      volumeMap.set(key, (volumeMap.get(key) ?? 0) + 1);
    }

    const dailyVolume: Array<{ count: number; date: string; provider: string }> =
      [];
    for (const [key, count] of volumeMap) {
      const [date, provider] = key.split(":");
      dailyVolume.push({ count, date, provider });
    }

    dailyVolume.sort((a, b) => a.date.localeCompare(b.date));

    return { byProvider, dailyVolume };
  }

  async getSessionWithMessages(
    id: string,
  ): Promise<SessionWithMessages | null> {
    const session = this.sessions.get(id);
    if (!session) return null;

    const messages = this.messages.filter((m) => m.sessionId === id);
    return { messages, session };
  }

  async listSessions(filters: SessionListFilters): Promise<SessionListResult> {
    let sessions = [...this.sessions.values()];

    // Filter by provider
    if (filters.provider) {
      sessions = sessions.filter((s) => s.provider === filters.provider);
    }

    // Filter by status
    if (filters.status) {
      sessions = sessions.filter((s) => s.status === filters.status);
    }

    // Filter by date range (based on createdAt)
    if (filters.from) {
      const from = filters.from;
      sessions = sessions.filter((s) => new Date(s.createdAt) >= from);
    }
    if (filters.to) {
      const to = filters.to;
      sessions = sessions.filter((s) => new Date(s.createdAt) < to);
    }

    // Search: filter sessions whose messages contain the search term
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchingSessionIds = new Set(
        this.messages
          .filter((m) => m.content.toLowerCase().includes(searchLower))
          .map((m) => m.sessionId),
      );
      sessions = sessions.filter((s) => matchingSessionIds.has(s.id));
    }

    const total = sessions.length;

    // Sort
    const sortBy = filters.sortBy ?? "last_activity_at";
    const sortOrder = filters.sortOrder ?? "desc";
    const multiplier = sortOrder === "asc" ? 1 : -1;

    sessions.sort((a, b) => {
      let comparison: number;
      switch (sortBy) {
        case "last_activity_at":
          comparison = a.lastActivityAt.localeCompare(b.lastActivityAt);
          break;
        case "started_at":
          comparison = a.createdAt.localeCompare(b.createdAt);
          break;
        case "message_count":
          comparison = a.messageCount - b.messageCount;
          break;
        default:
          comparison = 0;
      }
      return comparison * multiplier;
    });

    // Paginate
    const start = (filters.page - 1) * filters.limit;
    const paginated = sessions.slice(start, start + filters.limit);

    return { sessions: paginated, total };
  }

  async updateSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }
}

export class PostgresSessionArchiveRepository
  implements SessionArchiveRepository
{
  constructor(private readonly pool: Pick<Pool, "connect" | "query">) {}

  async appendMessage(message: StoredChatMessage): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        message.sessionId,
      ]);

      const sequenceResult = await client.query<{ next_seq: number }>(
        `
          select coalesce(max(seq) + 1, 0) as next_seq
          from chat_messages
          where session_id = $1
        `,
        [message.sessionId],
      );
      const nextSequence = Number(sequenceResult.rows[0]?.next_seq ?? 0);
      const metadata = extractArchiveMetadata(message.metadata);

      await client.query(
        `
          insert into chat_messages (
            id,
            session_id,
            seq,
            role,
            content,
            provider,
            latency_ms,
            finish_reason,
            error_code,
            metadata_json,
            created_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        `,
        [
          message.id,
          message.sessionId,
          nextSequence,
          message.role,
          message.content,
          message.provider,
          message.latencyMs ?? null,
          metadata.finishReason,
          metadata.errorCode,
          JSON.stringify(message.metadata),
          message.createdAt,
        ],
      );
      await client.query("commit");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>> {
    const result = await this.pool.query<{ id: string; provider: string }>(
      `UPDATE chat_sessions
       SET status = 'completed'
       WHERE status = 'active'
         AND last_activity_at < now() - make_interval(secs => $1::double precision / 1000)
       RETURNING id, provider`,
      [timeoutMs],
    );
    return result.rows;
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `
        insert into chat_sessions (
          id,
          provider,
          status,
          summary,
          started_at,
          last_activity_at,
          message_count,
          visitor_metadata
        ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        on conflict (id) do nothing
      `,
      [
        session.id,
        session.provider,
        session.status,
        session.summary,
        session.createdAt,
        session.lastActivityAt,
        session.messageCount,
        session.visitorMetadata ? JSON.stringify(session.visitorMetadata) : null,
      ],
    );
  }

  async getSessionStats(
    dateRange?: { from: Date; to: Date },
  ): Promise<SessionStats> {
    // --- byProvider ---
    const sessionWhere = dateRange
      ? "WHERE started_at >= $1 AND started_at <= $2"
      : "";
    const sessionParams = dateRange
      ? [dateRange.from.toISOString(), dateRange.to.toISOString()]
      : [];

    const providerResult = await this.pool.query<{
      provider: string;
      total_sessions: string;
      total_messages: string;
      avg_latency: string | null;
      error_rate: string | null;
    }>(
      `
        SELECT
          s.provider,
          COUNT(DISTINCT s.id)::text AS total_sessions,
          COUNT(m.id)::text AS total_messages,
          AVG(m.latency_ms)::text AS avg_latency,
          CASE
            WHEN COUNT(m.id) = 0 THEN '0'
            ELSE (COUNT(m.error_code)::float / COUNT(m.id))::text
          END AS error_rate
        FROM chat_sessions s
        LEFT JOIN chat_messages m ON m.session_id = s.id
        ${sessionWhere}
        GROUP BY s.provider
      `,
      sessionParams,
    );

    const byProvider: Partial<Record<string, ProviderStats>> = {};
    for (const row of providerResult.rows) {
      byProvider[row.provider] = {
        totalSessions: Number(row.total_sessions),
        totalMessages: Number(row.total_messages),
        avgLatencyMs: Number(row.avg_latency ?? 0),
        errorRate: Number(row.error_rate ?? 0),
      };
    }

    // --- dailyVolume ---
    const messageWhere = dateRange
      ? "WHERE m.created_at >= $1 AND m.created_at <= $2"
      : "";
    const messageParams = dateRange
      ? [dateRange.from.toISOString(), dateRange.to.toISOString()]
      : [];

    const volumeResult = await this.pool.query<{
      date: string;
      provider: string;
      count: string;
    }>(
      `
        SELECT
          TO_CHAR(m.created_at, 'YYYY-MM-DD') AS date,
          m.provider,
          COUNT(*)::text AS count
        FROM chat_messages m
        ${messageWhere}
        GROUP BY date, m.provider
        ORDER BY date
      `,
      messageParams,
    );

    const dailyVolume = volumeResult.rows.map((row) => ({
      date: row.date,
      provider: row.provider,
      count: Number(row.count),
    }));

    return { byProvider, dailyVolume };
  }

  async getSessionWithMessages(
    id: string,
  ): Promise<SessionWithMessages | null> {
    const sessionResult = await this.pool.query<{
      id: string;
      provider: string;
      status: string;
      summary: string | null;
      started_at: string;
      last_activity_at: string;
      message_count: number;
      visitor_metadata: VisitorMetadata | null;
    }>(
      "SELECT id, provider, status, summary, started_at, last_activity_at, message_count, visitor_metadata FROM chat_sessions WHERE id = $1",
      [id],
    );

    if (sessionResult.rows.length === 0) return null;

    const row = sessionResult.rows[0];
    const session: SessionRecord = {
      id: row.id,
      provider: row.provider as ProviderName,
      status: row.status as SessionStatus,
      summary: row.summary,
      createdAt: new Date(row.started_at).toISOString(),
      lastActivityAt: new Date(row.last_activity_at).toISOString(),
      messageCount: row.message_count,
      visitorMetadata: row.visitor_metadata ?? null,
    };

    const messagesResult = await this.pool.query<{
      id: string;
      session_id: string;
      role: string;
      content: string;
      provider: string;
      latency_ms: number | null;
      metadata_json: Record<string, unknown> | null;
      created_at: string;
    }>(
      "SELECT id, session_id, role, content, provider, latency_ms, metadata_json, created_at FROM chat_messages WHERE session_id = $1 ORDER BY seq, created_at",
      [id],
    );

    const messages: StoredChatMessage[] = messagesResult.rows.map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role as "user" | "assistant",
      content: m.content,
      provider: m.provider as ProviderName,
      latencyMs: m.latency_ms ?? undefined,
      metadata: m.metadata_json ?? {},
      createdAt: new Date(m.created_at).toISOString(),
    }));

    return { session, messages };
  }

  async listSessions(
    filters: SessionListFilters,
  ): Promise<SessionListResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.provider) {
      conditions.push(`provider = $${paramIdx++}`);
      params.push(filters.provider);
    }
    if (filters.from) {
      conditions.push(`started_at >= $${paramIdx++}`);
      params.push(filters.from.toISOString());
    }
    if (filters.to) {
      conditions.push(`started_at < $${paramIdx++}`);
      params.push(filters.to.toISOString());
    }
    if (filters.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }
    if (filters.search) {
      const escaped = filters.search.replace(/[%_\\]/g, (ch) => `\\${ch}`);
      conditions.push(`id IN (SELECT DISTINCT session_id FROM chat_messages WHERE content ILIKE $${paramIdx++})`);
      params.push(`%${escaped}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count total
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM chat_sessions ${whereClause}`,
      params,
    );
    const total = Number(countResult.rows[0].total);

    // Sort
    const SORT_COLUMNS: Record<string, string> = {
      last_activity_at: "last_activity_at",
      started_at: "started_at",
      message_count: "message_count",
    };
    const sortColumn = SORT_COLUMNS[filters.sortBy ?? "last_activity_at"] ?? "last_activity_at";
    const sortDir = filters.sortOrder === "asc" ? "ASC" : "DESC";

    // Paginate
    const offset = (filters.page - 1) * filters.limit;
    const dataParams = [...params, filters.limit, offset];
    const limitParam = `$${paramIdx++}`;
    const offsetParam = `$${paramIdx++}`;

    const dataResult = await this.pool.query<{
      id: string;
      provider: string;
      status: string;
      summary: string | null;
      started_at: string;
      last_activity_at: string;
      message_count: number;
      visitor_metadata: VisitorMetadata | null;
    }>(
      `SELECT id, provider, status, summary, started_at, last_activity_at, message_count, visitor_metadata
       FROM chat_sessions ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      dataParams,
    );

    const sessions: SessionRecord[] = dataResult.rows.map((row) => ({
      id: row.id,
      provider: row.provider as ProviderName,
      status: row.status as SessionStatus,
      summary: row.summary,
      createdAt: new Date(row.started_at).toISOString(),
      lastActivityAt: new Date(row.last_activity_at).toISOString(),
      messageCount: row.message_count,
      visitorMetadata: row.visitor_metadata ?? null,
    }));

    return { sessions, total };
  }

  async updateSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `
        update chat_sessions
        set
          provider = $2,
          status = $3,
          summary = $4,
          last_activity_at = $5,
          message_count = $6,
          visitor_metadata = $7::jsonb
        where id = $1
      `,
      [
        session.id,
        session.provider,
        session.status,
        session.summary,
        session.lastActivityAt,
        session.messageCount,
        session.visitorMetadata ? JSON.stringify(session.visitorMetadata) : null,
      ],
    );
  }
}

function extractArchiveMetadata(metadata: Record<string, unknown>) {
  return {
    errorCode:
      getStringMetadataValue(metadata, "errorCode") ??
      getStringMetadataValue(metadata, "error_code"),
    finishReason:
      getStringMetadataValue(metadata, "finishReason") ??
      getStringMetadataValue(metadata, "finish_reason"),
  };
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

async function rollbackQuietly(client: Pick<PoolClient, "query">) {
  try {
    await client.query("rollback");
  } catch (rollbackError) {
    console.error("[postgres] rollback failed (original error preserved):", rollbackError);
  }
}

export type { StoredChatMessage } from "../domain/chat-session.js";
