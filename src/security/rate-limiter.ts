import type { RedisClient } from "../lib/redis.js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  consume(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult>;
}

interface Entry {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, Entry>();

  async consume(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const current = this.entries.get(key);

    if (!current || current.resetAt <= now) {
      this.entries.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });

      return {
        allowed: true,
        remaining: Math.max(maxRequests - 1, 0),
        retryAfterMs: windowMs,
      };
    }

    current.count += 1;
    this.entries.set(key, current);

    return {
      allowed: current.count <= maxRequests,
      remaining: Math.max(maxRequests - current.count, 0),
      retryAfterMs: Math.max(current.resetAt - now, 0),
    };
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: RedisClient) {}

  async consume(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const namespacedKey = `rate-limit:${key}`;
    const count = await this.client.incr(namespacedKey);
    let retryAfterMs = await this.client.pTTL(namespacedKey);

    if (count === 1 || retryAfterMs < 0) {
      await this.client.pExpire(namespacedKey, windowMs);
      retryAfterMs = windowMs;
    }

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(maxRequests - count, 0),
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }
}
