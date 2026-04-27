import { Client } from "pg";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://gateway:3000";
const apiAuthToken = process.env.SMOKE_API_AUTH_TOKEN ?? process.env.API_AUTH_TOKEN;
const databaseUrl = process.env.SMOKE_DATABASE_URL ?? process.env.DATABASE_URL;
const requireAuth = process.env.SMOKE_REQUIRE_AUTH === "true";

async function main() {
  await assertOk("/health");
  await assertOk("/openapi.json");
  await assertOk("/docs/");
  await assertPostgresSchema();
  const providerInfo = await getJson("/api/providers");
  const loginStatuses = await Promise.all(
    providerInfo.providers.map(async (provider) => ({
      name: provider.name,
      status: await postJson(`/api/providers/${provider.name}/login-status`, {}),
    })),
  );
  const unauthenticatedProviders = loginStatuses
    .filter(({ status }) => !status.authenticated)
    .map(({ name }) => name);

  if (unauthenticatedProviders.length > 0) {
    await assertStatus("/ready", 503);

    if (requireAuth) {
      throw new Error(
        `Shared provider auth bootstrap is missing for: ${unauthenticatedProviders.join(", ")}`,
      );
    }

    console.warn(
      `Skipping chat smoke step because provider auth is incomplete: ${unauthenticatedProviders.join(", ")}`,
    );
    return;
  }

  await assertOk("/ready");
  const session = await postJson("/api/session", {
    provider: providerInfo.defaultProvider,
  });

  await postJson("/api/chat", {
    message: "Reply with exactly the word hello.",
    provider: providerInfo.defaultProvider,
    sessionId: session.id,
  });
}

async function assertPostgresSchema() {
  if (!databaseUrl) {
    return;
  }

  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(`
      select
        to_regclass('public.chat_sessions') as chat_sessions,
        to_regclass('public.chat_messages') as chat_messages
    `);
    const row = result.rows[0] ?? {};

    if (!row.chat_sessions || !row.chat_messages) {
      throw new Error("Postgres schema bootstrap did not create expected tables.");
    }
  } finally {
    await client.end();
  }
}

async function assertOk(path) {
  await assertStatus(path, 200);
}

async function assertStatus(path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: buildHeaders(),
  });

  if (response.status !== expectedStatus) {
    throw new Error(
      `Request failed for ${path}: expected ${expectedStatus}, received ${response.status}`,
    );
  }
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      ...buildHeaders(),
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }

  return response.json();
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }

  return response.json();
}

function buildHeaders() {
  return apiAuthToken ? { authorization: `Bearer ${apiAuthToken}` } : {};
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
