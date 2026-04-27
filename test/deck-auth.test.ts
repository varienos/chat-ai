import { describe, it, expect } from "vitest";
import { signDeckToken, verifyDeckToken, validateCredentials, createInMemoryLoginRateLimiter } from "../src/deck/deck-auth.js";

describe("deck-auth", () => {
  const secret = "test-jwt-secret";

  describe("signDeckToken / verifyDeckToken", () => {
    it("signs and verifies a valid token", () => {
      const token = signDeckToken("admin", secret);
      const payload = verifyDeckToken(token, secret);
      expect(payload.sub).toBe("admin");
    });

    it("rejects an invalid token", () => {
      expect(() => verifyDeckToken("invalid", secret)).toThrow();
    });

    it("rejects a token signed with wrong secret", () => {
      const token = signDeckToken("admin", "other-secret");
      expect(() => verifyDeckToken(token, secret)).toThrow();
    });
  });

  describe("validateCredentials", () => {
    it("returns true for matching credentials", () => {
      expect(validateCredentials("admin", "pass", "admin", "pass")).toBe(true);
    });

    it("returns false for wrong password", () => {
      expect(validateCredentials("admin", "wrong", "admin", "pass")).toBe(false);
    });

    it("returns false for wrong username", () => {
      expect(validateCredentials("wrong", "pass", "admin", "pass")).toBe(false);
    });
  });

  describe("LoginRateLimiter (in-memory)", () => {
    it("allows first 5 attempts from same IP", async () => {
      const limiter = createInMemoryLoginRateLimiter();
      const ip = "test-rate-limit";
      for (let i = 0; i < 5; i++) {
        expect(await limiter.check(ip)).toBe(true);
      }
    });

    it("blocks 6th attempt from same IP within window", async () => {
      const limiter = createInMemoryLoginRateLimiter();
      const ip = "test-rate-block";
      for (let i = 0; i < 5; i++) {
        await limiter.check(ip);
      }
      expect(await limiter.check(ip)).toBe(false);
    });

    it("allows attempts from different IPs independently", async () => {
      const limiter = createInMemoryLoginRateLimiter();
      const ip1 = "test-ip1";
      const ip2 = "test-ip2";
      for (let i = 0; i < 5; i++) {
        await limiter.check(ip1);
      }
      expect(await limiter.check(ip2)).toBe(true);
    });

    it("resets counter on successful login", async () => {
      const limiter = createInMemoryLoginRateLimiter();
      const ip = "test-reset";
      for (let i = 0; i < 4; i++) {
        await limiter.check(ip);
      }
      await limiter.reset(ip);
      // After reset, should allow 5 more attempts
      for (let i = 0; i < 5; i++) {
        expect(await limiter.check(ip)).toBe(true);
      }
    });
  });
});
