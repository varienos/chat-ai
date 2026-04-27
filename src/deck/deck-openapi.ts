import type { FastifyInstance } from "fastify";

export function createOpenApiSpecHandler(app: FastifyInstance) {
  return async () => {
    if (typeof app.swagger !== "function") {
      throw new Error("OpenAPI spec not available");
    }
    return app.swagger();
  };
}
