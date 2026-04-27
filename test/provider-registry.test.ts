import { describe, expect, it } from "vitest";

import { ProviderRegistry } from "../src/providers/provider-registry.js";
import { StaticProvider } from "../src/providers/static-provider.js";

describe("ProviderRegistry", () => {
  it("returns the configured default provider and provider definitions", () => {
    const registry = new ProviderRegistry("codex", [
      new StaticProvider("codex", true),
    ]);

    expect(registry.getDefaultProvider()).toBe("codex");
    expect(registry.list()).toEqual([
      {
        enabled: true,
        name: "codex",
      },
    ]);
  });
});
