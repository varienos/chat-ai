import { describe, expect, it } from "vitest";
import { FatalProviderError } from "../src/errors.js";
import { sanitizeErrorForLog } from "../src/lib/route-helpers.js";

describe("FatalProviderError", () => {
  it("carries cause and correct name", () => {
    const cause = new Error("auth failed");
    const err = new FatalProviderError("Provider authentication failed", cause);
    expect(err.name).toBe("FatalProviderError");
    expect(err.message).toBe("Provider authentication failed");
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("sanitizeErrorForLog", () => {
  it("redacts provider and model details from log-safe errors", () => {
    const err = new Error("OpenAI_API_KEY failed for codex using gpt-5.4");
    err.name = "ProviderTimeoutError";

    const sanitized = sanitizeErrorForLog(err);

    expect(JSON.stringify(sanitized)).not.toMatch(/api[_ -]?key|codex|gpt|openai|provider/i);
    expect(sanitized).toEqual({
      message: "[redacted] failed for [redacted] using [redacted]",
      name: "[redacted]",
    });
  });
});
