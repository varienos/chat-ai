# Codex-First Gateway MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first working Codex-only CLI gateway with Fastify, Redis, PostgreSQL, SSE streaming, Docker-based local development, and Coolify-ready deployment.

**Architecture:** The gateway stays provider-agnostic at the route layer and uses a Codex adapter behind a shared provider contract. Runtime session state lives in Redis, transcripts are archived in PostgreSQL, and each chat request spawns a fresh `codex exec` process through a safe process runner.

**Tech Stack:** Node.js, TypeScript, Fastify, Zod, Pino, Redis, PostgreSQL, Vitest, Docker, Coolify

---

### Task 1: Bootstrap the TypeScript service and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/app.ts`
- Create: `src/server.ts`
- Create: `test/app.health.test.ts`

**Step 1: Write the failing test**

```ts
import { buildApp } from "../src/app";
import { describe, expect, it } from "vitest";

describe("health route", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/app.health.test.ts`
Expected: FAIL because `buildApp` and the route do not exist yet.

**Step 3: Write minimal implementation**

```ts
import Fastify from "fastify";

export function buildApp() {
  const app = Fastify();
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/app.health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/app.ts src/server.ts test/app.health.test.ts
git commit -m "feat: bootstrap gateway service"
```

### Task 2: Add typed config loading and provider definitions

**Files:**
- Create: `src/config/env.ts`
- Create: `src/domain/providers.ts`
- Create: `test/config.providers.test.ts`
- Modify: `src/app.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getEnabledProviders } from "../src/domain/providers";

describe("providers", () => {
  it("returns codex as the default enabled provider", () => {
    expect(getEnabledProviders()).toEqual(["codex"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/config.providers.test.ts`
Expected: FAIL because provider helpers do not exist yet.

**Step 3: Write minimal implementation**

```ts
export type ProviderName = "codex" | "gemini" | "claude";

export function getEnabledProviders(): ProviderName[] {
  return ["codex"];
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/config.providers.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config/env.ts src/domain/providers.ts test/config.providers.test.ts src/app.ts
git commit -m "feat: add base config and provider definitions"
```

### Task 3: Create PostgreSQL schema and Redis/Postgres infrastructure adapters

**Files:**
- Create: `src/lib/postgres.ts`
- Create: `src/lib/redis.ts`
- Create: `sql/001_init_chat_tables.sql`
- Create: `test/storage.schema.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("chat schema", () => {
  it("creates sessions and messages tables", () => {
    const sql = readFileSync("sql/001_init_chat_tables.sql", "utf8");

    expect(sql).toContain("create table if not exists chat_sessions");
    expect(sql).toContain("create table if not exists chat_messages");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/storage.schema.test.ts`
Expected: FAIL because the SQL file does not exist yet.

**Step 3: Write minimal implementation**

```sql
create table if not exists chat_sessions (
  id text primary key,
  provider text not null,
  channel text,
  user_id text,
  status text not null,
  summary text,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  message_count integer not null default 0
);

create table if not exists chat_messages (
  id text primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  seq integer not null,
  role text not null,
  content text not null,
  provider text not null,
  latency_ms integer,
  finish_reason text,
  error_code text,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/storage.schema.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/postgres.ts src/lib/redis.ts sql/001_init_chat_tables.sql test/storage.schema.test.ts
git commit -m "feat: add persistence infrastructure"
```

### Task 4: Implement the session service with Redis hot state and Postgres archive writes

**Files:**
- Create: `src/services/session-service.ts`
- Create: `src/repositories/session-cache-repository.ts`
- Create: `src/repositories/session-archive-repository.ts`
- Create: `test/session-service.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { SessionService } from "../src/services/session-service";

describe("SessionService", () => {
  it("creates a session with codex as the default provider", async () => {
    const service = new SessionService({} as never, {} as never);
    const session = await service.createSession({});

    expect(session.provider).toBe("codex");
    expect(session.status).toBe("active");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/session-service.test.ts`
Expected: FAIL because `SessionService` does not exist yet.

**Step 3: Write minimal implementation**

```ts
export class SessionService {
  async createSession(input: { provider?: "codex" }) {
    return {
      id: "ses_test",
      provider: input.provider ?? "codex",
      status: "active",
      createdAt: new Date().toISOString(),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/session-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/session-service.ts src/repositories/session-cache-repository.ts src/repositories/session-archive-repository.ts test/session-service.test.ts
git commit -m "feat: add session service"
```

### Task 5: Add the provider contract, provider registry, and login status plumbing

**Files:**
- Create: `src/providers/types.ts`
- Create: `src/providers/provider-registry.ts`
- Create: `src/providers/codex/codex-provider.ts`
- Create: `test/provider-registry.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/providers/provider-registry";

describe("ProviderRegistry", () => {
  it("returns the codex provider", () => {
    const registry = new ProviderRegistry([]);
    expect(() => registry.get("codex")).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/provider-registry.test.ts`
Expected: FAIL because the registry does not exist yet.

**Step 3: Write minimal implementation**

```ts
export class ProviderRegistry {
  constructor(private readonly providers: Array<{ name: string }>) {}

  get(name: string) {
    const provider = this.providers.find((item) => item.name === name);
    if (!provider) throw new Error(`Unknown provider: ${name}`);
    return provider;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/provider-registry.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/providers/types.ts src/providers/provider-registry.ts src/providers/codex/codex-provider.ts test/provider-registry.test.ts
git commit -m "feat: add provider abstraction"
```

### Task 6: Build the safe process runner and Codex CLI integration

**Files:**
- Create: `src/lib/process-runner.ts`
- Modify: `src/providers/codex/codex-provider.ts`
- Create: `test/process-runner.test.ts`
- Create: `test/codex-provider.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildCodexArgs } from "../src/providers/codex/codex-provider";

describe("buildCodexArgs", () => {
  it("builds a non-shell codex exec command", () => {
    expect(buildCodexArgs("hello")).toEqual(
      expect.arrayContaining(["exec", "hello"]),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/codex-provider.test.ts`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

```ts
export function buildCodexArgs(prompt: string) {
  return ["exec", prompt, "--json"];
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/codex-provider.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/process-runner.ts src/providers/codex/codex-provider.ts test/process-runner.test.ts test/codex-provider.test.ts
git commit -m "feat: add codex process integration"
```

### Task 7: Implement session, provider, chat, and streaming routes

**Files:**
- Create: `src/routes/health.ts`
- Create: `src/routes/providers.ts`
- Create: `src/routes/sessions.ts`
- Create: `src/routes/chat.ts`
- Modify: `src/app.ts`
- Create: `test/routes.sessions.test.ts`
- Create: `test/routes.chat.test.ts`
- Create: `test/routes.stream.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("POST /api/session", () => {
  it("creates a new session", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: {},
    });

    expect(response.statusCode).toBe(201);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/routes.sessions.test.ts`
Expected: FAIL because the route does not exist yet.

**Step 3: Write minimal implementation**

```ts
app.post("/api/session", async (_request, reply) => {
  reply.code(201);
  return {
    id: "ses_test",
    provider: "codex",
    status: "active",
  };
});
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/routes.sessions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/health.ts src/routes/providers.ts src/routes/sessions.ts src/routes/chat.ts src/app.ts test/routes.sessions.test.ts test/routes.chat.test.ts test/routes.stream.test.ts
git commit -m "feat: add session and chat routes"
```

### Task 8: Add Docker, local compose, and Coolify deployment support

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-compose.dev.yml` or a dev profile inside `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `test/docker.files.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Docker setup", () => {
  it("defines gateway, redis, postgres, and a dev test runtime in compose", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");

    expect(compose).toContain("gateway:");
    expect(compose).toMatch(/gateway-dev:|profiles:/);
    expect(compose).toContain("redis:");
    expect(compose).toContain("postgres:");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/docker.files.test.ts`
Expected: FAIL because the compose file does not exist yet.

**Step 3: Write minimal implementation**

```yaml
services:
  gateway:
    build: .
  gateway-dev:
    build: .
  redis:
    image: redis:7-alpine
  postgres:
    image: postgres:16-alpine
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/docker.files.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore .env.example README.md test/docker.files.test.ts
git commit -m "feat: add docker and deployment assets"
```

### Task 9: Verify the full MVP locally before any deployment

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-12-codex-first-gateway-design.md`

**Step 1: Write the failing verification checklist**

```md
- [ ] `GET /health` returns 200
- [ ] `GET /ready` returns 200 when Redis, Postgres, and Codex auth are ready
- [ ] `POST /api/session` creates a session
- [ ] `POST /api/chat` returns a Codex response
- [ ] `POST /api/chat/stream` emits SSE events
- [ ] session state exists in Redis
- [ ] transcripts exist in PostgreSQL
```

**Step 2: Run local verification**

Run: `docker compose up --build`
Expected: gateway, redis, and postgres start cleanly with no crash loop.

Run: `docker compose run --rm gateway-dev npm test`
Expected: test suite runs inside the local Docker development runtime.

**Step 3: Run API verification**

Run: `npm test`
Expected: PASS

Run: `curl -i http://localhost:3000/health`
Expected: `200 OK`

**Step 4: Record results in docs**

Document:
- exact login steps for `codex login`
- required Coolify volumes
- health check path
- known MVP limitations

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-12-codex-first-gateway-design.md
git commit -m "docs: finalize codex gateway mvp verification notes"
```
