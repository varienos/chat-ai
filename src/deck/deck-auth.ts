import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { RedisClient } from "../lib/redis.js";

const TOKEN_EXPIRY = "24h";
const TOKEN_EXPIRY_SECONDS = 86_400; // 24h in seconds
const COOKIE_NAME = "deck_token";

// ── Rate limiting (Redis-backed) ────────────────────────────────────

const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const LOGIN_RATE_LIMIT_MAX = 5; // 5 attempts per minute per IP

export interface LoginRateLimiter {
  check(ip: string): Promise<boolean>;
  reset(ip: string): Promise<void>;
}

export function createRedisLoginRateLimiter(redis: RedisClient): LoginRateLimiter {
  return {
    async check(ip: string): Promise<boolean> {
      const key = `deck:login:ratelimit:${ip}`;
      const count = await redis.incr(key);
      // Always set TTL to avoid orphaned keys if process crashes between INCR and EXPIRE
      await redis.expire(key, LOGIN_RATE_LIMIT_WINDOW_SECONDS);
      return count <= LOGIN_RATE_LIMIT_MAX;
    },
    async reset(ip: string): Promise<void> {
      const key = `deck:login:ratelimit:${ip}`;
      await redis.del(key);
    },
  };
}

/** In-memory fallback for tests. */
export function createInMemoryLoginRateLimiter(): LoginRateLimiter {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return {
    async check(ip: string): Promise<boolean> {
      const now = Date.now();
      for (const [key, val] of attempts) {
        if (now > val.resetAt) attempts.delete(key);
      }
      const entry = attempts.get(ip);
      if (!entry || now > entry.resetAt) {
        attempts.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000 });
        return true;
      }
      entry.count++;
      return entry.count <= LOGIN_RATE_LIMIT_MAX;
    },
    async reset(ip: string): Promise<void> {
      attempts.delete(ip);
    },
  };
}

// ── JWT + Credentials ───────────────────────────────────────────────

export function signDeckToken(username: string, secret: string): string {
  return jwt.sign({ sub: username }, secret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyDeckToken(token: string, secret: string): { sub: string } {
  return jwt.verify(token, secret) as { sub: string };
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function validateCredentials(
  username: string,
  password: string,
  expectedUser: string,
  expectedPassword: string,
): boolean {
  const userMatch = timingSafeCompare(username, expectedUser);
  const passMatch = timingSafeCompare(password, expectedPassword);
  return userMatch && passMatch;
}

// ── Cookie helpers ──────────────────────────────────────────────────
//
// CSRF Protection: SameSite=Lax is sufficient for the Deck admin panel.
// - All state-changing operations use POST (login, logout, settings PATCH, chat stream).
// - SameSite=Lax blocks cross-origin POST requests automatically.
// - The API is same-origin (no CORS), so cross-site requests cannot include the cookie.
// - No additional CSRF token is needed.
// See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitelax
//

const COOKIE_TOKEN_RE = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`);

export function setAuthCookie(reply: FastifyReply, token: string): void {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/deck",
    `Max-Age=${TOKEN_EXPIRY_SECONDS}`,
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

export function clearAuthCookie(reply: FastifyReply): void {
  const parts = [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/deck",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

function parseCookieToken(request: FastifyRequest): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  const match = cookie.match(COOKIE_TOKEN_RE);
  return match?.[1] ?? null;
}

// ── Fastify hooks ───────────────────────────────────────────────────

export function decorateDeckRequest(app: FastifyInstance) {
  app.decorateRequest("deckUser", "");
}

export function createDeckAuthHook(jwtSecret: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Try cookie first, then fall back to Authorization header
    const cookieToken = parseCookieToken(request);
    const authHeader = request.headers.authorization;
    const token = cookieToken ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    if (!token) {
      reply.code(401).send({ message: "Missing or invalid token" });
      return reply;
    }

    try {
      const payload = verifyDeckToken(token, jwtSecret);
      (request as any).deckUser = payload.sub;
    } catch {
      reply.code(401).send({ message: "Invalid or expired token" });
      return reply;
    }
  };
}
