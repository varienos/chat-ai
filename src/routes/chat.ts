import type { FastifyInstance } from "fastify";

import {
  handleRouteError,
  mapRouteError,
  normalizeChatBody,
  sanitizeErrorForLog,
  sanitizeChatResultForClient,
  writeSseEvent,
} from "../lib/route-helpers.js";
import {
  chatRequestBodySchema,
  chatResponseSchema,
  errorResponseSchema,
  protectedSecurity,
  sseStreamResponse,
} from "../openapi/schemas.js";
import type { ChatService } from "../services/chat-service.js";

export function registerChatRoutes(app: FastifyInstance, chatService: ChatService) {
  app.post(
    "/api/chat",
    {
      schema: {
        body: chatRequestBodySchema,
        response: {
          200: chatResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
          504: errorResponseSchema,
        },
        security: protectedSecurity,
        summary: "Send a chat message and wait for the final response",
        tags: ["Chat"],
      },
    },
    async (request, reply) => {
      try {
        const body = normalizeChatBody(request.body);
        const result = await chatService.chat(body);
        return sanitizeChatResultForClient(result);
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );

  app.post(
    "/api/chat/stream",
    {
      schema: {
        body: chatRequestBodySchema,
        response: {
          200: sseStreamResponse,
        },
        security: protectedSecurity,
        summary: "Send a chat message and stream the response over SSE",
        tags: ["Chat"],
      },
    },
    async (request, reply) => {
      try {
        const body = normalizeChatBody(request.body);

        reply.hijack();
        reply.raw.statusCode = 200;
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");

        writeSseEvent(reply.raw, "session.started", {
          sessionId: body.sessionId,
        });

        const result = await chatService.chatStream(body, async (event) => {
          if (event.type === "assistant.delta") {
            writeSseEvent(reply.raw, "assistant.delta", {
              chunk: event.chunk,
              sessionId: body.sessionId,
            });
          }
        });

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
    },
  );
}
