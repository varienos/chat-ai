import path from "node:path";
import fs from "node:fs";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export function registerDeckStatic(app: FastifyInstance) {
  const deckDistPath = path.join(process.cwd(), "deck", "dist");

  if (!fs.existsSync(deckDistPath)) {
    return; // deck not built — skip static serve
  }

  app.register(fastifyStatic, {
    root: deckDistPath,
    prefix: "/deck/",
    wildcard: false,
  });

  // Exact /deck route → index.html
  app.get("/deck", async (_request, reply) => {
    return reply.sendFile("index.html", deckDistPath);
  });

  // SPA fallback: /deck/* → index.html (for client-side routing)
  // Exclude /deck/api/* and static asset requests (paths with file extensions)
  app.get("/deck/*", async (request, reply) => {
    const urlPath = request.url.split("?")[0];
    if (urlPath.startsWith("/deck/api/") || /\.\w+$/.test(urlPath)) {
      return reply.code(404).send({ message: "Not found" });
    }
    return reply.sendFile("index.html", deckDistPath);
  });
}
