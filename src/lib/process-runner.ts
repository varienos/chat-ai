import { spawn } from "node:child_process";

export interface ProcessExecution {
  args: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onStderrLine?: (line: string) => void;
  onStdoutLine?: (line: string) => void;
  timeoutMs?: number;
}

export interface ProcessResult {
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

export interface ProcessRunner {
  run(execution: ProcessExecution): Promise<ProcessResult>;
}

export class NodeProcessRunner implements ProcessRunner {
  private readonly allowedCommands: Set<string>;

  constructor(allowedCommands: string[]) {
    this.allowedCommands = new Set(allowedCommands);
  }

  run(execution: ProcessExecution): Promise<ProcessResult> {
    if (!this.allowedCommands.has(execution.command)) {
      return Promise.reject(
        new Error(`Command is not allowlisted: ${execution.command}`),
      );
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let finished = false;
      let timeout: NodeJS.Timeout | undefined;
      const stdoutLines = createLineEmitter(execution.onStdoutLine);
      const stderrLines = createLineEmitter(execution.onStderrLine);

      const child = spawn(execution.command, execution.args, {
        cwd: execution.cwd,
        env: execution.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (
        exitCode: number | null,
        signal: NodeJS.Signals | null,
      ) => {
        if (finished) {
          return;
        }

        finished = true;

        if (timeout) {
          clearTimeout(timeout);
        }

        stdoutLines.flush();
        stderrLines.flush();

        resolve({
          durationMs: Date.now() - startedAt,
          exitCode,
          signal,
          stderr,
          stdout,
          timedOut,
        });
      };

      child.on("error", (error) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        reject(error);
      });

      child.stdout.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stdout += text;
        stdoutLines.push(text);
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stderr += text;
        stderrLines.push(text);
      });

      child.on("close", (exitCode, signal) => {
        finish(exitCode, signal);
      });

      if (execution.timeoutMs) {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, execution.timeoutMs);
      }
    });
  }
}

function safeCall(handler: ((line: string) => void) | undefined, line: string) {
  try {
    const result = handler?.(line);
    // Catch unhandled rejections from async handlers
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err) => {
        console.error("[process-runner] async line handler error:", err);
      });
    }
  } catch (err) {
    console.error("[process-runner] sync line handler error:", err);
  }
}

function createLineEmitter(handler?: (line: string) => void) {
  let buffer = "";

  return {
    flush() {
      if (buffer.length > 0) {
        safeCall(handler, buffer);
        buffer = "";
      }
    },
    push(chunk: string) {
      buffer += chunk;

      let newLineIndex = buffer.indexOf("\n");

      while (newLineIndex >= 0) {
        const line = buffer.slice(0, newLineIndex);
        safeCall(handler, line);
        buffer = buffer.slice(newLineIndex + 1);
        newLineIndex = buffer.indexOf("\n");
      }
    },
  };
}
