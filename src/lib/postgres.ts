import { Pool } from "pg";

export function createPostgresPool(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[postgres] unexpected idle client error:", err);
  });
  return pool;
}
