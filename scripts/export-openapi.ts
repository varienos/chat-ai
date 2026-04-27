import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildApp } from "../src/app.js";

const outputPath =
  process.env.OPENAPI_EXPORT_PATH ??
  path.join(process.cwd(), "docs/openapi/varienai-gateway.openapi.json");

async function main() {
  const app = buildApp();

  try {
    await app.ready();
    const specification = app.swagger();

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(`${outputPath}`, `${JSON.stringify(specification, null, 2)}\n`);

    console.log(`OpenAPI spec written to ${outputPath}`);
  } finally {
    await app.close();
  }
}

void main();
