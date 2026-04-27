import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

function collectRequestPaths(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const paths: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const request = record.request as Record<string, unknown> | undefined;
    const url = request?.url as Record<string, unknown> | undefined;
    const pathSegments = url?.path;

    if (Array.isArray(pathSegments)) {
      paths.push(pathSegments.join("/"));
    }

    paths.push(...collectRequestPaths(record.item));
  }

  return paths;
}

describe("Postman automation", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("exports a Postman collection from the generated OpenAPI document", () => {
    const outputDirectory = mkdtempSync(path.join(tmpdir(), "varienai-postman-"));
    const outputPath = path.join(outputDirectory, "varienai-gateway.postman_collection.json");

    tempDirs.push(outputDirectory);

    execFileSync("node", ["--import=tsx", "scripts/export-postman.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POSTMAN_COLLECTION_NAME: "VarienAI Gateway API",
        POSTMAN_EXPORT_PATH: outputPath,
      },
      stdio: "pipe",
    });

    const collection = JSON.parse(readFileSync(outputPath, "utf8"));
    const requestPaths = collectRequestPaths(collection.item);

    expect(collection.info.name).toBe("VarienAI Gateway API");
    expect(collection.info.schema).toContain("collection");
    expect(requestPaths).toContain("api/chat");
    expect(requestPaths).toContain("api/chat/stream");
    expect(requestPaths).toContain("api/providers/:provider/login-status");
  });
});
