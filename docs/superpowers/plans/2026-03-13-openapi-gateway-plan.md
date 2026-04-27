# OpenAPI Gateway Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic OpenAPI generation and Swagger documentation for the Codex-first gateway without introducing a separate UI project.

**Architecture:** Fastify remains the single source of truth for the API contract. Route-level JSON schemas will define request and response shapes, `@fastify/swagger` will generate the OpenAPI document from those schemas, and `@fastify/swagger-ui` will expose a human-readable docs surface while `/openapi.json` exposes the machine-readable spec. SSE will stay implemented manually, but its event contract will be documented through route metadata and examples.

**Tech Stack:** Fastify, TypeScript, Vitest, `@fastify/swagger`, `@fastify/swagger-ui`, Docker Compose

---

## Chunk 1: Contract Tests First

### Task 1: Add failing OpenAPI coverage tests

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/test/routes.skeleton.test.ts`
- Create: `/Users/varienos/Landing/Repo/VarienAI/test/openapi.test.ts`

- [ ] **Step 1: Write failing tests for `/openapi.json` and docs UI reachability**
- [ ] **Step 2: Write failing tests asserting protected/public metadata, bearer auth, and chat/SSE endpoint presence in the spec**
- [ ] **Step 3: Run the new test file and verify it fails for missing OpenAPI routes**

## Chunk 2: Swagger Bootstrap

### Task 2: Register Fastify OpenAPI plugins

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/package.json`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/app.ts`
- Create: `/Users/varienos/Landing/Repo/VarienAI/src/openapi/register-openapi.ts`

- [ ] **Step 1: Add swagger dependencies and a script to export the current spec**
- [ ] **Step 2: Implement a focused OpenAPI registration module that wires JSON and UI endpoints**
- [ ] **Step 3: Run the OpenAPI test file and verify the bootstrap tests now pass or fail only on missing route schemas**

## Chunk 3: Route Schema Layer

### Task 3: Add route schemas and examples

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/routes/chat.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/routes/providers.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/routes/readiness.ts`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/src/routes/sessions.ts`
- Create: `/Users/varienos/Landing/Repo/VarienAI/src/openapi/schemas.ts`

- [ ] **Step 1: Add reusable schema definitions for session, provider, error, metrics, and health/readiness payloads**
- [ ] **Step 2: Annotate JSON routes with request/response schemas, tags, summaries, and security metadata**
- [ ] **Step 3: Document `/api/chat/stream` using descriptive OpenAPI metadata plus SSE event examples**
- [ ] **Step 4: Run the OpenAPI tests and fix any contract mismatches**

## Chunk 4: Operator Docs and Export Flow

### Task 4: Update runtime docs and export automation

**Files:**
- Modify: `/Users/varienos/Landing/Repo/VarienAI/README.md`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/.env.example`
- Modify: `/Users/varienos/Landing/Repo/VarienAI/scripts/smoke.mjs`
- Create: `/Users/varienos/Landing/Repo/VarienAI/scripts/export-openapi.mjs`

- [ ] **Step 1: Add a script that boots the app, generates the OpenAPI JSON, and writes it deterministically**
- [ ] **Step 2: Document local Docker and Coolify docs access rules, including protected/public behavior and production exposure guidance**
- [ ] **Step 3: Add or update tests around the export script if practical**

## Chunk 5: Verification and Review

### Task 5: Run full verification and perform a general code review pass

**Files:**
- Review only: `/Users/varienos/Landing/Repo/VarienAI/src/**/*`
- Review only: `/Users/varienos/Landing/Repo/VarienAI/test/**/*`

- [ ] **Step 1: Run targeted tests for OpenAPI coverage**
- [ ] **Step 2: Run the full test suite**
- [ ] **Step 3: Run the TypeScript build**
- [ ] **Step 4: Run Docker build plus containerized tests and smoke checks**
- [ ] **Step 5: Perform a manual review of the final diff and apply any cleanup fixes before reporting**
