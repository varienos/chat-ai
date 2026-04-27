<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="varien-dark-logo.png">
    <img src="varien-light-logo.png" alt="Varien Software" width="280">
  </picture>
</p>

<h1 align="center">
  <img src="icon.png" width="32" valign="middle" alt=""> AI Chat Gateway
</h1>

<p align="center">
  <strong>Embeddable, multi-provider AI chat assistant for any website.</strong><br>
  <em>One script tag. Codex, Claude, or Gemini under the hood. Knowledge base + admin panel included.</em>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://nodejs.org"><img alt="Node ≥ 22" src="https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.8-3178c6.svg?logo=typescript&logoColor=white">
  <img alt="Fastify" src="https://img.shields.io/badge/fastify-5.x-000000.svg?logo=fastify&logoColor=white">
  <img alt="Self-hosted" src="https://img.shields.io/badge/deployment-self--hosted-orange.svg">
</p>

---

## What it is

A **self-hosted** gateway that turns any LLM provider (OpenAI Codex, Anthropic
Claude, Google Gemini) into a chat widget you can embed on any website with
a single `<script>` tag. The gateway streams responses over Server-Sent
Events, augments every prompt with a markdown-based knowledge base, and ships
with a full admin panel ("Deck") for runtime configuration — no redeploys
needed to change theme, system prompt, rate limits, or active provider.

Built for product teams who want a branded support assistant without writing
LLM glue code.

> ### ⚠️ This is a self-hosted project
>
> **There is no public hosted version.** You deploy your own gateway and
> point your widget at it.
>
> The URL `https://chat.varien.software` that appears in some examples is
> Varien Software's own production API endpoint — it will reject requests
> that don't carry a Varien-issued token. **Do not use it as your gateway
> URL.** Replace every `chat.varien.software` reference with the hostname of
> your own deployment (e.g. `chat.your-domain.com`, `ai-gateway.internal`,
> `localhost:3000`).

## Features

- 🔌 **Provider abstraction** — Codex (OpenAI), Claude (Anthropic), and
  Gemini (Google) behind one API. Switch the active provider at runtime.
- 📚 **Knowledge base** — Drop markdown files into `knowledge/`; they are
  injected into every prompt. Editable live from the admin panel (≤ 50K chars).
- ⚡ **SSE streaming** — Token-by-token streaming for both the embedded
  widget and the authenticated API.
- 🎨 **Embeddable widget** — One script tag. Light/dark theme, custom colors
  & position, frosted-glass UI, fully responsive.
- 🛠️ **Admin panel (Deck)** — JWT-protected dashboard for sessions,
  knowledge, settings, and live chat testing. Built on React 19 + Vite.
- 🔒 **Built-in auth & rate limiting** — Bearer token for the API, JWT
  cookies for the panel, configurable per-IP rate limits.
- 🐳 **Production-ready** — Single `Dockerfile`, multi-stage build,
  PostgreSQL + Redis, Coolify-friendly compose file with Traefik labels.
- 📑 **OpenAPI 3 + Postman** — Schema auto-generated; Swagger UI at `/docs`.

## Architecture

```
        ┌──────────────────────┐         ┌────────────────────────┐
        │  Browser  (Widget)   │         │   Deck Admin Panel     │
        │  <script> embed      │         │   React 19 + Vite      │
        └──────────┬───────────┘         └───────────┬────────────┘
                   │  SSE / fetch                    │  JWT (cookie)
                   ▼                                 ▼
       ┌──────────────────────────────────────────────────────────┐
       │                  Fastify Gateway (Node 22)               │
       │                                                          │
       │   Provider Abstraction  →  Codex │ Claude │ Gemini       │
       │   Knowledge Base (md)   │  Sessions │ Auth │ Rate Limit  │
       └──────────┬─────────────────────────────────────┬─────────┘
                  ▼                                     ▼
            PostgreSQL 16                            Redis 7
        (sessions, archives)                  (live cache, rate limit)
```

## Quick Start

**Requirements:** Node.js ≥ 22, Docker & Docker Compose.

```bash
git clone https://github.com/varienos/chat-ai.git
cd chat-ai

cp .env.example .env
# Edit .env — set API_AUTH_TOKEN, DECK_ADMIN_PASSWORD, DECK_JWT_SECRET
# (use `openssl rand -hex 32` for each)

docker compose up --build
```

Then open:

- **Widget demo:** http://localhost:3000/
- **Admin panel:** http://localhost:3000/deck
- **API docs:** http://localhost:3000/docs
- **Health check:** http://localhost:3000/health

For host-native development on macOS (faster than Docker for the gateway):

```bash
npm install
npm run dev                    # gateway in watch mode (port 3000)
npm run dev:deck               # deck panel (port 5173)
npm run local:host:start       # start postgres + redis only
npm run local:host:stop
```

## Embed the Widget

Add a single tag to any HTML page:

```html
<script
  src="https://your-gateway.example.com/widget/varien-chat-widget.js"
  data-gateway-url="https://your-gateway.example.com">
</script>
```

The widget appears as a floating button in the bottom-right corner. Theme,
color, position, and icon are pulled from `/api/widget/config` at load time —
change them in the admin panel without redeploying.

## Admin Panel (Deck)

Sign in at `/deck` with `DECK_ADMIN_USER` / `DECK_ADMIN_PASSWORD`. Inside:

| Section          | What you can do                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| **Dashboard**    | Session counts, provider usage breakdown, error rates                        |
| **Sessions**     | Browse all chat history; filter by status (active / completed / error)       |
| **Chat**         | Live test console — try prompts before pushing knowledge changes             |
| **Knowledge**    | Create / edit / delete the markdown files in `knowledge/`                    |
| **Settings**     | Provider switching, system prompt, rate limits, recent message window        |
| **Widget**       | Theme, colors, icon, position, embed snippet generator                       |

All settings persist in PostgreSQL and apply at the next request — no restart.

## Knowledge Base

Every chat request prepends the contents of `knowledge/*.md` to the system
prompt. The shipped layout:

| File                  | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `system-prompt.md`    | Assistant personality, rules, escalation paths   |
| `services.md`         | Services you offer                               |
| `pricing.md`          | Pricing                                          |
| `faq.md`              | Frequently asked questions                       |
| `technologies.md`     | Tech stack you use                               |
| `process.md`          | Your delivery process                            |
| `references.md`       | Past clients / references                        |
| `about.md`            | Company overview                                 |

> **All files except `system-prompt.md` ship as templates** containing
> placeholder content and instructions. Replace them with your own
> information before deploying — the assistant will quote whatever it sees
> in this directory.

Total budget is ~50K characters; the gateway truncates from the bottom if
exceeded. Files are also editable from the Deck **Knowledge** tab — changes
take effect on the next request.

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example)
for the complete list. The most important ones:

| Variable                  | Default                       | Notes                                       |
| ------------------------- | ----------------------------- | ------------------------------------------- |
| `DEFAULT_PROVIDER`        | `codex`                       | `codex` \| `claude` \| `gemini`             |
| `ENABLED_PROVIDERS`       | `codex`                       | Comma-separated list                        |
| `API_AUTH_TOKEN`          | _(required)_                  | Bearer token for `/api/*`                   |
| `DECK_ADMIN_USER`         | `admin`                       | Admin panel login                           |
| `DECK_ADMIN_PASSWORD`     | _(required)_                  | Admin panel password                        |
| `DECK_JWT_SECRET`         | _(required)_                  | ≥ 32 chars; signs admin JWTs                |
| `DATABASE_URL`            | local postgres                | PostgreSQL connection string                |
| `REDIS_URL`               | local redis                   | Redis connection string                     |
| `RATE_LIMIT_MAX_REQUESTS` | `30`                          | Per IP per window                           |
| `RATE_LIMIT_WINDOW_MS`    | `60000`                       | Rate limit window                           |
| `SYSTEM_PROMPT`           | _(see `.env.example`)_        | Overrides the default assistant persona     |
| `CODEX_MODEL`             | `gpt-5.4`                     | Model name passed to the Codex CLI          |
| `OPENAI_API_KEY`          | _(empty)_                     | Required when `CODEX_AUTH_MODE=api_key`     |

Provider-specific auth (Codex / Gemini / Claude) can be supplied either as
mounted CLI auth files (local Docker) or as JSON pasted into
`*_AUTH_JSON` env vars (Coolify / headless deploy).

## API Reference

Full schema at `/openapi.json`; interactive docs at `/docs` (Swagger UI).

### Public

| Method | Path                         | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| GET    | `/health`                    | Liveness probe                         |
| GET    | `/ready`                     | Readiness — checks providers + db      |
| GET    | `/openapi.json`              | OpenAPI 3 schema                       |
| GET    | `/docs`                      | Swagger UI                             |
| GET    | `/api/widget/config`         | Public widget appearance config        |
| POST   | `/api/widget/chat`           | Widget chat (SSE streaming)            |

### Bearer-token (`Authorization: Bearer ${API_AUTH_TOKEN}`)

| Method | Path                         | Description                            |
| ------ | ---------------------------- | -------------------------------------- |
| POST   | `/api/chat/stream`           | Chat completion (SSE streaming)        |
| POST   | `/api/session`               | Create a new session                   |
| GET    | `/metrics`                   | Internal metrics                       |

### Deck (JWT cookie, set by `/deck/api/login`)

| Method     | Path                                         | Description              |
| ---------- | -------------------------------------------- | ------------------------ |
| GET, PATCH | `/deck/api/settings`                         | Read / update settings   |
| GET        | `/deck/api/sessions`                         | List sessions            |
| GET        | `/deck/api/sessions/:id`                     | Single session detail    |
| GET        | `/deck/api/knowledge`                        | List knowledge files     |
| GET, PUT, DELETE | `/deck/api/knowledge/:filename`        | CRUD a knowledge file    |
| POST       | `/deck/api/chat/stream`                      | Live test chat           |

## Development

```bash
npm install
npm test                       # vitest run (unit + integration)
npm run build                  # tsc → dist/
npm run build:all              # gateway + deck
npm run smoke                  # quick end-to-end smoke test
npm run openapi:export         # regenerate docs/openapi/*.json
npm run postman:export         # regenerate postman collection
```

The widget has its own build (`cd widget && npm install && npm run build`),
producing a single bundled IIFE at `widget/dist/varien-chat-widget.js`.

## Deployment

### Coolify (recommended)

The repo ships with [`docker-compose.coolify.yml`](docker-compose.coolify.yml)
preconfigured for Coolify + Traefik with Let's Encrypt. Required Coolify
secrets:

```
API_AUTH_TOKEN          long random token (≥ 32 chars)
DECK_ADMIN_PASSWORD     admin panel password
DECK_JWT_SECRET         ≥ 32 chars
DATABASE_URL            from a Coolify-attached PostgreSQL resource
REDIS_URL               from a Coolify-attached Redis resource
CODEX_AUTH_JSON         contents of ~/.codex/auth.json (if using Codex)
```

Optional:

```
GEMINI_AUTH_JSON        contents of ~/.gemini/oauth_creds.json
CLAUDE_AUTH_JSON        contents of ~/.claude/.credentials.json
ENABLED_PROVIDERS       e.g. codex,claude,gemini
KNOWLEDGE_SYNC_ON_DEPLOY=true
```

After deploy:

```
GET https://your-domain/health      → 200 OK
GET https://your-domain/deck        → admin login screen
```

### Generic Docker Compose

`docker-compose.yml` is the default local stack (gateway + postgres + redis).
For production behind your own reverse proxy, point a TLS terminator at
container port `3000` and set the same env vars listed above.

## Tech Stack

- **Backend** — Fastify 5, TypeScript 5.8, `@fastify/swagger`, JWT, `pg`, `redis`
- **Database** — PostgreSQL 16, Redis 7
- **Admin panel** — React 19, Vite 6, TanStack Query, Tailwind CSS 4,
  React Router 6, ApexCharts
- **Widget** — React 19 (compiled to a 200 KB IIFE bundle), CSS-in-JS,
  no external runtime deps
- **Tests** — Vitest 3
- **Deploy** — Docker (multi-stage), Coolify-ready

## Security

Vulnerability reports → [`SECURITY.md`](SECURITY.md). Please email rather than
opening a public issue.

`.env`, auth dumps, and customer/PII files are kept out of the repo by
[`.gitignore`](.gitignore). Never commit secrets.

## License

[MIT](LICENSE) © 2026 Varien Software INC.

## Author

Built and maintained by **Yiğit Can H.** ([@varienos](https://github.com/varienos))
at [Varien Software](https://varien.software).

<p align="center">
  <a href="https://varien.software">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="varien-dark-logo.png">
      <img src="varien-light-logo.png" alt="Varien Software" width="160">
    </picture>
  </a>
</p>
