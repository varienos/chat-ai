import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

const isProduction = process.env.NODE_ENV === "production";

export function registerOpenApi(app: FastifyInstance) {
  app.register(swagger, {
    openapi: {
      info: {
        description:
          "AI gateway for customer-facing mobile app development conversations.\n\nProtected routes require `Authorization: Bearer <API_AUTH_TOKEN>`.\nIn Swagger UI, click `Authorize` and paste only the raw API_AUTH_TOKEN value. Do not type the Bearer prefix manually.",
        title: "VarienAI Gateway API",
        version: "0.1.0",
      },
      openapi: "3.0.3",
      components: {
        securitySchemes: {
          bearerAuth: {
            description:
              "Gateway bearer token for protected routes. Paste only the raw API_AUTH_TOKEN value into Swagger UI; the UI will add the `Bearer` prefix automatically.",
            bearerFormat: "opaque",
            scheme: "bearer",
            type: "http",
          },
        },
      },
      tags: [
        {
          description: "Liveness, readiness, and metrics endpoints",
          name: "Runtime",
        },
        {
          description: "Provider capability and auth inspection endpoints",
          name: "Providers",
        },
        {
          description: "Session lifecycle endpoints",
          name: "Sessions",
        },
        {
          description: "Chat and streaming conversation endpoints",
          name: "Chat",
        },
      ],
    },
  });

  if (!isProduction) {
    app.register(swaggerUi, {
      routePrefix: "/docs",
      staticCSP: true,
      transformSpecificationClone: true,
      uiConfig: {
        deepLinking: false,
        docExpansion: "list",
        persistAuthorization: true,
      },
    });

    app.get(
      "/openapi.json",
      {
        schema: {
          hide: true,
        },
      },
      async (_request, reply) => {
        reply.type("application/json; charset=utf-8");
        return app.swagger();
      },
    );
  }
}
