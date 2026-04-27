import type { FastifyInstance } from "fastify";

import type { ProviderRegistry } from "../providers/provider-registry.js";
import type { SessionService } from "../services/session-service.js";
import type { DependencyStatusService } from "../observability/dependency-status-service.js";
import type { MetricsRegistry } from "../observability/metrics-registry.js";
import {
  metricsResponseSchema,
  protectedSecurity,
  statusResponseSchema,
} from "../openapi/schemas.js";

export function registerReadinessRoutes(
  app: FastifyInstance,
  dependencyStatusService: DependencyStatusService,
  metricsRegistry: MetricsRegistry,
  providerRegistry: ProviderRegistry,
  sessionService: SessionService,
) {
  app.get(
    "/health",
    {
      schema: {
        response: {
          200: statusResponseSchema,
          503: statusResponseSchema,
        },
        summary: "Get liveness and dependency health",
        tags: ["Runtime"],
      },
    },
    async (_request, reply) => {
      const status = await dependencyStatusService.getHealthStatus();

      reply.code(status.status === "ok" ? 200 : 503);
      return formatStatusResponse(status);
    },
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: statusResponseSchema,
          503: statusResponseSchema,
        },
        summary: "Get readiness and provider auth state",
        tags: ["Runtime"],
      },
    },
    async (_request, reply) => {
      const status = await dependencyStatusService.getReadinessStatus();

      reply.code(status.status === "ready" ? 200 : 503);
      return formatReadinessResponse(status);
    },
  );

  app.get(
    "/metrics",
    {
      schema: {
        response: {
          200: metricsResponseSchema,
        },
        security: protectedSecurity,
        summary: "Get provider metrics snapshot",
        tags: ["Runtime"],
      },
    },
    async () => {
      const providers = providerRegistry.list().map((provider) => provider.name);
      const activeSessions = await sessionService.countActiveSessionsByProvider(
        providers,
      );

      return metricsRegistry.snapshot(activeSessions);
    },
  );
}

function formatStatusResponse(
  status:
    | Awaited<ReturnType<DependencyStatusService["getHealthStatus"]>>
    | Awaited<ReturnType<DependencyStatusService["getReadinessStatus"]>>,
) {
  if (Object.keys(status.dependencies).length === 0) {
    return {
      status: status.status,
    };
  }

  return status;
}

function formatReadinessResponse(
  status: Awaited<ReturnType<DependencyStatusService["getReadinessStatus"]>>,
) {
  const dependencies = sanitizeReadinessDependencies(status.dependencies);

  if (Object.keys(dependencies).length === 0) {
    return {
      status: status.status,
    };
  }

  return {
    dependencies,
    status: status.status,
  };
}

function sanitizeReadinessDependencies(
  dependencies: Awaited<ReturnType<DependencyStatusService["getReadinessStatus"]>>["dependencies"],
) {
  const sanitized: typeof dependencies = {};
  const assistantStates = Object.entries(dependencies).filter(([key]) =>
    key.endsWith("Auth"),
  );

  for (const [key, state] of Object.entries(dependencies)) {
    if (key.endsWith("Auth")) {
      continue;
    }

    sanitized[key] = state;
  }

  if (assistantStates.length > 0) {
    const downState = assistantStates.find(([, state]) => state.status === "down");
    sanitized.assistant = downState
      ? {
          reason: "Assistant service is not ready",
          status: "down",
        }
      : {
          status: "up",
        };
  }

  return sanitized;
}
