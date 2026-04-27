import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { buildAuthHeaders } from "./support/auth.js";

describe("gateway skeleton routes", () => {
  const apps: Array<ReturnType<typeof buildApp>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it("returns readiness status", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("lists supported providers", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      headers: buildAuthHeaders(),
      method: "GET",
      url: "/api/providers",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      defaultProvider: "codex",
      providers: [
        {
          enabled: true,
          name: "codex",
        },
      ],
    });
  });

  it("creates and fetches a session", async () => {
    const app = buildApp();
    apps.push(app);

    const createResponse = await app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      url: "/api/session",
      payload: {},
    });

    expect(createResponse.statusCode).toBe(201);

    const created = createResponse.json();

    expect(created.provider).toBe("codex");
    expect(created.status).toBe("active");
    expect(created.id).toEqual(expect.any(String));

    const fetchResponse = await app.inject({
      headers: buildAuthHeaders(),
      method: "GET",
      url: `/api/session/${created.id}`,
    });

    expect(fetchResponse.statusCode).toBe(200);
    expect(fetchResponse.json()).toEqual(created);
  });

  it("uses the requested provider when it is enabled", async () => {
    const app = buildApp({
      config: {
        providers: {
          defaultProvider: "codex",
          enabledProviders: ["codex", "gemini"],
        },
        server: {
          host: "0.0.0.0",
          port: 3000,
        },
      },
    });
    apps.push(app);

    const response = await app.inject({
      headers: buildAuthHeaders(),
      method: "POST",
      url: "/api/session",
      payload: {
        provider: "gemini",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      provider: "gemini",
      status: "active",
    });
  });

  it("returns 404 when the requested session does not exist", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      headers: buildAuthHeaders(),
      method: "GET",
      url: "/api/session/missing-session",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      message: "Session not found",
    });
  });
});
