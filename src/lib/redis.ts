import { createClient } from "redis";

export function createRedisClient(url: string) {
  const client = createClient({ url });
  client.on("error", (err) => console.error("[redis] client error:", err));
  return client;
}

export type RedisClient = ReturnType<typeof createRedisClient>;
