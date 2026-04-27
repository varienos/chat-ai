import { describe, expect, it } from "vitest";
import { extractVisitorMetadata } from "../src/lib/visitor-metadata.js";
import { SessionService } from "../src/services/session-service.js";
import { InMemorySessionArchiveRepository } from "../src/repositories/session-archive-repository.js";
import { InMemorySessionCacheRepository } from "../src/repositories/session-cache-repository.js";

function fakeRequest(overrides: {
  ip?: string;
  "user-agent"?: string;
} = {}) {
  return {
    ip: overrides.ip ?? "8.8.8.8",
    headers: {
      "user-agent":
        overrides["user-agent"] ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  };
}

describe("extractVisitorMetadata", () => {
  it("parses Chrome on Windows desktop UA", () => {
    const meta = extractVisitorMetadata(fakeRequest());
    expect(meta.ip).toBe("8.8.8.8");
    expect(meta.browser).toMatch(/Chrome/);
    expect(meta.os).toMatch(/Windows/);
    expect(meta.deviceType).toBe("desktop");
    expect(meta.userAgent).toContain("Mozilla");
  });

  it("parses mobile Safari UA", () => {
    const meta = extractVisitorMetadata(
      fakeRequest({
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      }),
    );
    expect(meta.browser).toMatch(/Safari|Mobile Safari/);
    expect(meta.os).toMatch(/iOS/);
    expect(meta.deviceType).toBe("mobile");
  });

  it("handles empty user-agent gracefully", () => {
    const meta = extractVisitorMetadata(fakeRequest({ "user-agent": "" }));
    expect(meta.ip).toBe("8.8.8.8");
    expect(meta.userAgent).toBe("");
    expect(meta.browser).toBeNull();
    expect(meta.os).toBeNull();
  });

  it("handles missing user-agent header", () => {
    const meta = extractVisitorMetadata({
      ip: "1.2.3.4",
      headers: {},
    });
    expect(meta.ip).toBe("1.2.3.4");
    expect(meta.userAgent).toBe("");
  });

  it("returns country/city as null for private IPs", () => {
    const meta = extractVisitorMetadata(fakeRequest({ ip: "127.0.0.1" }));
    expect(meta.country).toBeNull();
    expect(meta.city).toBeNull();
  });

  it("resolves geoIP for known public IP", () => {
    // 8.8.8.8 is Google DNS — geoip-lite should resolve it
    const meta = extractVisitorMetadata(fakeRequest({ ip: "8.8.8.8" }));
    // Country should be US for Google DNS
    expect(meta.country).toBe("US");
  });
});

describe("SessionService.createSession with visitorMetadata", () => {
  it("stores visitorMetadata when provided", async () => {
    const archive = new InMemorySessionArchiveRepository();
    const cache = new InMemorySessionCacheRepository();
    const service = new SessionService(cache, archive);

    const meta = extractVisitorMetadata(fakeRequest());
    const session = await service.createSession("codex", undefined, meta);

    expect(session.visitorMetadata).not.toBeNull();
    expect(session.visitorMetadata!.ip).toBe("8.8.8.8");
    expect(session.visitorMetadata!.browser).toMatch(/Chrome/);

    // Verify it's retrievable
    const retrieved = await service.getSession(session.id);
    expect(retrieved!.visitorMetadata).toEqual(session.visitorMetadata);
  });

  it("stores null visitorMetadata when not provided", async () => {
    const archive = new InMemorySessionArchiveRepository();
    const cache = new InMemorySessionCacheRepository();
    const service = new SessionService(cache, archive);

    const session = await service.createSession("codex");
    expect(session.visitorMetadata).toBeNull();
  });
});
