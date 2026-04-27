import { PROVIDER_NAMES } from "../domain/providers.js";

const providerEnum = [...PROVIDER_NAMES];

export const protectedSecurity = [{ bearerAuth: [] }];

export const errorResponseSchema = {
  additionalProperties: false,
  properties: {
    message: {
      type: "string",
    },
  },
  required: ["message"],
  type: "object",
};

export const providerDefinitionSchema = {
  additionalProperties: false,
  properties: {
    enabled: {
      type: "boolean",
    },
    name: {
      enum: providerEnum,
      type: "string",
    },
  },
  required: ["name", "enabled"],
  type: "object",
};

export const providerListResponseSchema = {
  additionalProperties: false,
  properties: {
    defaultProvider: {
      enum: providerEnum,
      type: "string",
    },
    providers: {
      items: providerDefinitionSchema,
      type: "array",
    },
  },
  required: ["defaultProvider", "providers"],
  type: "object",
};

export const providerLoginStatusSchema = {
  additionalProperties: false,
  properties: {
    authenticated: {
      type: "boolean",
    },
    mode: {
      enum: ["oauth", "api_key"],
      type: "string",
    },
    provider: {
      enum: providerEnum,
      type: "string",
    },
  },
  required: ["provider", "authenticated", "mode"],
  type: "object",
};

const visitorMetadataSchema = {
  additionalProperties: false,
  nullable: true,
  properties: {
    browser: { nullable: true, type: "string" },
    city: { nullable: true, type: "string" },
    country: { nullable: true, type: "string" },
    deviceType: { nullable: true, type: "string" },
    ip: { type: "string" },
    os: { nullable: true, type: "string" },
    userAgent: { type: "string" },
  },
  required: ["ip", "userAgent"],
  type: "object",
};

export const sessionSchema = {
  additionalProperties: false,
  properties: {
    createdAt: {
      format: "date-time",
      type: "string",
    },
    id: {
      type: "string",
    },
    lastActivityAt: {
      format: "date-time",
      type: "string",
    },
    messageCount: {
      type: "integer",
    },
    provider: {
      enum: providerEnum,
      type: "string",
    },
    status: {
      enum: ["active", "completed", "error"],
      type: "string",
    },
    summary: {
      nullable: true,
      type: "string",
    },
    visitorMetadata: visitorMetadataSchema,
  },
  required: [
    "id",
    "provider",
    "status",
    "createdAt",
    "lastActivityAt",
    "messageCount",
    "summary",
    "visitorMetadata",
  ],
  type: "object",
};

export const storedMessageSchema = {
  additionalProperties: false,
  properties: {
    content: {
      type: "string",
    },
    createdAt: {
      format: "date-time",
      type: "string",
    },
    id: {
      type: "string",
    },
    latencyMs: {
      nullable: true,
      type: "number",
    },
    metadata: {
      additionalProperties: true,
      type: "object",
    },
    role: {
      enum: ["assistant", "user"],
      type: "string",
    },
    sessionId: {
      type: "string",
    },
  },
  required: [
    "id",
    "sessionId",
    "role",
    "content",
    "createdAt",
    "metadata",
  ],
  type: "object",
};

export const chatRequestBodySchema = {
  additionalProperties: false,
  properties: {
    message: {
      minLength: 1,
      type: "string",
    },
    provider: {
      examples: providerEnum,
      type: "string",
    },
    sessionId: {
      minLength: 1,
      type: "string",
    },
  },
  required: ["message", "sessionId"],
  type: "object",
};

export const chatResponseSchema = {
  additionalProperties: false,
  properties: {
    message: storedMessageSchema,
    sessionId: {
      type: "string",
    },
  },
  required: ["sessionId", "message"],
  type: "object",
};

export const createSessionRequestBodySchema = {
  additionalProperties: false,
  properties: {
    provider: {
      examples: providerEnum,
      type: "string",
    },
  },
  type: "object",
};

const dependencyStateSchema = {
  additionalProperties: false,
  properties: {
    reason: {
      nullable: true,
      type: "string",
    },
    status: {
      enum: ["up", "down"],
      type: "string",
    },
  },
  required: ["status"],
  type: "object",
};

export const statusResponseSchema = {
  additionalProperties: false,
  properties: {
    dependencies: {
      additionalProperties: dependencyStateSchema,
      type: "object",
    },
    status: {
      examples: ["ok", "degraded", "ready", "not_ready"],
      type: "string",
    },
  },
  required: ["status"],
  type: "object",
};

const providerMetricsSchema = {
  additionalProperties: false,
  properties: {
    activeRequests: {
      type: "integer",
    },
    activeSessions: {
      type: "integer",
    },
    averageLatencyMs: {
      type: "number",
    },
    errorCount: {
      type: "integer",
    },
    errorRate: {
      type: "number",
    },
    timeoutCount: {
      type: "integer",
    },
    totalRequests: {
      type: "integer",
    },
  },
  required: [
    "activeRequests",
    "activeSessions",
    "averageLatencyMs",
    "errorCount",
    "errorRate",
    "timeoutCount",
    "totalRequests",
  ],
  type: "object",
};

export const metricsResponseSchema = {
  additionalProperties: false,
  properties: {
    generatedAt: {
      format: "date-time",
      type: "string",
    },
    providers: {
      additionalProperties: providerMetricsSchema,
      type: "object",
    },
  },
  required: ["generatedAt", "providers"],
  type: "object",
};

export const providerParamSchema = {
  additionalProperties: false,
  properties: {
    provider: {
      type: "string",
    },
  },
  required: ["provider"],
  type: "object",
};

export const sessionIdParamSchema = {
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
    },
  },
  required: ["id"],
  type: "object",
};

export const sseStreamResponse = {
  content: {
    "text/event-stream": {
      schema: {
        example:
          'event: session.started\ndata: {"sessionId":"ses_123"}\n\nevent: assistant.delta\ndata: {"sessionId":"ses_123","chunk":"Merhaba"}\n\nevent: assistant.completed\ndata: {"sessionId":"ses_123","message":{"id":"msg_123","role":"assistant","content":"Merhaba"}}\n\n',
        type: "string",
      },
    },
  },
  description:
    "Server-Sent Events stream. Events may include session.started, assistant.delta, assistant.completed, and error.",
};
