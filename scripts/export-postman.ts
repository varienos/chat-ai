import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import Converter from "openapi-to-postmanv2";

import { buildApp } from "../src/app.js";

const outputPath =
  process.env.POSTMAN_EXPORT_PATH ??
  path.join(
    process.cwd(),
    "docs/postman/varienai-gateway.postman_collection.json",
  );

const baseUrl =
  process.env.POSTMAN_BASE_URL ??
  `http://localhost:${process.env.GATEWAY_PORT ?? "3000"}`;

const collectionName = process.env.POSTMAN_COLLECTION_NAME ?? "VarienAI Gateway API";

function buildPostmanSourceSpecification(specification: Record<string, unknown>) {
  const document = structuredClone(specification) as Record<string, unknown>;
  const info = (document.info as Record<string, unknown> | undefined) ?? {};

  document.info = {
    ...info,
    title: collectionName,
  };
  document.servers = [
    {
      url: "{baseUrl}",
      variables: {
        baseUrl: {
          default: baseUrl,
          description: "Gateway base URL",
        },
      },
    },
  ];

  return document;
}

function dedupeCollectionVariables(variables: unknown) {
  if (!Array.isArray(variables)) {
    return variables;
  }

  const deduped = new Map<string, Record<string, unknown>>();

  for (const variable of variables) {
    if (!variable || typeof variable !== "object") {
      continue;
    }

    const record = variable as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key : undefined;

    if (!key) {
      continue;
    }

    const existing = deduped.get(key);
    const value = typeof record.value === "string" ? record.value : "";
    const isSelfReference = value.includes(`{{${key}}}`);

    if (!existing || !isSelfReference) {
      deduped.set(key, record);
    }
  }

  return [...deduped.values()];
}

async function convertToPostmanCollection(specification: Record<string, unknown>) {
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    Converter.convertV2(
      {
        type: "json",
        data: specification,
      },
      {
        folderStrategy: "Paths",
        includeAuthInfoInExample: false,
        requestNameSource: "fallback",
        schemaFaker: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.result) {
          reject(new Error("OpenAPI to Postman conversion failed"));
          return;
        }

        const collectionOutput = result.output?.find(
          (entry) => entry.type === "collection",
        );

        if (!collectionOutput || !collectionOutput.data) {
          reject(new Error("No Postman collection output was produced"));
          return;
        }

        resolve(collectionOutput.data as Record<string, unknown>);
      },
    );
  });
}

async function main() {
  const app = buildApp();

  try {
    await app.ready();

    const specification = buildPostmanSourceSpecification(
      app.swagger() as Record<string, unknown>,
    );
    const collection = await convertToPostmanCollection(specification);

    collection.info = {
      ...((collection.info as Record<string, unknown> | undefined) ?? {}),
      name: collectionName,
    };
    collection.variable = dedupeCollectionVariables(collection.variable);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`);

    console.log(`Postman collection written to ${outputPath}`);
  } finally {
    await app.close();
  }
}

void main();
