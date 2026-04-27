import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface SqlQueryable {
  query(sql: string): Promise<unknown>;
}

export async function applyPostgresSchema(queryable: SqlQueryable) {
  const schemaSql = await loadPostgresSchemaSql();
  await queryable.query(schemaSql);

  const migrationSql = await loadPostgresMigrationSql("002_add_visitor_metadata.sql");
  await queryable.query(migrationSql);
}

export async function loadPostgresSchemaSql(schemaPath?: string) {
  const resolvedSchemaPath = schemaPath ?? (await resolvePostgresSchemaPath());

  return readFile(resolvedSchemaPath, "utf8");
}

export async function loadPostgresMigrationSql(filename: string) {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "sql", filename),
    resolve(moduleDirectory, "../../sql", filename),
    resolve(moduleDirectory, "../../../sql", filename),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return readFile(candidate, "utf8");
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(
    `Unable to locate sql/${filename} for Postgres migration.`,
  );
}

async function resolvePostgresSchemaPath() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "sql", "001_init_chat_tables.sql"),
    resolve(moduleDirectory, "../../sql", "001_init_chat_tables.sql"),
    resolve(moduleDirectory, "../../../sql", "001_init_chat_tables.sql"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(
    "Unable to locate sql/001_init_chat_tables.sql for Postgres schema bootstrap.",
  );
}
