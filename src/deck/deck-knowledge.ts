import { promises as fs } from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const FILENAME_REGEX = /^[a-z0-9-]+\.md$/;

function validateFilename(filename: string): boolean {
  return FILENAME_REGEX.test(filename) && !filename.includes("..");
}

function safePath(basePath: string, filename: string): string {
  const resolved = path.resolve(basePath, filename);
  if (!resolved.startsWith(path.resolve(basePath))) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export interface KnowledgeFile {
  name: string;
  size: number;
  modifiedAt: string;
}

const SYSTEM_PROMPT_FILE = "system-prompt.md";

/** Load system-prompt.md from the knowledge base directory. Returns empty string if not found. */
export async function loadSystemPromptFile(basePath: string): Promise<string> {
  try {
    return await fs.readFile(path.join(basePath, SYSTEM_PROMPT_FILE), "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    console.error(`[knowledge-base] Failed to load system prompt: ${err instanceof Error ? err.message : err}`);
    return "";
  }
}

export async function loadKnowledgeBase(basePath: string, maxChars: number): Promise<string> {
  try {
    await fs.access(basePath);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    console.error(`[knowledge-base] Cannot access directory ${basePath}: ${err instanceof Error ? err.message : err}`);
    return "";
  }

  const entries = await fs.readdir(basePath);
  const mdFiles = entries
    .filter(f => f.endsWith(".md") && !f.startsWith(".") && f !== SYSTEM_PROMPT_FILE)
    .sort();

  if (mdFiles.length === 0) return "";

  const sections: string[] = [];
  let totalChars = 0;

  for (const file of mdFiles) {
    try {
      const content = await fs.readFile(path.join(basePath, file), "utf-8");
      totalChars += content.length;

      if (totalChars > maxChars) {
        console.warn(`[knowledge-base] Total content exceeds ${maxChars} chars limit, truncating at file: ${file}`);
        break;
      }

      const title = file.replace(/\.md$/, "").replace(/-/g, " ");
      sections.push(`## ${title}\n${content}`);
    } catch (err) {
      console.error(`[knowledge-base] Failed to read file ${file}: ${err instanceof Error ? err.message : err}`);
      // Skip this file, continue with others
    }
  }

  if (sections.length === 0) return "";
  return `Knowledge Base:\n\n${sections.join("\n\n")}`;
}

export function registerKnowledgeRoutes(
  app: FastifyInstance,
  basePath: string,
  authHook: any,
) {
  // Ensure directory exists
  fs.mkdir(basePath, { recursive: true }).catch(() => {});

  // GET /deck/api/knowledge — list files
  app.get("/deck/api/knowledge", { onRequest: [authHook] }, async () => {
    try {
      await fs.access(basePath);
    } catch {
      return { files: [] };
    }

    const entries = await fs.readdir(basePath);
    const mdFiles = entries.filter(f => f.endsWith(".md") && !f.startsWith(".")).sort();

    const files: KnowledgeFile[] = [];
    for (const name of mdFiles) {
      const stat = await fs.stat(path.join(basePath, name));
      files.push({
        name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    return { files };
  });

  // GET /deck/api/knowledge/:filename — get file content
  app.get("/deck/api/knowledge/:filename", { onRequest: [authHook] }, async (request, reply) => {
    const { filename } = request.params as { filename: string };

    if (!validateFilename(filename)) {
      reply.code(400).send({ message: "Invalid filename. Use lowercase letters, numbers, hyphens, and .md extension." });
      return;
    }

    try {
      const filePath = safePath(basePath, filename);
      const content = await fs.readFile(filePath, "utf-8");
      return { name: filename, content };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Path traversal detected") {
        reply.code(400).send({ message: "Invalid file path" });
        return;
      }
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        reply.code(404).send({ message: "File not found" });
        return;
      }
      reply.code(500).send({ message: "Failed to read file" });
    }
  });

  // PUT /deck/api/knowledge/:filename — create or update file
  app.put("/deck/api/knowledge/:filename", { onRequest: [authHook] }, async (request, reply) => {
    const { filename } = request.params as { filename: string };

    if (!validateFilename(filename)) {
      reply.code(400).send({ message: "Invalid filename. Use lowercase letters, numbers, hyphens, and .md extension." });
      return;
    }

    const body = request.body as { content?: string } | null;
    if (!body || typeof body.content !== "string") {
      reply.code(400).send({ message: "Body must contain { content: string }" });
      return;
    }

    await fs.mkdir(basePath, { recursive: true });
    const filePath = safePath(basePath, filename);
    await fs.writeFile(filePath, body.content, "utf-8");

    return { ok: true, name: filename };
  });

  // DELETE /deck/api/knowledge/:filename — delete file
  app.delete("/deck/api/knowledge/:filename", { onRequest: [authHook] }, async (request, reply) => {
    const { filename } = request.params as { filename: string };

    if (!validateFilename(filename)) {
      reply.code(400).send({ message: "Invalid filename. Use lowercase letters, numbers, hyphens, and .md extension." });
      return;
    }

    try {
      const filePath = safePath(basePath, filename);
      await fs.unlink(filePath);
      return { ok: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "Path traversal detected") {
        reply.code(400).send({ message: "Invalid file path" });
        return;
      }
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        reply.code(404).send({ message: "File not found" });
        return;
      }
      reply.code(500).send({ message: "Failed to delete file" });
    }
  });
}
