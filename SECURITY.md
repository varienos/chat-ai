# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
**privately** by emailing:

**[yigitcan@varien.com.tr](mailto:yigitcan@varien.com.tr)**

Please do **not** open a public GitHub issue for security vulnerabilities.

We aim to:

- Acknowledge your report within **72 hours**
- Provide an initial assessment within **7 days**
- Ship a patch for critical issues within **14 days**

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept code, if possible)
- Affected version(s) and configuration
- Any suggested mitigation

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Best Practices for Operators

When deploying this gateway in production:

- **Strong secrets** — Generate cryptographically random values for
  `API_AUTH_TOKEN`, `DECK_ADMIN_PASSWORD`, and `DECK_JWT_SECRET`
  (≥ 32 characters). Use a password manager or `openssl rand -hex 32`.
- **Never commit `.env`** — Already enforced by `.gitignore`. Treat the file
  like a password.
- **HTTPS only** — Run behind TLS termination (the included Coolify setup
  uses Let's Encrypt by default).
- **Rate limiting** — Tune `RATE_LIMIT_MAX_REQUESTS` and
  `RATE_LIMIT_WINDOW_MS` to your expected traffic; defaults assume a small
  embedded widget.
- **Knowledge base hygiene** — Files under `knowledge/` are injected into
  every LLM prompt. Audit content for PII, internal data, or anything you
  would not want surfaced in chat responses.
- **Provider auth isolation** — Codex/Claude/Gemini auth tokens are mounted
  as separate Docker volumes; never bake them into images.
- **Database & Redis** — Bind to internal networks only. The included
  `docker-compose.yml` exposes ports for local development; in production
  remove host port mappings.

## Disclosure Policy

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
once a fix is available, we will credit the reporter (unless anonymity is
requested) in the release notes.
