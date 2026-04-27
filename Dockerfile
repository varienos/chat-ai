FROM node:22-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
COPY widget ./widget
RUN npm run build

FROM build AS dev

CMD ["npm", "run", "dev"]

FROM node:22-bookworm-slim AS deck-build
WORKDIR /app/deck
COPY deck/package*.json ./
RUN npm ci
COPY deck/ .
RUN npm run build

FROM node:22-bookworm-slim AS widget-build
WORKDIR /app/widget
COPY widget/package*.json ./
RUN npm ci
COPY widget/ .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends tini gosu ca-certificates && rm -rf /var/lib/apt/lists/*

RUN npm i -g @openai/codex@latest @google/gemini-cli@latest @anthropic-ai/claude-code@latest

RUN groupadd -r appuser && useradd -r -g appuser -d /home/appuser -m appuser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=deck-build /app/deck/dist ./deck/dist
COPY --from=widget-build /app/widget/dist ./widget/dist
COPY --from=build /app/scripts ./scripts
COPY sql ./sql
COPY knowledge ./knowledge.defaults

RUN chown -R appuser:appuser /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

STOPSIGNAL SIGTERM
ENTRYPOINT ["tini", "--", "/bin/sh", "/app/scripts/docker-entrypoint.sh"]
CMD ["npm", "start"]
