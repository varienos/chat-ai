import type { FastifyInstance } from "fastify";

import {
  errorResponseSchema,
  protectedSecurity,
  providerListResponseSchema,
  providerLoginStatusSchema,
  providerParamSchema,
} from "../openapi/schemas.js";
import type { ProviderRegistry } from "../providers/provider-registry.js";

export function registerProviderRoutes(
  app: FastifyInstance,
  providerRegistry: ProviderRegistry,
) {
  app.get(
    "/api/providers",
    {
      schema: {
        response: {
          200: providerListResponseSchema,
        },
        security: protectedSecurity,
        summary: "List enabled providers",
        tags: ["Providers"],
      },
    },
    async () => ({
      defaultProvider: providerRegistry.getDefaultProvider(),
      providers: providerRegistry.list(),
    }),
  );

  app.post(
    "/api/providers/:provider/login-status",
    {
      schema: {
        params: providerParamSchema,
        response: {
          200: providerLoginStatusSchema,
          404: errorResponseSchema,
        },
        security: protectedSecurity,
        summary: "Check provider auth status",
        tags: ["Providers"],
      },
    },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };

      if (!providerRegistry.has(provider)) {
        reply.code(404);
        return {
          message: "Provider not found",
        };
      }

      return providerRegistry.require(provider).checkLoginStatus();
    },
  );
}
