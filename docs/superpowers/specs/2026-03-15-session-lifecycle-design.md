# Session Lifecycle: active/completed/error Status Transitions

**Date:** 2026-03-15
**Task:** TASK-31
**Status:** Approved

## Problem

All sessions remain permanently `active`. A session from two days ago with no messages still shows as active — misleading for admins reviewing session history.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Idle timeout mechanism | Background cron job | Predictable, status transitions happen on write, no extra process needed beyond a `setInterval` |
| Error trigger | Fatal errors only | Transient network glitches should not mark a session as broken |
| Resumability | Terminal states | `completed` and `error` are permanent. Chat UX generates a new session UUID on each page load anyway |

## Status Enum

```typescript
type SessionStatus = "active" | "completed" | "error";
```

Transitions are unidirectional:

```
active → completed   (idle timeout)
active → error       (fatal provider error)
```

No transition exists from `completed` or `error` back to `active`.

## Fatal Error Classification

A new error class `FatalProviderError` distinguishes unrecoverable provider failures from transient errors:

```typescript
// src/errors.ts
export class FatalProviderError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "FatalProviderError";
  }
}
```

**Fatal (triggers `error` status):**
- Authentication failure (invalid API key, expired OAuth token)
- Provider completely unreachable after exhausting retries
- Provider returns a permanent rejection (e.g., model not found, account suspended)

**Transient (session stays `active`):**
- Timeout (`TimeoutError`)
- Rate limit (`RateLimitError`)
- Temporary network errors (DNS resolution failure, connection reset)

Provider implementations (`CodexProvider`, `ClaudeProvider`, `GeminiProvider`) wrap unrecoverable errors in `FatalProviderError` in their `chatStream()` and `chat()` methods. The `ChatService` catch block checks `error instanceof FatalProviderError` to decide whether to transition the session.

## Status Transition Triggers

| Trigger | Transition | Location |
|---|---|---|
| Chat stream/chat completes successfully | No change (stays `active`) | — |
| Fatal provider error | `active → error` | `ChatService.chatStream()` and `ChatService.chat()` catch blocks |
| No messages for 30 minutes | `active → completed` | Background cron job via `SessionService.completeIdleSessions()` |

## Backend Changes

### 1. Domain Type (`src/domain/chat-session.ts`)

Change `status: "active"` to `status: SessionStatus` on `SessionRecord`. Export `SessionStatus` type.

### 2. Error Type (`src/errors.ts`)

Add `FatalProviderError` class as described above.

### 3. SessionService (`src/services/session-service.ts`)

Add `updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void>`:
- Fetches the full session, builds an updated `SessionRecord` with the new status
- Calls `archiveRepository.updateSession(updatedSession)` then `cacheRepository.updateSession(updatedSession)` — follows the existing full-object update pattern
- `syncActiveSessionIndex` in the cache repository already removes non-active sessions from the Redis Set

Add `completeIdleSessions(timeoutMs: number): Promise<number>`:
- Queries Postgres with parameterized query: `WHERE status = 'active' AND last_activity_at < now() - make_interval(secs => $1::double precision / 1000)` with `RETURNING id, provider`
- For each updated session, removes from Redis active set and updates cache meta (best-effort, consistent with existing cache-write pattern where failures are logged but swallowed)
- Returns count of transitioned sessions
- Logs count at info level

### 4. ChatService (`src/services/chat-service.ts`)

In both `chatStream()` and `chat()` catch blocks:
- Check `error instanceof FatalProviderError`
- If true, call `sessionService.updateSessionStatus(sessionId, "error")`
- Re-throw the error so the caller still gets the error response

Add a guard at the start of both methods:
```typescript
const session = await this.sessionService.getSession(sessionId);
if (session.status !== "active") {
  throw new ValidationError("Session is no longer active");
}
```

### 5. Cron Job (`src/app.ts`)

In `buildApp()`, after service initialization, register a `setInterval`:
- Interval: configurable via `chat.idleCheckIntervalMs` in AppConfig (default 300000 = 5 min)
- Timeout threshold: configurable via `chat.sessionIdleTimeoutMs` in AppConfig (default 1800000 = 30 min)
- Calls `sessionService.completeIdleSessions(timeoutMs)` wrapped in try/catch to prevent unhandled rejections
- Register cleanup via `app.addHook('onClose', async () => clearInterval(timerRef))`

### 6. Config (`src/config/env.ts`)

Add to the `chat` section of `AppConfig`:
```typescript
idleCheckIntervalMs: number;    // IDLE_CHECK_INTERVAL_MS, default 300000
sessionIdleTimeoutMs: number;   // SESSION_IDLE_TIMEOUT_MS, default 1800000
```

### 7. Repository Changes

**SessionArchiveRepository** (`src/repositories/session-archive-repository.ts`):
- Add `completeIdleSessions(timeoutMs: number): Promise<Array<{ id: string; provider: string }>>` to the interface
- Implement in both `InMemorySessionArchiveRepository` and `PostgresSessionArchiveRepository`
- Add `status?: string` to `SessionListFilters` interface
- Handle status filter in both `listSessions` implementations
- Fix `as "active"` casts to `as SessionStatus` in `getSessionWithMessages` (line 422) and `listSessions` (line 525)
- No separate `updateStatus` method needed — `updateSessionStatus` in `SessionService` uses the existing `updateSession` method

**SessionCacheRepository** (`src/repositories/session-cache-repository.ts`):
- No interface change needed — existing `updateSession` suffices
- `syncActiveSessionIndex` already handles removing non-active sessions from the Redis Set

### 8. Provider Changes (`src/providers/`)

Each provider's `chatStream()` and `chat()` methods should wrap authentication/permanent errors in `FatalProviderError`:
- `CodexProvider`: wrap OpenAI 401/403 responses
- `ClaudeProvider`: wrap Anthropic 401/403 responses
- `GeminiProvider`: wrap Google AI 401/403 responses

### 9. OpenAPI Schema (`src/openapi/schemas.ts`)

Update session status enum from `["active"]` to `["active", "completed", "error"]`.

## Frontend Changes

### 1. Status Badge (`deck/src/pages/SessionsPage.tsx`)

Replace the current binary badge logic with a three-state badge:

| Status | Color | Label |
|---|---|---|
| `active` | Green (`bg-green-100 text-green-800`) | active |
| `completed` | Amber (`bg-amber-100 text-amber-800`) | completed |
| `error` | Red (`bg-red-100 text-red-800`) | error |

### 2. Status Filter (`deck/src/pages/SessionsPage.tsx`)

Add a status filter dropdown next to the existing provider filter (if any) or as the first filter:
- Options: `Tumu`, `Active`, `Completed`, `Error`
- Pass `status` query param to `useSessions` hook
- Backend `GET /deck/api/sessions` already accepts query params — add `status` filtering

### 3. Session Detail (`deck/src/pages/SessionDetailPage.tsx`)

Add a separate status badge element in the header card next to the existing provider badge. This is not a modification of `ProviderBadge` — it is a new inline badge element using the same color mapping as the sessions list.

### 4. API Hooks (`deck/src/api/hooks.ts`)

Add optional `status` param to `useSessions` options. Pass as query param to the sessions endpoint.

### 5. Deck Sessions Handler (`src/deck/deck-sessions.ts`)

Add `status` query parameter support to the list sessions handler. Pass through to `SessionListFilters`.

## Files to Change

| File | Change |
|---|---|
| `src/domain/chat-session.ts` | Add `SessionStatus` type, widen `status` field |
| `src/errors.ts` | Add `FatalProviderError` class |
| `src/config/env.ts` | Add `idleCheckIntervalMs`, `sessionIdleTimeoutMs` to chat config |
| `src/services/session-service.ts` | Add `updateSessionStatus`, `completeIdleSessions` |
| `src/services/chat-service.ts` | Catch fatal errors → `error` status; guard against terminal sessions |
| `src/repositories/session-archive-repository.ts` | Add `completeIdleSessions` to interface, `status` to `SessionListFilters`, fix `as "active"` casts |
| `src/repositories/session-cache-repository.ts` | No interface change, existing `updateSession` suffices |
| `src/providers/codex-provider.ts` | Wrap 401/403 in `FatalProviderError` |
| `src/providers/claude-provider.ts` | Wrap 401/403 in `FatalProviderError` |
| `src/providers/gemini-provider.ts` | Wrap 401/403 in `FatalProviderError` |
| `src/app.ts` | Register idle session cron job with onClose cleanup |
| `src/openapi/schemas.ts` | Update status enum |
| `src/deck/deck-sessions.ts` | Add status filter to list handler |
| `deck/src/pages/SessionsPage.tsx` | Three-state badge, status filter dropdown |
| `deck/src/pages/SessionDetailPage.tsx` | Status badge in header |
| `deck/src/api/hooks.ts` | Add status param to useSessions |

## Not Changing

- Database schema (`sql/001_init_chat_tables.sql`) — `status` column is already `text NOT NULL`, no migration needed
- Session creation — still defaults to `"active"`
- Chat UX (`ChatPage.tsx`) — session UUID generation unchanged
