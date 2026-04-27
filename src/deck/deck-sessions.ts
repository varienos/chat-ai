import type { FastifyRequest, FastifyReply } from "fastify";
import type { SessionArchiveRepository } from "../repositories/session-archive-repository.js";

function parsePositiveInt(raw: string | undefined, defaultVal: number, min: number, max: number): number | null {
  if (raw === undefined) return defaultVal;
  const num = parseInt(raw, 10);
  if (Number.isNaN(num) || num < min || num > max) return null;
  return num;
}

function isValidISODate(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export function createSessionListHandler(repo: SessionArchiveRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;

    const page = parsePositiveInt(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    if (page === null) {
      reply.code(400).send({ message: "page must be a positive integer" });
      return;
    }
    const limit = parsePositiveInt(query.limit, 20, 1, 100);
    if (limit === null) {
      reply.code(400).send({ message: "limit must be an integer between 1 and 100" });
      return;
    }
    if (query.from && !isValidISODate(query.from)) {
      reply.code(400).send({ message: "from must be a valid ISO date string" });
      return;
    }
    if (query.to && !isValidISODate(query.to)) {
      reply.code(400).send({ message: "to must be a valid ISO date string" });
      return;
    }

    const status = query.status;
    const validStatuses = ["active", "completed", "error"];
    if (status && !validStatuses.includes(status)) {
      reply.code(400).send({ message: `Invalid status filter: ${status}` });
      return;
    }

    const filters = {
      provider: query.provider,
      ...(status && { status }),
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      search: query.search?.slice(0, 200),
      page,
      limit,
      sortBy: (["last_activity_at", "started_at", "message_count"] as const).find((v) => v === query.sortBy),
      sortOrder: (["asc", "desc"] as const).find((v) => v === query.sortOrder),
    };
    const result = await repo.listSessions(filters);
    return { ...result, page: filters.page, limit: filters.limit };
  };
}

export function createSessionDetailHandler(repo: SessionArchiveRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = await repo.getSessionWithMessages(id);
    if (!result) {
      reply.code(404).send({ message: "Session not found" });
      return;
    }
    return result;
  };
}

export function createSessionStatsHandler(repo: SessionArchiveRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    if (query.from && !isValidISODate(query.from)) {
      reply.code(400).send({ message: "from must be a valid ISO date string" });
      return;
    }
    if (query.to && !isValidISODate(query.to)) {
      reply.code(400).send({ message: "to must be a valid ISO date string" });
      return;
    }
    const dateRange =
      query.from && query.to
        ? { from: new Date(query.from), to: new Date(query.to) }
        : undefined;
    return repo.getSessionStats(dateRange);
  };
}
