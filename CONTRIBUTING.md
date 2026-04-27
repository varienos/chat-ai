# Contributing

Thanks for considering a contribution to Varien AI Gateway. This project is a
self-hosted Codex-first chat gateway with an embeddable widget, Deck admin
panel, knowledge base, OpenAPI docs, and Docker/Coolify deployment assets.

## Current Provider Scope

- Codex is the supported provider today.
- Codex can run through CLI/OAuth subscription auth or through the OpenAI API
  with `CODEX_AUTH_MODE=api_key`.
- Claude and Gemini integrations exist in the codebase but are still in
  development. Contributions in those areas should include clear tests and
  documentation updates.

## Development Setup

Requirements:

- Node.js 22 or newer
- Docker and Docker Compose
- A configured `.env` based on `.env.example`

Common commands:

```bash
npm install
npm test
npm run build
npm run build:all
```

For local host-native gateway work:

```bash
npm run local:host:start
npm run local:host:status
npm run local:host:stop
```

For watch-mode development:

```bash
docker compose up -d postgres redis
npm run dev
npm run dev:deck
```

## Pull Request Guidelines

Before opening a pull request:

- Keep the change focused on one topic.
- Update README, OpenAPI/Postman exports, or deployment notes when behavior
  changes.
- Add or update tests for API, security, storage, provider, widget, and Deck
  changes.
- Run the relevant verification commands locally and list them in the PR.
- Do not commit `.env`, auth JSON, customer data, session dumps, or other
  secrets.

## Coding Guidelines

- Match the existing TypeScript and React style.
- Prefer typed data structures and explicit route schemas over ad hoc parsing.
- Keep provider-specific code isolated under `src/providers/`.
- Keep user-facing documentation accurate about production readiness.
- Treat knowledge base content as prompt input; avoid putting private or
  customer-specific data in examples.

## Security

Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md). Do not open public issues for security reports.

