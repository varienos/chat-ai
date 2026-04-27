import { describe, expect, it } from "vitest";

import { NodeProcessRunner } from "../src/lib/process-runner.js";

describe("NodeProcessRunner", () => {
  it("captures stdout, stderr, and exit details", async () => {
    const runner = new NodeProcessRunner([process.execPath]);

    const result = await runner.run({
      args: ["-e", "process.stdout.write('hello'); process.stderr.write('warn');"],
      command: process.execPath,
      timeoutMs: 1_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("warn");
    expect(result.stdout).toBe("hello");
    expect(result.timedOut).toBe(false);
  });

  it("kills timed out processes", async () => {
    const runner = new NodeProcessRunner([process.execPath]);

    const result = await runner.run({
      args: ["-e", "setTimeout(() => process.exit(0), 1000);"],
      command: process.execPath,
      timeoutMs: 10,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
});
