# Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active/completed/error status transitions to sessions with idle timeout, fatal error detection, and frontend status filtering.

**Architecture:** Widen `SessionRecord.status` from literal `"active"` to a `SessionStatus` union. Providers wrap unrecoverable errors in `FatalProviderError`. `ChatService` catches these and transitions sessions to `error`. A background `setInterval` in `app.ts` bulk-completes idle sessions via Postgres. Frontend gets three-state badges and a status filter dropdown.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, Redis, React, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-15-session-lifecycle-design.md`

---

## Chunk 1: Backend Domain, Errors, and Repository Interface

### Task 1: Add `SessionStatus` type and `FatalProviderError` class

**Files:**
- Modify: `src/domain/chat-session.ts:11`
- Modify: `src/errors.ts` (append)

- [ ] **Step 1: Write test for FatalProviderError**

```typescript
// test/errors.test.ts (create)
import { describe, expect, it } from "vitest";
import { FatalProviderError } from "../src/errors.js";

describe("FatalProviderError", () => {
  it("carries cause and correct name", () => {
    const cause = new Error("auth failed");
    const err = new FatalProviderError("Provider authentication failed", cause);
    expect(err.name).toBe("FatalProviderError");
    expect(err.message).toBe("Provider authentication failed");
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/errors.test.ts`
Expected: FAIL — `FatalProviderError` not exported

- [ ] **Step 3: Add FatalProviderError to src/errors.ts**

Append after `ValidationError` class (after line 34):

```typescript
export class FatalProviderError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "FatalProviderError";
  }
}
```

- [ ] **Step 4: Widen SessionStatus in domain type**

In `src/domain/chat-session.ts`, add type and change line 11:

```typescript
// Add before SessionRecord interface (before line 5)
export type SessionStatus = "active" | "completed" | "error";

// Change line 11 from:
//   status: "active";
// To:
  status: SessionStatus;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/errors.test.ts`
Expected: PASS

- [ ] **Step 6: Fix compile errors from widened status type**

Run: `npm run build 2>&1 | head -30`

Fix known `as "active"` casts in `src/repositories/session-archive-repository.ts` — change to `as SessionStatus`:
- In `getSessionWithMessages` (around line 422): `status: row.status as SessionStatus`
- In `listSessions` (around line 525): `status: row.status as SessionStatus`

Import `SessionStatus` from `"../domain/chat-session.js"` at the top of the file.

Also fix any other compile errors from the type widening. `createSession` in `session-service.ts` still hardcodes `status: "active"` which is valid since `"active"` is a member of the union.

- [ ] **Step 7: Run full build + tests**

Run: `npm run build && npm test`
Expected: All pass — this is a pure type widening, no behavior change yet.

- [ ] **Step 8: Commit**

```bash
git add src/domain/chat-session.ts src/errors.ts src/repositories/session-archive-repository.ts test/errors.test.ts
git commit -m "feat: add SessionStatus type and FatalProviderError class"
```

---

### Task 2: Add `status` to `SessionListFilters` and `completeIdleSessions` to archive repository interface

**Files:**
- Modify: `src/repositories/session-archive-repository.ts:6-15` (interface)
- Modify: `src/repositories/session-archive-repository.ts` (InMemory impl, around line 163)
- Modify: `src/repositories/session-archive-repository.ts` (Postgres impl, around line 457)

- [ ] **Step 1: Write test for status filter in InMemory**

```typescript
// test/session-archive-status-filter.test.ts (create)
import { describe, expect, it } from "vitest";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import type { SessionRecord, StoredChatMessage } from "../src/domain/chat-session.js";

function makeSession(id: string, status: "active" | "completed" | "error", provider = "codex"): SessionRecord {
  return {
    id,
    provider: provider as any,
    status,
    messageCount: 1,
    summary: null,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}

describe("session archive status filter", () => {
  it("filters sessions by status", async () => {
    const repo = new InMemorySessionArchiveRepository();
    await repo.createSession(makeSession("s1", "active"));
    await repo.createSession(makeSession("s2", "completed"));
    await repo.createSession(makeSession("s3", "error"));

    const active = await repo.listSessions({ page: 1, limit: 10, status: "active" });
    expect(active.sessions).toHaveLength(1);
    expect(active.sessions[0].id).toBe("s1");

    const completed = await repo.listSessions({ page: 1, limit: 10, status: "completed" });
    expect(completed.sessions).toHaveLength(1);
    expect(completed.sessions[0].id).toBe("s2");

    const all = await repo.listSessions({ page: 1, limit: 10 });
    expect(all.sessions).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session-archive-status-filter.test.ts`
Expected: FAIL — `status` not recognized in filter / `createSession` may reject non-"active" status

- [ ] **Step 3: Add `status` to `SessionListFilters` interface**

In `src/repositories/session-archive-repository.ts`, add to the interface (around line 6-15):

```typescript
export interface SessionListFilters {
  from?: Date;
  limit: number;
  page: number;
  provider?: string;
  search?: string;
  sortBy?: "last_activity_at" | "started_at" | "message_count";
  sortOrder?: "asc" | "desc";
  status?: string;  // <-- add this line
  to?: Date;
}
```

- [ ] **Step 4: Implement status filter in InMemorySessionArchiveRepository.listSessions()**

After the provider filter (around line 169), add:

```typescript
if (filters.status) {
  filtered = filtered.filter(s => s.status === filters.status);
}
```

- [ ] **Step 5: Implement status filter in PostgresSessionArchiveRepository.listSessions()**

After the existing `WHERE` clause conditions (around line 475), add:

```typescript
if (filters.status) {
  paramIndex++;
  conditions.push(`s.status = $${paramIndex}`);
  values.push(filters.status);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run test/session-archive-status-filter.test.ts`
Expected: PASS

- [ ] **Step 7: Add `completeIdleSessions` to interface and implementations**

Add to the `SessionArchiveRepository` interface (after `updateSession`):

```typescript
completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>>;
```

**InMemory implementation** — add method to `InMemorySessionArchiveRepository`:

```typescript
async completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>> {
  const cutoff = Date.now() - timeoutMs;
  const transitioned: Array<{ id: string; provider: string }> = [];
  for (const session of this.sessions.values()) {
    if (session.status === "active" && new Date(session.lastActivityAt).getTime() < cutoff) {
      session.status = "completed";
      transitioned.push({ id: session.id, provider: session.provider });
    }
  }
  return transitioned;
}
```

**Postgres implementation** — add method to `PostgresSessionArchiveRepository`:

```typescript
async completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>> {
  const result = await this.pool.query<{ id: string; provider: string }>(
    `UPDATE chat_sessions
     SET status = 'completed'
     WHERE status = 'active'
       AND last_activity_at < now() - make_interval(secs => $1::double precision / 1000)
     RETURNING id, provider`,
    [timeoutMs],
  );
  return result.rows;
}
```

- [ ] **Step 8: Write test for completeIdleSessions**

Add to `test/session-archive-status-filter.test.ts`:

```typescript
it("completes idle sessions beyond timeout", async () => {
  const repo = new InMemorySessionArchiveRepository();
  const old = makeSession("s-old", "active");
  old.lastActivityAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
  const recent = makeSession("s-recent", "active");

  await repo.createSession(old);
  await repo.createSession(recent);

  const transitioned = await repo.completeIdleSessions(1800_000); // 30 min timeout
  expect(transitioned).toHaveLength(1);
  expect(transitioned[0].id).toBe("s-old");

  const session = await repo.getSessionWithMessages("s-old");
  expect(session?.session.status).toBe("completed");
});
```

- [ ] **Step 9: Run all tests**

Run: `npm run build && npm test`
Expected: All pass

- [ ] **Step 10: Commit**

```bash
git add src/repositories/session-archive-repository.ts test/session-archive-status-filter.test.ts
git commit -m "feat: add status filter and completeIdleSessions to archive repository"
```

---

## Chunk 2: SessionService, ChatService, Providers, Config, and Cron

### Task 3: Add `updateSessionStatus` and `completeIdleSessions` to SessionService

**Files:**
- Modify: `src/services/session-service.ts`

- [ ] **Step 1: Write test for updateSessionStatus**

```typescript
// test/session-service.status.test.ts (create)
import { describe, expect, it } from "vitest";
import { SessionService } from "../src/services/session-service.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";

function createService() {
  const archive = new InMemorySessionArchiveRepository();
  const cache = new InMemorySessionCacheRepository();
  const service = new SessionService(archive, cache);
  return { service, archive, cache };
}

describe("session status transitions", () => {
  it("updateSessionStatus transitions active to error", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");
    expect(session.status).toBe("active");

    await service.updateSessionStatus(session.id, "error");
    const updated = await service.getSession(session.id);
    expect(updated.status).toBe("error");
  });

  it("updateSessionStatus transitions active to completed", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");

    await service.updateSessionStatus(session.id, "completed");
    const updated = await service.getSession(session.id);
    expect(updated.status).toBe("completed");
  });

  it("rejects transition from terminal state", async () => {
    const { service } = createService();
    const session = await service.createSession("codex");
    await service.updateSessionStatus(session.id, "completed");

    await expect(service.updateSessionStatus(session.id, "active"))
      .rejects.toThrow("Session is no longer active");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session-service.status.test.ts`
Expected: FAIL — `updateSessionStatus` does not exist

- [ ] **Step 3: Implement updateSessionStatus in SessionService**

Add method to `SessionService` class:

```typescript
async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
  const session = await this.getSession(sessionId);
  if (session.status !== "active") {
    throw new ValidationError("Session is no longer active");
  }
  const updated: SessionRecord = { ...session, status };
  await this.archiveRepository.updateSession(updated);
  try {
    await this.cacheRepository.updateSession(updated);
  } catch (err) {
    console.error(`[session] cache update failed for ${sessionId}:`, err);
  }
}
```

Import `SessionStatus` from `"../domain/chat-session.js"` and `ValidationError` from `"../errors.js"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/session-service.status.test.ts`
Expected: PASS

- [ ] **Step 5: Add completeIdleSessions to SessionService**

```typescript
async completeIdleSessions(timeoutMs: number): Promise<number> {
  const transitioned = await this.archiveRepository.completeIdleSessions(timeoutMs);
  for (const { id, provider } of transitioned) {
    try {
      const session = await this.cacheRepository.getSession(id);
      if (session) {
        await this.cacheRepository.updateSession({ ...session, status: "completed" });
      }
    } catch (err) {
      console.error(`[session] cache cleanup failed for ${id}:`, err);
    }
  }
  return transitioned.length;
}
```

- [ ] **Step 6: Write test for completeIdleSessions via service**

Add to `test/session-service.status.test.ts`:

```typescript
it("completeIdleSessions transitions idle sessions", async () => {
  const { service, archive } = createService();
  const session = await service.createSession("codex");

  // Manually backdate lastActivityAt
  const stored = await archive.getSessionWithMessages(session.id);
  if (stored) {
    stored.session.lastActivityAt = new Date(Date.now() - 3600_000).toISOString();
    await archive.updateSession(stored.session);
  }

  const count = await service.completeIdleSessions(1800_000);
  expect(count).toBe(1);

  const updated = await service.getSession(session.id);
  expect(updated.status).toBe("completed");
});
```

- [ ] **Step 7: Run all tests**

Run: `npm run build && npm test`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/services/session-service.ts test/session-service.status.test.ts
git commit -m "feat: add updateSessionStatus and completeIdleSessions to SessionService"
```

---

### Task 4: Wrap fatal errors in providers

**Files:**
- Modify: `src/providers/codex/codex-provider.ts`
- Modify: `src/providers/claude/claude-provider.ts`
- Modify: `src/providers/gemini/gemini-provider.ts`

- [ ] **Step 1: Add FatalProviderError wrapping to CodexProvider**

In `src/providers/codex/codex-provider.ts`, import `FatalProviderError` from `"../../errors.js"`.

In the `chat()` method (around line 109-112) and `chatStream()` (around line 166-169), where `exitCode !== 0` throws `ValidationError`, check stderr for auth keywords:

```typescript
// Replace the existing exitCode !== 0 block:
if (result.exitCode !== 0) {
  console.error("[codex] command failed:", result.stderr);
  const msg = result.stderr?.toLowerCase() ?? "";
  if (msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("401") || msg.includes("403")) {
    throw new FatalProviderError("Codex authentication failed", new Error(result.stderr ?? ""));
  }
  throw new ValidationError("Codex provider request failed");
}
```

Apply this pattern to both `chat()` and `chatStream()` methods.

- [ ] **Step 2: Add FatalProviderError wrapping to ClaudeProvider**

Same pattern in `src/providers/claude/claude-provider.ts`. In `runClaudeCommand()` (around line 164-167):

```typescript
if (result.exitCode !== 0) {
  const errMsg = extractClaudeErrorMessage(result.stderr, result.stdout);
  console.error("[claude] command failed:", errMsg);
  const lower = errMsg.toLowerCase();
  if (lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("invalid") || lower.includes("401") || lower.includes("403")) {
    throw new FatalProviderError("Claude authentication failed", new Error(errMsg));
  }
  throw new ValidationError("Claude provider request failed");
}
```

Import `FatalProviderError` from `"../../errors.js"`.

- [ ] **Step 3: Add FatalProviderError wrapping to GeminiProvider**

Same pattern in `src/providers/gemini/gemini-provider.ts`. In `runGeminiCommand()` (around line 146-149):

```typescript
if (result.exitCode !== 0) {
  console.error("[gemini] command failed:", result.stderr);
  const lower = (result.stderr ?? "").toLowerCase();
  if (lower.includes("authentication") || lower.includes("unauthorized") || lower.includes("invalid") || lower.includes("401") || lower.includes("403")) {
    throw new FatalProviderError("Gemini authentication failed", new Error(result.stderr ?? ""));
  }
  throw new ValidationError("Gemini provider request failed");
}
```

Import `FatalProviderError` from `"../../errors.js"`.

- [ ] **Step 4: Run build + existing provider tests**

Run: `npm run build && npm test`
Expected: All pass — existing tests should still work since FatalProviderError is a subclass of Error

- [ ] **Step 5: Commit**

```bash
git add src/providers/codex/codex-provider.ts src/providers/claude/claude-provider.ts src/providers/gemini/gemini-provider.ts
git commit -m "feat: wrap fatal provider errors in FatalProviderError"
```

---

### Task 5: ChatService — fatal error catch and terminal session guard

**Files:**
- Modify: `src/services/chat-service.ts`

- [ ] **Step 1: Write test for terminal session guard**

```typescript
// test/chat-service.status.test.ts (create)
import { describe, expect, it } from "vitest";
import { ChatService } from "../src/services/chat-service.js";
import { SessionService } from "../src/services/session-service.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";
import { ValidationError } from "../src/errors.js";
import type { ProviderRegistry } from "../src/services/provider-registry.js";

describe("chat service session status guard", () => {
  it("rejects chat on completed session", async () => {
    const archive = new InMemorySessionArchiveRepository();
    const cache = new InMemorySessionCacheRepository();
    const sessionService = new SessionService(archive, cache);
    const session = await sessionService.createSession("codex");
    await sessionService.updateSessionStatus(session.id, "completed");

    const chatService = new ChatService(sessionService, {} as ProviderRegistry, {});

    await expect(
      chatService.chat({ sessionId: session.id, message: "hello" })
    ).rejects.toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/chat-service.status.test.ts`
Expected: FAIL — no guard exists, the error will be something else (provider not found, etc.)

- [ ] **Step 3: Add terminal session guard to ChatService**

In `src/services/chat-service.ts`, in `chat()` method — after getting the session (around line 33-36), add:

```typescript
if (session.status !== "active") {
  throw new ValidationError("Session is no longer active");
}
```

In `chatStream()` method — after getting the session (around line 107-110), add the same guard.

Import `ValidationError` from `"../errors.js"` if not already imported.

- [ ] **Step 4: Add fatal error → session error transition in catch blocks**

In `chat()` catch block (around line 80-83), add before `throw error`:

```typescript
} catch (error) {
  this.options.metricsRegistry?.recordRequestFailed(providerName, error);
  if (error instanceof FatalProviderError) {
    try {
      await this.sessionService.updateSessionStatus(input.sessionId, "error");
    } catch { /* best-effort */ }
  }
  throw error;
}
```

In `chatStream()` catch block (around line 153-158), add similarly:

```typescript
} catch (error) {
  this.options.metricsRegistry?.recordRequestFailed(
    input.provider as ProviderName ?? "codex",
    error,
  );
  if (error instanceof FatalProviderError) {
    try {
      await this.sessionService.updateSessionStatus(input.sessionId, "error");
    } catch { /* best-effort */ }
  }
  throw error;
}
```

Import `FatalProviderError` from `"../errors.js"`.

- [ ] **Step 5: Run test to verify guard passes**

Run: `npx vitest run test/chat-service.status.test.ts`
Expected: PASS

- [ ] **Step 6: Run full build + tests**

Run: `npm run build && npm test`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/services/chat-service.ts test/chat-service.status.test.ts
git commit -m "feat: add session status guard and fatal error transition to ChatService"
```

---

### Task 6: Config and cron job for idle session completion

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/app.ts`

- [ ] **Step 1: Add idle timeout config to AppConfig**

In `src/config/env.ts`, add to the `chat` section:

```typescript
chat: {
  recentMessageLimit: number;
  systemPrompt: string;
  idleCheckIntervalMs: number;
  sessionIdleTimeoutMs: number;
};
```

In `loadConfig()`, add the parsing (alongside existing chat fields):

```typescript
idleCheckIntervalMs: parseInt(process.env.IDLE_CHECK_INTERVAL_MS ?? "300000", 10),
sessionIdleTimeoutMs: parseInt(process.env.SESSION_IDLE_TIMEOUT_MS ?? "1800000", 10),
```

- [ ] **Step 2: Register cron job in app.ts**

In `src/app.ts`, after the `registerDeckRoutes` call, add:

```typescript
// Idle session cleanup cron
const sessionService = services.sessionService;
if (sessionService) {
  const intervalMs = config.chat.idleCheckIntervalMs;
  const timeoutMs = config.chat.sessionIdleTimeoutMs;
  const timer = setInterval(async () => {
    try {
      const count = await sessionService.completeIdleSessions(timeoutMs);
      if (count > 0) {
        app.log.info(`Completed ${count} idle session(s)`);
      }
    } catch (err) {
      app.log.error({ err }, "Idle session cleanup failed");
    }
  }, intervalMs);
  app.addHook("onClose", async () => clearInterval(timer));
}
```

Note: check how `sessionService` is available in the `buildApp` scope — it may need to be extracted from the `services` object or constructed before this point. Follow the existing pattern for how `chatService` and `sessionService` are wired.

- [ ] **Step 3: Run build + tests**

Run: `npm run build && npm test`
Expected: All pass — cron job uses setInterval which does not fire during tests

- [ ] **Step 4: Commit**

```bash
git add src/config/env.ts src/app.ts
git commit -m "feat: add idle session cleanup cron job"
```

---

## Chunk 3: Backend API and Frontend

### Task 7: Deck sessions handler — status filter and OpenAPI

**Files:**
- Modify: `src/deck/deck-sessions.ts`
- Modify: `src/openapi/schemas.ts`

- [ ] **Step 1: Add status query param to deck-sessions handler**

In `src/deck/deck-sessions.ts`, in `createSessionListHandler` (around line 39-48), add status parsing:

```typescript
const status = q.status;
const validStatuses = ["active", "completed", "error"];
if (status && !validStatuses.includes(status)) {
  reply.code(400).send({ message: `Invalid status filter: ${status}` });
  return;
}
```

Add `status` to the filters object passed to `repo.listSessions()`:

```typescript
const filters: SessionListFilters = {
  page,
  limit,
  ...(from && { from: new Date(from) }),
  ...(to && { to: new Date(to) }),
  ...(q.provider && { provider: q.provider }),
  ...(q.search && { search: String(q.search).slice(0, 200) }),
  ...(status && { status }),
  sortBy: ...,
  sortOrder: ...,
};
```

- [ ] **Step 2: Update OpenAPI schema**

In `src/openapi/schemas.ts`, find the session status enum (around line 89-92) and change:

```typescript
// From: enum: ["active"]
// To:
enum: ["active", "completed", "error"]
```

- [ ] **Step 3: Run build + tests**

Run: `npm run build && npm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/deck/deck-sessions.ts src/openapi/schemas.ts
git commit -m "feat: add status filter to sessions API and update OpenAPI enum"
```

---

### Task 8: Frontend — status badges

**Files:**
- Modify: `deck/src/pages/SessionsPage.tsx`
- Modify: `deck/src/pages/SessionDetailPage.tsx`

- [ ] **Step 1: Create StatusBadge helper in SessionsPage**

In `deck/src/pages/SessionsPage.tsx`, add a helper function:

```typescript
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-[#dcfce7] text-[#166534]",
    completed: "bg-[#fef3c7] text-[#92400e]",
    error: "bg-[#fee2e2] text-[#991b1b]",
  };
  const cls = colors[status] ?? colors.active;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
```

Replace the existing status badge rendering in the sessions table with `<StatusBadge status={session.status} />`.

- [ ] **Step 2: Add StatusBadge to SessionDetailPage header**

In `deck/src/pages/SessionDetailPage.tsx`, import or duplicate the `StatusBadge` component (or extract to a shared file if preferred). Add it to the header card next to the provider badge:

```tsx
<StatusBadge status={session.status} />
```

- [ ] **Step 3: Run frontend build**

Run: `cd deck && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add deck/src/pages/SessionsPage.tsx deck/src/pages/SessionDetailPage.tsx
git commit -m "feat(deck): add three-state status badges to sessions UI"
```

---

### Task 9: Frontend — status filter dropdown

**Files:**
- Modify: `deck/src/api/hooks.ts`
- Modify: `deck/src/pages/SessionsPage.tsx`

- [ ] **Step 1: Add status param to useSessions hook**

In `deck/src/api/hooks.ts`, add `status?: string` to the `useSessions` opts type. In the hook body, add:

```typescript
if (opts.status) params.set("status", opts.status);
```

- [ ] **Step 2: Add status filter dropdown to SessionsPage**

In `deck/src/pages/SessionsPage.tsx`:

Add state: `const [statusFilter, setStatusFilter] = useState<string>("");`

Pass to hook: `useSessions({ page, limit: 20, status: statusFilter || undefined })`

Add dropdown UI above the table:

```tsx
<select
  value={statusFilter}
  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
  className="rounded border border-stroke bg-gray px-4 py-2 text-sm text-black dark:border-strokedark dark:bg-meta-4 dark:text-white"
>
  <option value="">Tümü</option>
  <option value="active">Active</option>
  <option value="completed">Completed</option>
  <option value="error">Error</option>
</select>
```

- [ ] **Step 3: Run frontend build**

Run: `cd deck && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Run full backend + frontend build and all tests**

Run: `npm run build && npm test && cd deck && npm run build`
Expected: All pass, zero errors

- [ ] **Step 5: Commit**

```bash
git add deck/src/api/hooks.ts deck/src/pages/SessionsPage.tsx
git commit -m "feat(deck): add session status filter dropdown"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm run build` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `cd deck && npm run build` — frontend builds
- [ ] Manual: Sessions page shows three badge colors
- [ ] Manual: Status filter dropdown works
- [ ] Manual: Session detail page shows status badge
- [ ] Redis: `sessions:active:{provider}` sets only contain active session IDs
