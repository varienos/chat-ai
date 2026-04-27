import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("OpenAPI automation", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it("serves a machine-readable OpenAPI document", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/openapi.json",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const spec = response.json();

    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("VarienAI Gateway API");
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/ready"]).toBeDefined();
    expect(spec.paths["/metrics"]).toBeDefined();
    expect(spec.paths["/api/providers"]).toBeDefined();
    expect(spec.paths["/api/providers/{provider}/login-status"]).toBeDefined();
    expect(spec.paths["/api/session"]).toBeDefined();
    expect(spec.paths["/api/session/{id}"]).toBeDefined();
    expect(spec.paths["/api/chat"]).toBeDefined();
    expect(spec.paths["/api/chat/stream"]).toBeDefined();
  });

  it("describes auth, public endpoints, and SSE chat semantics in the spec", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    const spec = response.json();

    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      bearerFormat: "opaque",
      scheme: "bearer",
      type: "http",
    });
    expect(spec.components.securitySchemes.bearerAuth.description).toContain(
      "raw API_AUTH_TOKEN",
    );
    expect(
      spec.paths["/api/providers/{provider}/login-status"].post.responses["200"].content[
        "application/json"
      ].schema.properties.mode.enum,
    ).toContain("api_key");
    expect(spec.info.description).toContain("Authorization: Bearer <API_AUTH_TOKEN>");
    expect(spec.paths["/health"].get.security).toBeUndefined();
    expect(spec.paths["/api/chat"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/api/chat"].post.responses["200"].content["application/json"]).toBeDefined();
    expect(spec.paths["/api/chat/stream"].post.summary).toContain("stream");
    expect(spec.paths["/api/chat/stream"].post.responses["200"].content["text/event-stream"]).toBeDefined();
    expect(
      spec.paths["/api/chat/stream"].post.responses["200"].description,
    ).toContain("assistant.delta");
    expect(spec.paths["/api/providers/{provider}/login-status"].post.summary).not.toContain(
      "OAuth",
    );
  });

  it("serves a human-readable Swagger UI", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/docs/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("swagger-initializer.js");
  });
});
