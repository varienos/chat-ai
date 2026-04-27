import type { FastifyReply } from "fastify";

import {
  FatalProviderError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  isTimeoutError,
} from "../errors.js";

const MAX_MESSAGE_LENGTH = 32_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_DETAIL_RE = /((?:codex_)?openai_api_key\s*=\s*\S+|(?:codex_)?openai_api_key|api[_ -]?key|codex|claude|gemini|gpt[-_\w.]*|model|oauth|openai|provider\w*)/i;
const PROVIDER_DETAIL_GLOBAL_RE = /((?:codex_)?openai_api_key\s*=\s*\S+|(?:codex_)?openai_api_key|api[_ -]?key|codex|claude|gemini|gpt[-_\w.]*|model|oauth|openai|provider\w*)/gi;

export function normalizeChatBody(
  body: unknown,
): {
  message: string;
  provider?: string;
  sessionId: string;
} {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required");
  }

  const { message, provider, sessionId } = body as {
    message?: unknown;
    provider?: unknown;
    sessionId?: unknown;
  };

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new ValidationError("message is required");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
  }

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new ValidationError("sessionId is required");
  }

  if (!UUID_RE.test(sessionId.trim())) {
    throw new ValidationError("sessionId must be a valid UUID");
  }

  return {
    message: message.trim(),
    provider: typeof provider === "string" ? provider : undefined,
    sessionId: sessionId.trim(),
  };
}

export function handleRouteError(reply: FastifyReply, error: unknown) {
  const response = mapRouteError(error);

  if (response.statusCode >= 500) {
    reply.log.error(
      { err: sanitizeErrorForLog(error) },
      "unexpected route error",
    );
  }

  reply.code(response.statusCode);
  return response.body;
}

export function mapRouteError(error: unknown) {
  if (error instanceof NotFoundError) {
    return {
      body: { message: error.message },
      statusCode: 404,
    };
  }

  if (error instanceof ValidationError) {
    return {
      body: { message: sanitizeClientErrorMessage(error.message, "Invalid request") },
      statusCode: 400,
    };
  }

  if (error instanceof RateLimitError) {
    return {
      body: { message: "Too many requests" },
      statusCode: 429,
    };
  }

  if (error instanceof FatalProviderError) {
    return {
      body: { message: "Assistant service is temporarily unavailable" },
      statusCode: 502,
    };
  }

  if (error instanceof TimeoutError || isTimeoutError(error)) {
    return {
      body: {
        message: "Assistant response timed out",
      },
      statusCode: 504,
    };
  }

  return {
    body: {
      message: "Internal server error",
    },
    statusCode: 500,
  };
}

export function sanitizeChatResultForClient<T extends {
  message?: unknown;
  provider?: unknown;
  sessionId?: unknown;
}>(result: T) {
  const { provider: _provider, message, ...rest } = result;

  return {
    ...rest,
    message: sanitizeMessageForClient(message),
  };
}

function sanitizeMessageForClient(message: unknown) {
  if (!message || typeof message !== "object") {
    return message;
  }

  const { provider: _provider, ...rest } = message as Record<string, unknown>;
  return rest;
}

function sanitizeClientErrorMessage(message: string, fallback: string) {
  return PROVIDER_DETAIL_RE.test(message) ? fallback : message;
}

export function sanitizeErrorForLog(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: sanitizeProviderDetails(String(error)),
      name: "Error",
    };
  }

  return {
    message: sanitizeProviderDetails(error.message),
    name: sanitizeProviderDetails(error.name),
  };
}

function sanitizeProviderDetails(value: string) {
  return value.replace(PROVIDER_DETAIL_GLOBAL_RE, "[redacted]");
}

export function writeSseEvent(
  rawReply: NodeJS.WritableStream & {
    destroyed?: boolean;
    write: (chunk: string) => boolean;
  },
  event: string,
  data: unknown,
): boolean {
  if (rawReply.destroyed) return false;
  rawReply.write(`event: ${event}\n`);
  return rawReply.write(`data: ${JSON.stringify(data)}\n\n`);
}
