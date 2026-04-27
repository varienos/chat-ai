import type { FastifyReply, FastifyRequest } from "fastify";

import {
  handleRouteError,
  mapRouteError,
  normalizeChatBody,
  sanitizeErrorForLog,
  sanitizeChatResultForClient,
  writeSseEvent,
} from "../lib/route-helpers.js";
import type { ChatService } from "../services/chat-service.js";
import type { SessionService } from "../services/session-service.js";
import { extractVisitorMetadata } from "../lib/visitor-metadata.js";

interface ChatStreamHandlerOptions {
  allowProviderOverride?: boolean;
  initialProvider?: string;
}

export function createChatStreamHandler(
  chatService: ChatService,
  sessionService: SessionService,
  options: ChatStreamHandlerOptions = {},
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = normalizeChatBody(request.body);
      const requestedProvider =
        options.allowProviderOverride === false ? undefined : body.provider;

      // Auto-create session if it doesn't exist
      let session = await sessionService.getSession(body.sessionId);
      if (!session) {
        const providerName = chatService.resolveProviderName(
          options.initialProvider ?? requestedProvider ?? "codex",
        );
        const visitorMetadata = extractVisitorMetadata(request);
        session = await sessionService.createSession(providerName, body.sessionId, visitorMetadata);
      }

      reply.hijack();
      reply.raw.statusCode = 200;
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      // CORS — required for widget embed (reply.hijack bypasses Fastify headers)
      reply.raw.setHeader("Access-Control-Allow-Origin", "*");
      reply.raw.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      reply.raw.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      writeSseEvent(reply.raw, "session.started", {
        sessionId: body.sessionId,
      });

      const result = await chatService.chatStream(
        requestedProvider
          ? { ...body, provider: requestedProvider }
          : { message: body.message, sessionId: body.sessionId },
        async (event) => {
          if (event.type === "assistant.delta") {
            writeSseEvent(reply.raw, "assistant.delta", {
              chunk: event.chunk,
              sessionId: body.sessionId,
            });
          }
        },
      );

      writeSseEvent(reply.raw, "assistant.completed", sanitizeChatResultForClient(result));
    } catch (error) {
      if (!reply.sent) {
        return handleRouteError(reply, error);
      }

      const response = mapRouteError(error);
      try {
        writeSseEvent(reply.raw, "error", response.body);
      } catch (writeErr) {
        request.log.error({ err: sanitizeErrorForLog(writeErr), originalErr: sanitizeErrorForLog(error) }, "failed to send SSE error (client likely disconnected)");
      }
    } finally {
      if (reply.sent) {
        reply.raw.end();
      }
    }
  };
}
