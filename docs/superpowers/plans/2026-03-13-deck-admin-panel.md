# Deck Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React-based admin panel (Deck) for the VarienAI gateway, served from `/deck`, with dashboard analytics, session viewer, runtime settings, test chat, and read-only OpenAPI docs.

**Architecture:** Monorepo with `deck/` as a standalone Vite + React SPA. Gateway serves the production build via `@fastify/static`. Backend adds `/deck/api/*` routes with JWT auth (separate from gateway bearer token). RuntimeConfigStore in Redis enables hot-reload for a defined subset of settings.

**Tech Stack:** Fastify 5 + TypeScript (backend), React 19 + Vite + Tailwind + TanStack Query + Recharts (frontend), `@scalar/api-reference-react` (OpenAPI viewer), `jsonwebtoken` (JWT), `@fastify/static` (static serve)

**Spec:** `docs/superpowers/specs/2026-03-13-deck-admin-panel-design.md`

---

## File Map

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `src/deck/deck-auth.ts` | JWT sign/verify, login handler, auth middleware, login rate limiter |
| `src/deck/deck-routes.ts` | Register all `/deck/api/*` routes, apply JWT middleware |
| `src/deck/deck-settings.ts` | RuntimeConfigStore class, GET/PATCH settings handlers |
| `src/deck/deck-sessions.ts` | Session list/detail/stats handlers |
| `src/deck/deck-chat.ts` | Chat stream proxy handler |
| `src/deck/deck-openapi.ts` | OpenAPI spec endpoint handler |
| `src/deck/deck-static.ts` | Production static file serving for `deck/dist/` |

### Backend — Modified Files

| File | Change |
|------|--------|
| `src/config/env.ts` | Add `deck` config section (DECK_ADMIN_USER, DECK_ADMIN_PASSWORD, DECK_JWT_SECRET) |
| `src/app.ts` | Add `/deck` to PUBLIC_PATH_PREFIXES, register deck routes |
| `src/bootstrap/runtime-services.ts` | Create RuntimeConfigStore, pass to services |
| `src/services/chat-service.ts` | Read systemPrompt/recentMessageLimit from RuntimeConfigStore per-request |
| `src/repositories/session-archive-repository.ts` | Add listSessions, getSessionWithMessages, getSessionStats methods |
| `package.json` | Add `@fastify/static`, `jsonwebtoken` deps + deck scripts |
| `tsconfig.json` | Add `"deck"` to exclude |
| `.env.example` | Add DECK_* env vars |

### Backend — New Test Files

| File | Tests |
|------|-------|
| `test/deck-auth.test.ts` | JWT sign/verify, login, middleware, rate limit |
| `test/deck-settings.test.ts` | RuntimeConfigStore CRUD, validation, getEffectiveConfig merge |
| `test/deck-sessions.test.ts` | Session list/detail/stats with filters |
| `test/deck-chat.test.ts` | Chat stream proxy |

### Frontend — New Files (all in `deck/`)

| File | Responsibility |
|------|---------------|
| `deck/index.html` | SPA entry |
| `deck/package.json` | Deps: react, react-router-dom v6, tailwindcss v4, @tanstack/react-query, recharts, @scalar/api-reference-react |
| `deck/tsconfig.json` | Strict TS config for frontend |
| `deck/vite.config.ts` | Vite config with @tailwindcss/vite plugin, proxy + base path |
| `deck/src/index.css` | Tailwind 4 entry (`@import "tailwindcss"`) |
| `deck/src/main.tsx` | React root render |
| `deck/src/App.tsx` | Router + QueryClientProvider + AuthProvider |
| `deck/src/api/client.ts` | Fetch wrapper with JWT header injection, 401 intercept |
| `deck/src/auth/AuthContext.tsx` | JWT state management, login/logout |
| `deck/src/auth/ProtectedRoute.tsx` | Auth guard component |
| `deck/src/auth/LoginPage.tsx` | Login form |
| `deck/src/layout/TopNav.tsx` | Horizontal navigation bar |
| `deck/src/pages/DashboardPage.tsx` | KPI cards + charts |
| `deck/src/pages/SessionsPage.tsx` | Session list + filters |
| `deck/src/pages/SessionDetailPage.tsx` | Conversation viewer |
| `deck/src/pages/SettingsPage.tsx` | Tabbed settings form |
| `deck/src/pages/ChatPage.tsx` | Streaming test chat |
| `deck/src/pages/ApiDocsPage.tsx` | Read-only OpenAPI viewer |
| `deck/src/components/KpiCard.tsx` | Stat card component |
| `deck/src/components/ChatBubble.tsx` | Chat message bubble |
| `deck/src/components/SettingField.tsx` | Setting input with live/restart badge |
| `deck/src/components/ProviderBadge.tsx` | Provider name + status indicator |

---

## Chunk 1: Backend Foundation

### Task 1: Dependencies & Config

**Files:**
- Modify: `package.json` — add `@fastify/static`, `jsonwebtoken`, `@types/jsonwebtoken`
- Modify: `tsconfig.json` — add `"deck"` to exclude
- Modify: `src/config/env.ts` — add `deck` config section
- Modify: `.env.example` — add DECK_* env vars
- Test: `test/config.providers.test.ts` — extend with deck config tests

- [ ] **Step 1: Install dependencies**

```bash
npm install @fastify/static jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Add "deck" to tsconfig.json exclude**

In `tsconfig.json`, add `"deck"` to the `exclude` array.

- [ ] **Step 3: Write test for deck config parsing**

In `test/config.providers.test.ts`, add tests:

```typescript
describe("deck config", () => {
  it("reads DECK_ADMIN_USER with default 'admin'", () => {
    const config = loadConfig({});
    expect(config.deck.adminUser).toBe("admin");
  });

  it("reads DECK_ADMIN_PASSWORD", () => {
    const config = loadConfig({ DECK_ADMIN_PASSWORD: "secret" });
    expect(config.deck.adminPassword).toBe("secret");
  });

  it("reads DECK_JWT_SECRET", () => {
    const config = loadConfig({ DECK_JWT_SECRET: "jwt-secret-123" });
    expect(config.deck.jwtSecret).toBe("jwt-secret-123");
  });

  it("defaults DECK_ADMIN_PASSWORD and DECK_JWT_SECRET to empty string", () => {
    const config = loadConfig({});
    expect(config.deck.adminPassword).toBe("");
    expect(config.deck.jwtSecret).toBe("");
  });

  it("merges deck config overrides via mergeConfig", () => {
    const base = loadConfig({});
    const merged = mergeConfig(base, { deck: { adminUser: "custom" } });
    expect(merged.deck.adminUser).toBe("custom");
    expect(merged.deck.adminPassword).toBe(""); // base default preserved
  });
});
```

- [ ] **Step 4: Run test — verify it fails**

```bash
npm test -- test/config.providers.test.ts
```

Expected: FAIL — `config.deck` is undefined.

- [ ] **Step 5: Implement deck config in env.ts**

Add to `AppConfig` interface:

```typescript
deck: {
  adminUser: string;
  adminPassword: string;
  jwtSecret: string;
};
```

Add to `loadConfig()` return:

```typescript
deck: {
  adminUser: env.DECK_ADMIN_USER ?? "admin",
  adminPassword: env.DECK_ADMIN_PASSWORD ?? "",
  jwtSecret: env.DECK_JWT_SECRET ?? "",
},
```

Add to `AppConfigOverride`:

```typescript
deck?: Partial<AppConfig["deck"]>;
```

Add to `mergeConfig()`:

```typescript
deck: { ...baseConfig.deck, ...override.deck },
```

- [ ] **Step 6: Run test — verify it passes**

```bash
npm test -- test/config.providers.test.ts
```

- [ ] **Step 7: Update .env.example**

Add:

```env
# Deck Admin Panel
# DECK_ADMIN_USER=admin
# DECK_ADMIN_PASSWORD=
# DECK_JWT_SECRET=
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/config/env.ts .env.example test/config.providers.test.ts
git commit -m "feat(deck): add config, dependencies, and tsconfig exclude"
```

---

### Task 2: JWT Auth Module

**Files:**
- Create: `src/deck/deck-auth.ts`
- Test: `test/deck-auth.test.ts`

- [ ] **Step 1: Write tests for JWT sign/verify and login**

Create `test/deck-auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { signDeckToken, verifyDeckToken, validateCredentials } from "../src/deck/deck-auth.js";

describe("deck-auth", () => {
  const secret = "test-jwt-secret";

  describe("signDeckToken / verifyDeckToken", () => {
    it("signs and verifies a valid token", () => {
      const token = signDeckToken("admin", secret);
      const payload = verifyDeckToken(token, secret);
      expect(payload.sub).toBe("admin");
    });

    it("rejects an invalid token", () => {
      expect(() => verifyDeckToken("invalid", secret)).toThrow();
    });

    it("rejects a token signed with wrong secret", () => {
      const token = signDeckToken("admin", "other-secret");
      expect(() => verifyDeckToken(token, secret)).toThrow();
    });
  });

  describe("validateCredentials", () => {
    it("returns true for matching credentials", () => {
      expect(validateCredentials("admin", "pass", "admin", "pass")).toBe(true);
    });

    it("returns false for wrong password", () => {
      expect(validateCredentials("admin", "wrong", "admin", "pass")).toBe(false);
    });

    it("returns false for wrong username", () => {
      expect(validateCredentials("wrong", "pass", "admin", "pass")).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- test/deck-auth.test.ts
```

- [ ] **Step 3: Implement deck-auth.ts**

Create `src/deck/deck-auth.ts`:

```typescript
import { sign, verify } from "jsonwebtoken";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const TOKEN_EXPIRY = "24h";
const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const LOGIN_RATE_LIMIT_MAX = 5; // 5 attempts per minute per IP

// In-memory login rate limiter (IP-based)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= LOGIN_RATE_LIMIT_MAX;
}

export function signDeckToken(username: string, secret: string): string {
  return sign({ sub: username }, secret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyDeckToken(token: string, secret: string): { sub: string } {
  return verify(token, secret) as { sub: string };
}

export function validateCredentials(
  username: string,
  password: string,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  return username === expectedUser && password === expectedPassword;
}

// Call in app setup to declare deckUser property on request
export function decorateDeckRequest(app: FastifyInstance) {
  app.decorateRequest("deckUser", "");
}

export function createDeckAuthHook(jwtSecret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      reply.code(401).send({ message: "Missing or invalid token" });
      return reply;
    }

    try {
      const payload = verifyDeckToken(auth.slice(7), jwtSecret);
      (request as any).deckUser = payload.sub;
    } catch {
      reply.code(401).send({ message: "Invalid or expired token" });
      return reply;
    }
  };
}
```

Note: `jsonwebtoken` is CJS-only — use named imports (`sign`, `verify`) to avoid ESM interop issues, consistent with the project's pattern for other CJS packages (`pg`, `redis`).

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- test/deck-auth.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/deck/deck-auth.ts test/deck-auth.test.ts
git commit -m "feat(deck): add JWT auth module with sign/verify/validate"
```

---

### Task 3: Gateway Integration — PUBLIC_PATH_PREFIXES + Route Registration

**Files:**
- Modify: `src/app.ts` — add `/deck` to PUBLIC_PATH_PREFIXES, register deck routes
- Create: `src/deck/deck-routes.ts` — route registration skeleton with JWT auth hook + login rate limiting
- Test: `test/deck-integration.test.ts` — dedicated deck gateway integration tests

- [ ] **Step 1: Write tests — deck routes bypass gateway bearer auth**

Create `test/deck-integration.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { buildApp } from "../src/app.js";

describe("deck gateway integration", () => {
  let app: ReturnType<typeof buildApp>;

  afterEach(async () => {
    await app?.close();
  });

  it("allows /deck/api/auth/login without bearer token", async () => {
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
    expect(JSON.parse(response.body)).toHaveProperty("token");
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

  it("rate limits login attempts (5/minute)", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "test", jwtSecret: "test-secret" },
      },
    });
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "POST", url: "/deck/api/auth/login", payload: { username: "admin", password: "wrong" } });
    }
    const response = await app.inject({
      method: "POST",
      url: "/deck/api/auth/login",
      payload: { username: "admin", password: "test" },
    });
    expect(response.statusCode).toBe(429);
  });

  it("/deck/api/auth/me returns user with valid JWT", async () => {
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
    const { token } = JSON.parse(loginRes.body);
    const meRes = await app.inject({
      method: "GET",
      url: "/deck/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(JSON.parse(meRes.body).username).toBe("admin");
  });

  it("/deck/api/auth/me returns 401 without JWT", async () => {
    app = buildApp({
      config: {
        deck: { adminUser: "admin", adminPassword: "secret", jwtSecret: "test-secret" },
      },
    });
    const response = await app.inject({ method: "GET", url: "/deck/api/auth/me" });
    expect(response.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test — verify it fails (401 from gateway bearer auth)**

- [ ] **Step 3: Add `/deck` to PUBLIC_PATH_PREFIXES in app.ts**

Current value: `production ? [] : ["/docs"]`. Change to:

```typescript
const PUBLIC_PATH_PREFIXES = process.env.NODE_ENV === "production"
  ? ["/deck"]
  : ["/docs", "/deck"];
```

- [ ] **Step 4: Create deck-routes.ts skeleton**

Create `src/deck/deck-routes.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import {
  createDeckAuthHook,
  decorateDeckRequest,
  validateCredentials,
  signDeckToken,
  checkLoginRateLimit,
} from "./deck-auth.js";

export function registerDeckRoutes(
  app: FastifyInstance,
  config: AppConfig,
  services: Record<string, unknown>,
) {
  // Guard: skip deck route registration if credentials are not configured
  if (!config.deck.jwtSecret || !config.deck.adminPassword) {
    app.log.warn("Deck admin panel disabled: DECK_JWT_SECRET and DECK_ADMIN_PASSWORD must be set");
    return;
  }

  decorateDeckRequest(app);
  const authHook = createDeckAuthHook(config.deck.jwtSecret);

  // Public: login (with rate limiting — 5 attempts/minute per IP)
  app.post("/deck/api/auth/login", async (request, reply) => {
    const ip = request.ip;
    if (!checkLoginRateLimit(ip)) {
      reply.code(429).send({ message: "Too many login attempts. Try again later." });
      return;
    }

    const { username, password } = request.body as { username: string; password: string };

    if (!validateCredentials(username, password, config.deck.adminUser, config.deck.adminPassword)) {
      reply.code(401).send({ message: "Invalid credentials" });
      return;
    }

    const token = signDeckToken(username, config.deck.jwtSecret);
    return { token };
  });

  // Protected: /me
  app.get("/deck/api/auth/me", { onRequest: [authHook] }, async (request) => {
    return { username: (request as any).deckUser };
  });
}
```

Note: Deck routes are registered at the root `app` level, intentionally outside the gateway's scoped plugin context. `PUBLIC_PATH_PREFIXES` ensures `/deck` paths skip the gateway bearer auth hook. Deck applies its own JWT auth via `authHook`.

- [ ] **Step 5: Register deck routes in app.ts**

Add import and call `registerDeckRoutes(app, config, {})` in `buildApp()` — before the existing `app.register()` block (root level, not inside the scoped plugin).

- [ ] **Step 6: Run test — verify it passes**

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/app.ts src/deck/deck-routes.ts test/deck-integration.test.ts
git commit -m "feat(deck): integrate deck routes with gateway, bypass bearer auth for /deck"
```

---

## Chunk 2: Backend Data Layer

### Task 4: RuntimeConfigStore

**Files:**
- Create: `src/deck/deck-settings.ts`
- Test: `test/deck-settings.test.ts`

- [ ] **Step 1: Write tests for RuntimeConfigStore**

Create `test/deck-settings.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { RuntimeConfigStore, MUTABLE_SETTINGS } from "../src/deck/deck-settings.js";
import { loadConfig } from "../src/config/env.js";

// Use a simple in-memory Map to simulate Redis for unit tests
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => { store.set(key, value); },
    del: async (key: string) => { store.delete(key); },
    keys: async (pattern: string) => {
      const prefix = pattern.replace("*", "");
      return [...store.keys()].filter(k => k.startsWith(prefix));
    },
    mGet: async (keys: string[]) => keys.map(k => store.get(k) ?? null),
  };
}

describe("RuntimeConfigStore", () => {
  it("returns base config when no overrides exist", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base prompt" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("base prompt");
  });

  it("merges redis override into effective config", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base prompt" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "overridden prompt");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("overridden prompt");
  });

  it("validates number type with min/max", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await expect(store.setValue("chat.recentMessageLimit", "0")).rejects.toThrow();
    await expect(store.setValue("chat.recentMessageLimit", "101")).rejects.toThrow();
    await store.setValue("chat.recentMessageLimit", "50");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.recentMessageLimit).toBe(50);
  });

  it("rejects unknown keys", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await expect(store.setValue("unknown.key" as any, "value")).rejects.toThrow();
  });

  it("clears an override to revert to default", async () => {
    const baseConfig = loadConfig({ SYSTEM_PROMPT: "base" });
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "override");
    await store.clearValue("chat.systemPrompt");
    const effective = await store.getEffectiveConfig();
    expect(effective.chat.systemPrompt).toBe("base");
  });

  it("getOverrides returns only set values", async () => {
    const baseConfig = loadConfig({});
    const store = new RuntimeConfigStore(createMockRedis() as any, baseConfig);
    await store.setValue("chat.systemPrompt", "custom");
    const overrides = await store.getOverrides();
    expect(overrides).toEqual({ "chat.systemPrompt": "custom" });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- test/deck-settings.test.ts
```

- [ ] **Step 3: Implement RuntimeConfigStore**

Create `src/deck/deck-settings.ts` with MUTABLE_SETTINGS map, typed key validation, number coercion with min/max, Redis get/set/del operations, and getEffectiveConfig merge logic. See spec lines 279-314 for the exact interface.

Key implementation details:
- `MUTABLE_SETTINGS` is the single source of truth for which keys are mutable
- `setValue()` validates key exists in map, coerces type, checks min/max, writes to Redis
- `getEffectiveConfig()` reads all `deck:settings:*` keys from Redis, parses them, and deep-merges into baseConfig clone
- Number values stored as strings in Redis, parsed back on read

- [ ] **Step 4: Run test — verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/deck/deck-settings.ts test/deck-settings.test.ts
git commit -m "feat(deck): add RuntimeConfigStore with typed mutable settings"
```

---

### Task 5: Session Repository Extensions

**Files:**
- Modify: `src/repositories/session-archive-repository.ts` — add listSessions, getSessionWithMessages, getSessionStats to interface + Postgres impl
- Modify: `src/repositories/session-archive-repository.ts` — add InMemory impl
- Test: `test/deck-sessions.test.ts`

- [ ] **Step 1: Write tests for new repository methods**

Create `test/deck-sessions.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";

describe("SessionArchiveRepository deck extensions", () => {
  let repo: InMemorySessionArchiveRepository;

  beforeEach(async () => {
    repo = new InMemorySessionArchiveRepository();
    // Seed test data — note: SessionRecord uses string dates, StoredChatMessage has no `seq` field
    await repo.createSession({ id: "s1", provider: "codex", status: "active", createdAt: "2026-03-10T00:00:00.000Z", lastActivityAt: "2026-03-13T00:00:00.000Z", messageCount: 5, summary: null });
    await repo.createSession({ id: "s2", provider: "claude", status: "active", createdAt: "2026-03-12T00:00:00.000Z", lastActivityAt: "2026-03-12T00:00:00.000Z", messageCount: 3, summary: null });
    await repo.appendMessage({ id: "m1", sessionId: "s1", role: "user", content: "hello docker", provider: "codex", createdAt: "2026-03-13T10:00:00.000Z", metadata: {} });
    await repo.appendMessage({ id: "m2", sessionId: "s1", role: "assistant", content: "Docker help", provider: "codex", latencyMs: 1500, createdAt: "2026-03-13T10:00:01.500Z", metadata: {} });
  });

  describe("listSessions", () => {
    it("returns paginated sessions", async () => {
      const result = await repo.listSessions({ page: 1, limit: 10 });
      expect(result.total).toBe(2);
      expect(result.sessions).toHaveLength(2);
    });

    it("filters by provider", async () => {
      const result = await repo.listSessions({ provider: "codex", page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("filters by date range", async () => {
      const result = await repo.listSessions({ from: new Date("2026-03-11"), to: new Date("2026-03-13"), page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s2");
    });

    it("searches message content", async () => {
      const result = await repo.listSessions({ search: "docker", page: 1, limit: 10 });
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe("s1");
    });

    it("sorts by message_count ascending", async () => {
      const result = await repo.listSessions({ sortBy: "message_count", sortOrder: "asc", page: 1, limit: 10 });
      expect(result.sessions[0].id).toBe("s2"); // 3 messages
      expect(result.sessions[1].id).toBe("s1"); // 5 messages
    });
  });

  describe("getSessionWithMessages", () => {
    it("returns session with all messages", async () => {
      const result = await repo.getSessionWithMessages("s1");
      expect(result).not.toBeNull();
      expect(result!.session.id).toBe("s1");
      expect(result!.messages).toHaveLength(2);
    });

    it("returns null for unknown session", async () => {
      expect(await repo.getSessionWithMessages("unknown")).toBeNull();
    });
  });

  describe("getSessionStats", () => {
    it("returns per-provider statistics", async () => {
      const stats = await repo.getSessionStats();
      expect(stats.byProvider.codex).toBeDefined();
      expect(stats.byProvider.codex!.totalSessions).toBe(1);
      expect(stats.byProvider.codex!.totalMessages).toBe(2);
      // Providers with no data may be absent — return type is Partial<Record<ProviderName, ...>>
      expect(stats.byProvider.gemini).toBeUndefined();
    });

    it("returns daily volume", async () => {
      const stats = await repo.getSessionStats();
      expect(stats.dailyVolume).toBeInstanceOf(Array);
      expect(stats.dailyVolume.length).toBeGreaterThan(0);
      expect(stats.dailyVolume[0]).toHaveProperty("date");
      expect(stats.dailyVolume[0]).toHaveProperty("provider");
      expect(stats.dailyVolume[0]).toHaveProperty("count");
    });
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

- [ ] **Step 3: Add new methods to SessionArchiveRepository interface**

Add `listSessions`, `getSessionWithMessages`, `getSessionStats` to the existing interface. See spec lines 242-273 for exact signatures.

Note: `getSessionStats` return type should use `Partial<Record<ProviderName, ...>>` for `byProvider` — providers with no sessions are omitted rather than included with zero values.

- [ ] **Step 4: Implement InMemorySessionArchiveRepository extensions**

Add in-memory implementations using the existing Map storage. Filter/search/paginate using Array methods.

- [ ] **Step 5: Run test — verify it passes**

- [ ] **Step 6: Implement PostgresSessionArchiveRepository extensions**

Add SQL queries:
- `listSessions`: `SELECT` from `chat_sessions` with WHERE clauses for provider, date range. For `search`, use `EXISTS (SELECT 1 FROM chat_messages WHERE session_id = s.id AND content ILIKE $pattern)`. `ORDER BY` + `LIMIT`/`OFFSET` for pagination. Second query for `COUNT(*)` total.
- `getSessionWithMessages`: `SELECT` session + `SELECT` messages `WHERE session_id = $1 ORDER BY seq`.
- `getSessionStats`: `SELECT provider, COUNT(DISTINCT s.id), COUNT(m.id), AVG(m.latency_ms), ...` with `GROUP BY provider` join. Daily volume: `SELECT DATE(m.created_at), m.provider, COUNT(*)` for last 7 days.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/repositories/session-archive-repository.ts test/deck-sessions.test.ts
git commit -m "feat(deck): add listSessions, getSessionWithMessages, getSessionStats to repository"
```

---

### Task 6: ChatService Refactor for Runtime Config

**Files:**
- Modify: `src/services/chat-service.ts` — accept RuntimeConfigStore, read per-request
- Modify: `src/app.ts` — pass RuntimeConfigStore to ChatService + rate limiter getConfig
- Modify: `src/bootstrap/runtime-services.ts` — create RuntimeConfigStore, pass to ChatService
- Modify: `test/routes.chat.test.ts` — update ChatService construction to new getConfig interface
- Modify: `test/security-observability.test.ts` — update ChatService construction to new getConfig interface
- Test: all existing chat tests should still pass after interface update

- [ ] **Step 1: Modify ChatServiceOptions**

Change `ChatServiceOptions` to accept a `RuntimeConfigStore` (or a getter function) instead of static `systemPrompt` and `recentMessageLimit`:

```typescript
interface ChatServiceOptions {
  metricsRegistry?: MetricsRegistry;
  getConfig: () => Promise<{ systemPrompt: string; recentMessageLimit: number }>;
}
```

- [ ] **Step 2: Update chat/chatStream to use getConfig()**

In both `chat()` and `chatStream()`, replace:
```typescript
// Before
systemPrompt: this.options.systemPrompt
recentMessageLimit: this.options.recentMessageLimit

// After
const { systemPrompt, recentMessageLimit } = await this.options.getConfig();
```

- [ ] **Step 3: Update test files to use new getConfig interface**

Both `test/routes.chat.test.ts` and `test/security-observability.test.ts` construct ChatService with the old `{ systemPrompt, recentMessageLimit }` pattern. Update all occurrences to:

```typescript
new ChatService(sessionService, providerRegistry, {
  metricsRegistry,
  getConfig: async () => ({
    systemPrompt: "You answer questions about mobile app development projects.",
    recentMessageLimit: 12,
  }),
});
```

Search for all `new ChatService(` across the codebase to ensure no occurrences are missed.

- [ ] **Step 4: Update app.ts buildApp() — provide getConfig using static values for test compatibility**

```typescript
const chatService = new ChatService(sessionService, providerRegistry, {
  metricsRegistry,
  getConfig: async () => ({
    systemPrompt: config.chat.systemPrompt,
    recentMessageLimit: config.chat.recentMessageLimit,
  }),
});
```

- [ ] **Step 5: Update runtime-services.ts — provide getConfig using RuntimeConfigStore**

```typescript
const runtimeConfigStore = new RuntimeConfigStore(redisClient, config);
const chatService = new ChatService(sessionService, providerRegistry, {
  metricsRegistry,
  getConfig: async () => {
    const effective = await runtimeConfigStore.getEffectiveConfig();
    return {
      systemPrompt: effective.chat.systemPrompt,
      recentMessageLimit: effective.chat.recentMessageLimit,
    };
  },
});
```

- [ ] **Step 6: Update rate limiter to read from RuntimeConfigStore**

In `src/app.ts`, the `enforceRateLimit` call currently reads `config.security.rateLimitMaxRequests` and `config.security.rateLimitWindowMs` statically. Update to read from RuntimeConfigStore per-request:

```typescript
// In registerSecurityHooks or equivalent:
const effectiveConfig = await runtimeConfigStore.getEffectiveConfig();
await enforceRateLimit(request, rateStore, {
  maxRequests: effectiveConfig.security.rateLimitMaxRequests,
  windowMs: effectiveConfig.security.rateLimitWindowMs,
});
```

Note: The runtimeConfigStore instance needs to be accessible where `enforceRateLimit` is called. Pass it via closure or service injection.

- [ ] **Step 7: Run full test suite — verify nothing broken**

```bash
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/services/chat-service.ts src/app.ts src/bootstrap/runtime-services.ts test/routes.chat.test.ts test/security-observability.test.ts
git commit -m "refactor(chat): read systemPrompt, recentMessageLimit, and rate limit per-request via getConfig()"
```

---

## Chunk 3: Backend Routes

### Task 7: Deck Settings Routes

**Files:**
- Modify: `src/deck/deck-routes.ts` — add GET/PATCH /deck/api/settings
- Modify: `src/deck/deck-settings.ts` — add route handler functions
- Test: extend `test/deck-settings.test.ts` with route-level tests

- [ ] **Step 1: Write route-level tests**

Test via `buildApp()` + `app.inject()`:
- `GET /deck/api/settings` with valid JWT → 200, returns all settings with mutable/readonly flags
- `PATCH /deck/api/settings` with valid JWT + valid payload → 200
- `PATCH /deck/api/settings` with unknown key → 400
- `PATCH /deck/api/settings` with invalid value (number out of range) → 400
- `GET /deck/api/settings` without JWT → 401

- [ ] **Step 2: Implement settings route handlers**

`GET /deck/api/settings`: returns all config values with metadata (key, value, mutable: boolean, type, min?, max?). Combines `getEffectiveConfig()` for current values + `MUTABLE_SETTINGS` for metadata.

`PATCH /deck/api/settings`: accepts `{ "chat.systemPrompt": "new value", "security.rateLimitMaxRequests": "100" }` — canonical dotted keys as defined in `MUTABLE_SETTINGS`. Calls `store.setValue()` for each key, returns updated values. Unknown keys return 400.

- [ ] **Step 3: Register routes in deck-routes.ts**

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deck): add GET/PATCH /deck/api/settings routes"
```

---

### Task 8: Deck Sessions Routes

**Files:**
- Modify: `src/deck/deck-routes.ts` — add session endpoints
- Create: `src/deck/deck-sessions.ts` — session handler functions
- Test: extend `test/deck-sessions.test.ts` with route-level tests

- [ ] **Step 1: Write route-level tests**

Test via `buildApp()` + `app.inject()`:
- `GET /deck/api/sessions` → 200, paginated list
- `GET /deck/api/sessions?provider=codex` → filtered
- `GET /deck/api/sessions?search=docker` → search filter
- `GET /deck/api/sessions?from=2026-03-10&to=2026-03-12` → date range filter
- `GET /deck/api/sessions?sortBy=message_count&sortOrder=asc` → sorted
- `GET /deck/api/sessions/:id` → 200, session + messages
- `GET /deck/api/sessions/:id` with unknown id → 404
- `GET /deck/api/sessions/stats` → 200, aggregated stats with byProvider and dailyVolume
- All without JWT → 401

- [ ] **Step 2: Implement handlers in deck-sessions.ts**

Each handler reads from `SessionArchiveRepository` (passed via services). Parse query params, call repository, return JSON.

- [ ] **Step 3: Register in deck-routes.ts**

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deck): add session list, detail, and stats routes"
```

---

### Task 9: Deck Chat Proxy + OpenAPI Spec Endpoint

**Files:**
- Create: `src/deck/deck-chat.ts` — stream proxy handler
- Create: `src/deck/deck-openapi.ts` — spec endpoint handler
- Modify: `src/deck/deck-routes.ts` — register both
- Test: `test/deck-chat.test.ts`

- [ ] **Step 1: Write test for chat proxy**

```typescript
it("POST /deck/api/chat/stream with valid JWT proxies to ChatService", async () => {
  // Build app with mock ChatService, verify chatStream() is called
});

it("POST /deck/api/chat/stream without JWT returns 401", async () => {
  // ...
});
```

- [ ] **Step 2: Implement deck-chat.ts**

Mirror the SSE streaming pattern from `src/routes/chat.ts` — this is the reference implementation. Key details:

1. Validates JWT (via auth hook on route)
2. Extracts `{ message, provider, sessionId }` from body
3. Calls `reply.hijack()` before writing SSE headers — this prevents Fastify from serializing the response
4. Sets SSE headers on `reply.raw`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
5. Emits `session.started` event with session ID
6. Calls `chatService.chatStream()` with `onEvent` that writes SSE `data:` lines to `reply.raw`
7. Error handling: if `reply.sent` (hijacked), write error as SSE error event; if not, use `handleRouteError`
8. In `finally` block: call `reply.raw.end()` to close the stream

```typescript
export function createDeckChatHandler(chatService: ChatService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { message, provider, sessionId } = request.body as { message: string; provider: string; sessionId?: string };

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    try {
      await chatService.chatStream(/* ... see src/routes/chat.ts for exact params */);
    } catch (error) {
      reply.raw.write(`data: ${JSON.stringify({ type: "error", message: String(error) })}\n\n`);
    } finally {
      reply.raw.end();
    }
  };
}
```

- [ ] **Step 3: Implement deck-openapi.ts**

`@fastify/swagger` is registered unconditionally in `register-openapi.ts`, so `app.swagger()` is always available (even in production — only the Swagger UI is conditional). No fallback needed.

```typescript
export function createOpenApiSpecHandler(app: FastifyInstance) {
  return async () => {
    if (typeof app.swagger !== "function") {
      throw new Error("OpenAPI spec not available");
    }
    return app.swagger();
  };
}
```

- [ ] **Step 3b: Write test for OpenAPI spec endpoint**

Add to `test/deck-chat.test.ts` or create `test/deck-openapi.test.ts`:

```typescript
it("GET /deck/api/openapi-spec with valid JWT returns OpenAPI JSON", async () => {
  // Login, get token, then GET /deck/api/openapi-spec with Bearer token
  // Verify response has openapi field
  const body = JSON.parse(response.body);
  expect(body).toHaveProperty("openapi");
  expect(body).toHaveProperty("paths");
});

it("GET /deck/api/openapi-spec without JWT returns 401", async () => {
  // ...
});
```

- [ ] **Step 4: Register both in deck-routes.ts**

- [ ] **Step 5: Run tests — verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(deck): add chat stream proxy and OpenAPI spec endpoint"
```

---

### Task 10: Deck Static Serve

**Files:**
- Create: `src/deck/deck-static.ts`
- Modify: `src/app.ts` — call registerDeckStatic after registerDeckRoutes

- [ ] **Step 1: Implement deck-static.ts**

```typescript
import path from "node:path";
import fs from "node:fs";
import type { FastifyInstance } from "fastify";

export async function registerDeckStatic(app: FastifyInstance) {
  const deckDistPath = path.join(process.cwd(), "deck", "dist");

  if (!fs.existsSync(deckDistPath)) {
    return; // deck not built — skip static serve
  }

  await app.register(import("@fastify/static"), {
    root: deckDistPath,
    prefix: "/deck/",
    wildcard: false,
    decorateReply: false,
  });

  // SPA fallback: /deck/* → index.html (for client-side routing)
  // Exclude /deck/api/* to avoid serving HTML for API 404s
  app.get("/deck/*", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (path.startsWith("/deck/api/")) {
      return reply.code(404).send({ message: "Not found" });
    }
    return reply.sendFile("index.html", deckDistPath);
  });
}
```

- [ ] **Step 2: Register in app.ts**

After `registerDeckRoutes()`:

```typescript
await registerDeckStatic(app);
```

Note: Registration order matters — API routes first, then static catch-all.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deck): add static file serving for deck/dist with SPA fallback"
```

---

## Chunk 4: Frontend Foundation

### Task 11: Vite + React + Tailwind Scaffold

**Files:**
- Create: `deck/package.json`, `deck/index.html`, `deck/tsconfig.json`, `deck/vite.config.ts`
- Create: `deck/src/index.css`, `deck/src/main.tsx`, `deck/src/App.tsx`
- Modify: root `package.json` — add `build:deck`, `dev:deck`, `build:all` scripts

- [ ] **Step 1: Create deck/package.json**

```json
{
  "name": "varienai-deck",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.0.0",
    "recharts": "^2.15.0",
    "@scalar/api-reference-react": "latest"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0"
  }
}
```

Notes:
- `react-router-dom` pinned to v6 (stable library-mode API). v7 merged with Remix and has framework/library mode ambiguity.
- Tailwind 4 uses `@tailwindcss/vite` plugin instead of PostCSS — no `tailwind.config.js` or `postcss.config.js` needed.
- `@scalar/api-reference-react` — use `latest` and verify `hiddenClients` prop at implementation time.

- [ ] **Step 2: Create remaining scaffold files**

`deck/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/deck/",
  server: {
    proxy: {
      "/deck/api": "http://localhost:3000",
      "/api": "http://localhost:3000",
    },
  },
});
```

`deck/index.html`: Standard Vite entry pointing to `src/main.tsx`.

`deck/tsconfig.json`: Strict React TS config.

`deck/src/index.css`: Tailwind 4 entry — just `@import "tailwindcss";` (no separate config files needed with Tailwind 4 + `@tailwindcss/vite` plugin).

`deck/src/main.tsx`: React root render into `#root`, import `./index.css`.

`deck/src/App.tsx`: Placeholder with `<h1>Deck</h1>`.

- [ ] **Step 3: Install deps + verify dev server starts**

```bash
cd deck && npm install && npm run dev
```

Verify: Vite dev server starts, `http://localhost:5173/deck/` shows "Deck".

- [ ] **Step 4: Add root package.json scripts**

```json
"build:deck": "cd deck && npm ci && npm run build",
"build:all": "npm run build && npm run build:deck",
"dev:deck": "cd deck && npm run dev"
```

- [ ] **Step 5: Commit**

```bash
git add deck/ package.json
git commit -m "feat(deck): scaffold Vite + React + Tailwind frontend"
```

---

### Task 12: Frontend Auth (AuthContext + LoginPage + ProtectedRoute)

**Files:**
- Create: `deck/src/api/client.ts`
- Create: `deck/src/auth/AuthContext.tsx`
- Create: `deck/src/auth/ProtectedRoute.tsx`
- Create: `deck/src/auth/LoginPage.tsx`

- [ ] **Step 1: Create API client**

`deck/src/api/client.ts`: Fetch wrapper that reads token from localStorage, adds `Authorization: Bearer` header, intercepts 401 responses to clear token and redirect to `/deck/login`.

- [ ] **Step 2: Create AuthContext**

`deck/src/auth/AuthContext.tsx`: React context providing `{ token, user, login, logout, isAuthenticated }`. `login()` calls `POST /deck/api/auth/login`, stores token in localStorage. `logout()` clears token.

- [ ] **Step 3: Create ProtectedRoute**

`deck/src/auth/ProtectedRoute.tsx`: Wraps children, redirects to `/deck/login` if not authenticated. Calls `GET /deck/api/auth/me` on mount to verify token.

- [ ] **Step 4: Create LoginPage**

`deck/src/auth/LoginPage.tsx`: Simple form with username + password fields, calls `login()` from AuthContext, navigates to `/deck/dashboard` on success. Shows error message on failure.

- [ ] **Step 5: Update App.tsx with routing**

```tsx
<AuthProvider>
  <QueryClientProvider client={queryClient}>
    <BrowserRouter basename="/deck">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/api-docs" element={<ApiDocsPage />} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
</AuthProvider>
```

Create placeholder pages that return `<div>Page Name</div>`.

- [ ] **Step 6: Verify login flow works end-to-end**

Start backend (`npm run dev`) + frontend (`npm run dev:deck`). Login with DECK_ADMIN_USER/DECK_ADMIN_PASSWORD. Verify redirect to dashboard.

- [ ] **Step 7: Commit**

```bash
git add deck/src/
git commit -m "feat(deck): add auth flow with login page, context, and route protection"
```

---

### Task 13: TopNav Layout

**Files:**
- Create: `deck/src/layout/TopNav.tsx`
- Modify: `deck/src/auth/ProtectedRoute.tsx` — wrap Outlet with TopNav

- [ ] **Step 1: Create TopNav component**

Horizontal nav bar with: logo ("Deck"), nav links (Dashboard, Oturumlar, Ayarlar, Test Chat, API Docs), user info + logout button. Uses `NavLink` from react-router for active state highlighting. Tailwind styled.

- [ ] **Step 2: Integrate into ProtectedRoute**

ProtectedRoute renders `<TopNav />` above `<Outlet />` for all protected pages.

- [ ] **Step 3: Verify navigation works**

- [ ] **Step 4: Commit**

```bash
git add deck/src/layout/ deck/src/auth/ProtectedRoute.tsx
git commit -m "feat(deck): add TopNav layout with navigation"
```

---

## Chunk 5: Frontend Pages

### Task 14: Dashboard Page

**Files:**
- Create: `deck/src/pages/DashboardPage.tsx`
- Create: `deck/src/components/KpiCard.tsx`
- Create: `deck/src/components/ProviderBadge.tsx`

- [ ] **Step 1: Create KpiCard component**

Reusable card showing: label, value, trend indicator (up/down arrow + delta). Tailwind styled.

- [ ] **Step 2: Create ProviderBadge component**

Provider name with icon + status dot (green/red). Used in dashboard and other pages.

- [ ] **Step 3: Implement DashboardPage**

- TanStack Query: `useQuery({ queryKey: ["sessions", "stats"], queryFn: () => client.get("/deck/api/sessions/stats") })`
- 4 KPI cards: aktif oturumlar, toplam mesaj, ort. latency, hata oranı
- Recharts `LineChart` for 7-day message volume (provider-colored lines)
- Recharts `PieChart` for provider distribution
- Provider status list from `GET /deck/api/settings` (provider section)

- [ ] **Step 4: Verify with backend running**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deck): add dashboard page with KPI cards and charts"
```

---

### Task 15: Sessions Page + Detail Page

**Files:**
- Create: `deck/src/pages/SessionsPage.tsx`
- Create: `deck/src/pages/SessionDetailPage.tsx`
- Create: `deck/src/components/ChatBubble.tsx`

- [ ] **Step 1: Create ChatBubble component**

Message bubble with: content, role-based alignment (user right, assistant left), metadata line (latency, provider, finish_reason). Tailwind styled.

- [ ] **Step 2: Implement SessionsPage**

- Provider dropdown filter, date range inputs, search input
- TanStack Query with filter params: `useQuery({ queryKey: ["sessions", filters], queryFn: ... })`
- Table with columns: ID, provider (badge), mesaj sayısı, son aktivite, durum
- Pagination controls
- Row click navigates to `/deck/sessions/:id`

- [ ] **Step 3: Implement SessionDetailPage**

- `useParams()` for session ID
- TanStack Query: `useQuery({ queryKey: ["sessions", id], queryFn: () => client.get(`/deck/api/sessions/${id}`) })`
- Session metadata header (provider, message count, avg latency computed from messages, status)
- Message list using ChatBubble components

- [ ] **Step 4: Verify with backend running**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deck): add sessions list page, detail page, and chat bubble component"
```

---

### Task 16: Settings Page

**Files:**
- Create: `deck/src/pages/SettingsPage.tsx`
- Create: `deck/src/components/SettingField.tsx`

- [ ] **Step 1: Create SettingField component**

Input component with: label, value, onChange, badge ("canlı" green or "restart" red), disabled state for read-only settings. Supports text, number, and textarea (for system prompt) input types.

- [ ] **Step 2: Implement SettingsPage**

- TanStack Query: `useQuery` for GET settings, `useMutation` for PATCH
- 4 tabs: Genel, Provider, Güvenlik, Depolama
- Each tab renders SettingField components for its category
- Mutable fields are editable, read-only fields are disabled with "restart" badge
- "Kaydet" button sends PATCH with changed mutable values only
- Success/error toast notifications

- [ ] **Step 3: Verify with backend running**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(deck): add settings page with tabbed form and live/restart badges"
```

---

### Task 17: Chat Page

**Files:**
- Create: `deck/src/pages/ChatPage.tsx`

- [ ] **Step 1: Implement ChatPage**

- Provider selector: pill buttons from enabled providers (from settings/providers)
- Message list: ChatBubble components
- Input bar: text input + send button
- On send: POST `/deck/api/chat/stream` with `fetch()` + `ReadableStream` for SSE
- Parse SSE events: `session.started`, `assistant.delta` (append to current bubble), `assistant.completed`
- Show streaming indicator while receiving deltas
- Error state: "Yanıt alınamadı" with retry button

SSE parsing:
```typescript
const response = await fetch("/deck/api/chat/stream", { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message, provider, sessionId }) });
const reader = response.body!.getReader();
const decoder = new TextDecoder();
// Read chunks, split by \n\n, parse "data: " prefix
```

- [ ] **Step 2: Verify streaming works end-to-end**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deck): add streaming test chat page"
```

---

### Task 18: API Docs Page

**Files:**
- Create: `deck/src/pages/ApiDocsPage.tsx`

- [ ] **Step 1: Implement ApiDocsPage**

```tsx
import { ApiReferenceReact } from "@scalar/api-reference-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { client } from "../api/client";

export function ApiDocsPage() {
  // Pre-fetch spec with JWT — @scalar/api-reference-react may not support fetchOptions
  const { data: spec, isLoading } = useQuery({
    queryKey: ["openapi-spec"],
    queryFn: () => client.get("/deck/api/openapi-spec"),
  });

  if (isLoading || !spec) return <div className="p-8">Loading API docs...</div>;

  return (
    <div className="h-[calc(100vh-64px)]">
      <ApiReferenceReact
        configuration={{
          spec: { content: spec },
          hiddenClients: true,
          // Disable interactive "Try it out" requests — read-only spec viewing only
        }}
      />
    </div>
  );
}
```

Note: The spec is pre-fetched via the app's API client (which injects JWT automatically), then passed as `spec.content` to the viewer. This avoids relying on `@scalar/api-reference-react`'s `fetchOptions` prop which may not exist. Check the library's docs at implementation time for the exact prop to disable interactive requests — `hiddenClients: true` is the expected config key.

- [ ] **Step 2: Verify page renders OpenAPI spec**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(deck): add read-only OpenAPI docs page"
```

---

## Chunk 6: Build & Deploy

### Task 19: Docker + Build Scripts + .gitignore

**Files:**
- Modify: `Dockerfile` — add deck-build stage, copy deck/dist to runtime
- Modify: `docker-compose.yml` — add DECK_* env vars
- Modify: `.gitignore` — add `deck/dist/`, `deck/node_modules/`, `.superpowers/`

- [ ] **Step 1: Update Dockerfile**

Add after existing `dev` stage, before `runtime` stage:

```dockerfile
FROM node:22-bookworm-slim AS deck-build
WORKDIR /app/deck
COPY deck/package*.json ./
RUN npm ci
COPY deck/ .
RUN npm run build
```

Add to runtime stage (after existing COPY lines):

```dockerfile
COPY --from=deck-build /app/deck/dist ./deck/dist
```

- [ ] **Step 2: Update docker-compose.yml**

Add to **both** `gateway` and `gateway-dev` service environments:

```yaml
DECK_ADMIN_USER: ${DECK_ADMIN_USER:-admin}
DECK_ADMIN_PASSWORD: ${DECK_ADMIN_PASSWORD:?required}
DECK_JWT_SECRET: ${DECK_JWT_SECRET:?required}
```

- [ ] **Step 2b: Update docker-compose.coolify.yml**

Add to the gateway service environment (production deployment):

```yaml
DECK_ADMIN_USER: ${DECK_ADMIN_USER:-admin}
DECK_ADMIN_PASSWORD: ${DECK_ADMIN_PASSWORD}
DECK_JWT_SECRET: ${DECK_JWT_SECRET}
```

Note: These must be configured as Coolify secrets in the deployment dashboard.

- [ ] **Step 3: Update .gitignore**

Add:

```
deck/dist/
deck/node_modules/
.superpowers/
```

- [ ] **Step 4: Verify Docker build**

```bash
docker compose build gateway
```

- [ ] **Step 5: Verify full Docker stack**

```bash
docker compose up -d
```

Open `http://localhost:3000/deck/` — verify login page loads.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .gitignore
git commit -m "feat(deck): add Docker build stage and deployment config"
```

---

### Task 20: Final Integration Test

- [ ] **Step 1: Run full backend test suite**

```bash
npm test
```

All tests pass.

- [ ] **Step 2: Build frontend**

```bash
npm run build:deck
```

Build succeeds, `deck/dist/` created.

- [ ] **Step 3: Start gateway and verify static serve**

```bash
npm run build && npm start
```

Open `http://localhost:3000/deck/` — SPA loads, login works, all pages navigate correctly.

- [ ] **Step 4: Verify all features**

- [ ] Login with DECK_ADMIN_USER/DECK_ADMIN_PASSWORD
- [ ] Dashboard loads KPI cards and charts
- [ ] Sessions page lists sessions with filtering
- [ ] Session detail shows conversation
- [ ] Settings page shows all settings with correct badges
- [ ] Settings PATCH updates runtime values
- [ ] Test chat sends/receives streaming messages
- [ ] API Docs page renders OpenAPI spec in read-only mode

- [ ] **Step 5: Docker integration verification**

```bash
docker compose build gateway
docker compose up -d
```

Open `http://localhost:3000/deck/` — verify login page loads and all features work in Docker environment. Tear down with `docker compose down`.

- [ ] **Step 6: Final commit**

```bash
git commit -m "feat(deck): complete admin panel integration"
```
