# Local Host Fallback Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the validated host-native gateway fallback for local macOS a scriptable, repeatable workflow that can be started, inspected, and stopped without manual environment assembly.

**Architecture:** Keep Redis and PostgreSQL in Docker on alternate host ports while the gateway runs on the host with the working OAuth-backed Codex CLI. Store gateway PID and logs under a local runtime directory so the workflow is observable and restartable without guessing process state.

**Tech Stack:** Bash scripts, npm package scripts, Docker Compose, Node.js gateway runtime, Vitest.

---

## Chunk 1: Test Surface

### Task 1: Add failing coverage for the automation surface

**Files:**
- Modify: `test/docker.files.test.ts`

- [ ] **Step 1: Write the failing test**

Add expectations for:
- `scripts/start-local-host-fallback.sh`
- `scripts/stop-local-host-fallback.sh`
- `scripts/status-local-host-fallback.sh`
- `package.json` scripts for `local:host:start`, `local:host:stop`, and `local:host:status`
- README references to the new npm scripts

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/docker.files.test.ts`
Expected: FAIL because the scripts and package.json entries do not exist yet.

## Chunk 2: Runtime Automation

### Task 2: Implement the host-native fallback scripts

**Files:**
- Create: `scripts/start-local-host-fallback.sh`
- Create: `scripts/stop-local-host-fallback.sh`
- Create: `scripts/status-local-host-fallback.sh`

- [ ] **Step 1: Implement the start script**

The script should:
- create a local runtime directory such as `.local/runtime`
- ensure Docker Redis/PostgreSQL are up on `55432` / `56379`
- verify `codex login status`
- build the gateway
- start `node dist/src/server.js` in the background with the validated local env
- write PID and log files

- [ ] **Step 2: Implement the stop script**

The script should:
- stop the host gateway process using the stored PID if present
- tolerate stale PID files
- leave Docker data intact unless explicitly stopping the support services is appropriate

- [ ] **Step 3: Implement the status script**

The script should:
- report whether the PID is alive
- print gateway URL, log file, and Docker support service state
- probe `/health` when the gateway is up

## Chunk 3: Wiring and Docs

### Task 3: Wire scripts into package.json and README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add npm scripts**

Add:
- `local:host:start`
- `local:host:stop`
- `local:host:status`

- [ ] **Step 2: Update README**

Document the scripted local fallback flow and note that it is intended for local macOS development when Codex fails from inside Docker.

## Chunk 4: Verification

### Task 4: Prove the scripted flow end to end

**Files:**
- No code changes expected

- [ ] **Step 1: Run focused test**

Run: `npm test -- test/docker.files.test.ts`
Expected: PASS

- [ ] **Step 2: Start the scripted fallback**

Run: `npm run local:host:start`
Expected: gateway starts on `127.0.0.1:3020`, Docker support services start on `55432` / `56379`

- [ ] **Step 3: Verify API health**

Run:
- `curl http://127.0.0.1:3020/health`
- `curl http://127.0.0.1:3020/ready`
- `curl -I http://127.0.0.1:3020/docs/`

Expected: healthy responses

- [ ] **Step 4: Verify a real Codex chat response**

Create a session and call `POST /api/chat` with the configured bearer token.
Expected: receive a real assistant message from Codex.

- [ ] **Step 5: Capture status**

Run: `npm run local:host:status`
Expected: reports PID, log path, and healthy gateway state
