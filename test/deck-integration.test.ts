import { describe, it, expect, afterEach } from "vitest";
import { buildApp } from "../src/app.js";

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : String(setCookie ?? "");
  return raw?.split(";")[0] ?? "";
}

describe("deck gateway integration", () => {
  let app: ReturnType<typeof buildApp>;

  afterEach(async () => {
    await app?.close();
  });

  it("allows /deck/api/auth/login without bearer token and sets HttpOnly cookie", async () => {
    app = buildApp({
      config: {
        security: { apiAuthToken: "gateway-token" },
        deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "test" },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty("ok", true);
    // Verify HttpOnly cookie is set
    const setCookie = response.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(raw).toContain("deck_token=");
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    expect(raw).toContain("Path=/deck");
  });

  it("returns 401 for wrong credentials", async () => {
    app = buildApp({
      config: {
        security: { apiAuthToken: "gateway-token" },
        deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "wrong" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("/deck/api/auth/me returns user with valid cookie", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "secret", jwtSecret: "test-secret" },
      },
    });
    const loginRes = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "secret" },
    });
    const cookie = extractCookie(loginRes);
    const meRes = await app.inject({
      method: "GET",
      url: "/deck/api/auth/me",
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).username).toBe("admin");
  });

  it("/deck/api/auth/me returns 401 without cookie", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "secret", jwtSecret: "test-secret" },
      },
    });
    const response = await app.inject({ method: "GET", url: "/deck/api/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("logout clears cookie and /me returns 401 after", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "secret", jwtSecret: "test-secret" },
      },
    });
    const loginRes = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "secret" },
    });
    const cookie = extractCookie(loginRes);

    // Logout
    const logoutRes = await app.inject({
      method: "POST",
      url: "/deck/api/auth/logout",
      headers: { cookie },
    });
    expect(logoutRes.statusCode).toBe(200);
    const logoutCookie = logoutRes.headers["set-cookie"];
    const logoutRaw = Array.isArray(logoutCookie) ? logoutCookie[0] : logoutCookie;
    expect(logoutRaw).toContain("Max-Age=0");

    // /me should fail after logout (no valid cookie)
    const meRes = await app.inject({
      method: "GET",
      url: "/deck/api/auth/me",
    });
    expect(meRes.statusCode).toBe(401);
  });

  it("skips deck routes when jwtSecret is empty", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "", jwtSecret: "" },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "" },
    });
    // Should 404 because routes weren't registered
    expect(response.statusCode).toBe(404);
  });
});
