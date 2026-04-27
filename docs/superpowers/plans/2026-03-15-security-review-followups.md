# Security Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the current review baseline, apply two low-risk security hardening fixes, and capture larger security gaps as backlog tasks.

**Architecture:** Keep the scope narrow and additive. Fix the current verification blockers first, then harden the provider subprocess environment boundary and client-facing error responses with test-first changes that fit the existing Fastify/provider abstractions.

**Tech Stack:** Node.js, TypeScript, Fastify, Vitest, Backlog CLI

---

## Chunk 1: Verification Baseline

### Task 1: Restore Root Verification Path

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/deck-settings-schema.test.ts`
- Verify: `/Users/varienos/Landing/Repo/VarienAI/package.json`
- Verify: `/Users/varienos/Landing/Repo/VarienAI/package-lock.json`

- [ ] **Step 1: Confirm the current failure mode**

Run: `npm test`
Expected: FAIL because `jsonwebtoken` is not installed locally and the settings schema test import is incompatible with NodeNext rules.

- [ ] **Step 2: Fix the explicit TypeScript test issue**

Update the settings schema test to use an explicit `.js` extension and concrete callback types so the test file itself compiles cleanly under the repo TypeScript config.

- [ ] **Step 3: Refresh/install root dependencies without changing scope**

Run the minimum safe install command needed to restore the declared root dependencies, then confirm `jsonwebtoken` resolves from `node_modules`.

- [ ] **Step 4: Re-run the failing verification command**

Run: `npm test`
Expected: the dependency-resolution failure is gone; any remaining failures are now real code/test failures.

## Chunk 2: Subprocess Secret Isolation

### Task 2: Prevent Gateway Secrets From Reaching Provider Subprocesses

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/providers/oauth-only-environment.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/codex-provider.test.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/claude-provider.test.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/gemini-provider.test.ts`

- [ ] **Step 1: Write failing provider env tests**

Add assertions that provider subprocess environments do not inherit gateway-sensitive variables such as `API_AUTH_TOKEN`, `DECK_ADMIN_PASSWORD`, `DECK_JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL`.

- [ ] **Step 2: Run the targeted tests to verify RED**

Run: `npm test -- test/codex-provider.test.ts test/claude-provider.test.ts test/gemini-provider.test.ts`
Expected: FAIL because the current environment builder still forwards those variables.

- [ ] **Step 3: Implement the minimal environment hardening**

Extend the shared environment filtering helper so provider subprocesses start from `process.env` but drop gateway credentials, storage URLs, and provider API keys that should never be exposed to the child CLI.

- [ ] **Step 4: Re-run the targeted tests to verify GREEN**

Run: `npm test -- test/codex-provider.test.ts test/claude-provider.test.ts test/gemini-provider.test.ts`
Expected: PASS

## Chunk 3: 500 Error Sanitization

### Task 3: Stop Returning Raw Internal Error Messages To API Clients

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/lib/route-helpers.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/routes.chat.test.ts`

- [ ] **Step 1: Write a failing regression test**

Add a route test where the provider throws an unexpected internal error message and assert that the client receives a generic 500 response instead of the raw message text.

- [ ] **Step 2: Run the targeted test to verify RED**

Run: `npm test -- test/routes.chat.test.ts`
Expected: FAIL because the current 500 mapper echoes arbitrary internal error messages.

- [ ] **Step 3: Implement the minimal sanitization**

Keep 400/404/504 behavior as-is, but change the generic 500 mapping to return a safe message such as `Internal server error` while preserving detailed logging server-side.

- [ ] **Step 4: Re-run the targeted test to verify GREEN**

Run: `npm test -- test/routes.chat.test.ts`
Expected: PASS

## Chunk 4: Backlog Follow-up And Final Verification

### Task 4: Capture Major Security Gaps

**Files:**
- Verify: `/Users/varienos/Landing/Repo/VarienAI/backlog/config.yml`

- [ ] **Step 1: Compare findings with existing backlog tasks**

Check whether the larger issues are already tracked before creating duplicates.

- [ ] **Step 2: Create missing tasks via Backlog CLI**

Open tasks for the remaining major issues, especially deck token storage in `localStorage` and process-local login throttling.

### Task 5: Final Verification

**Files:**
- Verify: `/Users/varienos/Landing/Repo/VarienAI`

- [ ] **Step 1: Run targeted test suites**

Run the focused Vitest commands that cover the edited areas.

- [ ] **Step 2: Run full repo verification**

Run: `npm test`
Run: `npm run build`
Expected: report the true final state, including any unrelated failures that remain outside this scope.
