import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Docker assets", () => {
  it("defines gateway, gateway-dev, redis, and postgres in compose", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");

    expect(compose).toContain("gateway:");
    expect(compose).toContain("gateway-dev:");
    expect(compose).toContain("redis:");
    expect(compose).toContain("postgres:");
    expect(compose).toContain("codex-auth:");
    expect(compose).toContain("gemini-auth:");
    expect(compose).toContain("claude-auth:");
    expect(compose).toContain("scripts/dev-entrypoint.sh");
    expect(compose).not.toContain("/docker-entrypoint-initdb.d");
  });

  it("includes a gateway-only amd64 override for Apple Silicon local testing", () => {
    const override = readFileSync("docker-compose.gateway-amd64.yml", "utf8");

    expect(override).toContain("gateway:");
    expect(override).toContain("gateway-dev:");
    expect(override).toContain("platform: linux/amd64");
    expect(override).not.toContain("redis:");
    expect(override).not.toContain("postgres:");
  });

  it("installs the supported CLI providers in the Dockerfile", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");

    expect(dockerfile).toContain("npm i -g @openai/codex@latest");
    expect(dockerfile).toContain("@google/gemini-cli@latest");
    expect(dockerfile).toContain("@anthropic-ai/claude-code@latest");
    expect(dockerfile).toContain("FROM node:22-bookworm-slim");
    expect(dockerfile).toContain("COPY sql ./sql");
  });

  it("documents local Docker verification and Coolify deployment", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("docker compose up --build");
    expect(readme).toContain("npm test");
    expect(readme).toContain("Coolify");
    expect(readme).toContain("/openapi.json");
    expect(readme).toContain("/docs");
    expect(readme).toContain("chat.varien.software");
    expect(readme).toContain("CODEX_AUTH_JSON");
    expect(readme).toContain("DECK_ADMIN_PASSWORD");
    expect(readme).toContain("DECK_JWT_SECRET");
    expect(readme).toContain("knowledge");
  });

  it("includes Docker-focused environment examples", () => {
    const envExample = readFileSync(".env.example", "utf8");

    expect(envExample).toContain("DATABASE_URL=postgresql://postgres:postgres@postgres:5432/varienai");
    expect(envExample).toContain("REDIS_URL=redis://redis:6379");
    expect(envExample).toContain("CODEX_WORKING_DIRECTORY=/app");
    expect(envExample).toContain("CODEX_AUTH_MODE=");
    expect(envExample).toContain("OPENAI_API_KEY=");
    expect(envExample).toContain("GEMINI_WORKING_DIRECTORY=/app");
    expect(envExample).toContain("CLAUDE_WORKING_DIRECTORY=/app");
  });

  it("defines an OpenAPI export script in package.json", () => {
    const packageJson = readFileSync("package.json", "utf8");

    expect(packageJson).toContain("\"openapi:export\"");
    expect(packageJson).toContain("\"postman:export\"");
  });

  it("defines host-native local fallback automation scripts", () => {
    const packageJson = readFileSync("package.json", "utf8");

    expect(() =>
      readFileSync("scripts/start-local-host-fallback.sh", "utf8"),
    ).not.toThrow();
    expect(() =>
      readFileSync("scripts/stop-local-host-fallback.sh", "utf8"),
    ).not.toThrow();
    expect(() =>
      readFileSync("scripts/status-local-host-fallback.sh", "utf8"),
    ).not.toThrow();

    expect(packageJson).toContain("\"local:host:start\"");
    expect(packageJson).toContain("\"local:host:stop\"");
    expect(packageJson).toContain("\"local:host:status\"");
  });
});
