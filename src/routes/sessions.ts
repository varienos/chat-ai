import type { FastifyInstance } from "fastify";

import {
  createSessionRequestBodySchema,
  errorResponseSchema,
  protectedSecurity,
  sessionIdParamSchema,
  sessionSchema,
} from "../openapi/schemas.js";
import type { ProviderRegistry } from "../providers/provider-registry.js";
import type { SessionService } from "../services/session-service.js";
import { extractVisitorMetadata } from "../lib/visitor-metadata.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  providerRegistry: ProviderRegistry,
  sessionService: SessionService,
) {
  app.post(
    "/api/session",
    {
      schema: {
        body: createSessionRequestBodySchema,
        response: {
          201: sessionSchema,
        },
        security: protectedSecurity,
        summary: "Create a chat session",
        tags: ["Sessions"],
      },
    },
    async (request, reply) => {
      const { provider } = (request.body as { provider?: string } | undefined) ?? {};
      const selectedProvider =
        provider && providerRegistry.has(provider)
          ? provider
          : providerRegistry.getDefaultProvider();
      const visitorMetadata = extractVisitorMetadata(request);
      const session = await sessionService.createSession(selectedProvider, undefined, visitorMetadata);

      reply.code(201);

      return session;
    },
  );

  app.get(
    "/api/session/:id",
    {
      schema: {
        params: sessionIdParamSchema,
        response: {
          200: sessionSchema,
          404: errorResponseSchema,
        },
        security: protectedSecurity,
        summary: "Fetch a session by id",
        tags: ["Sessions"],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = await sessionService.getSession(id);

      if (!session) {
        reply.code(404);
        return { message: "Session not found" };
      }

      return session;
    },
  );
}
