import type {
  ProcessExecution,
  ProcessResult,
  ProcessRunner,
} from "../../src/lib/process-runner.js";

export class FakeProcessRunner implements ProcessRunner {
  constructor(private readonly results: ProcessResult[]) {}

  readonly executions: ProcessExecution[] = [];

  async run(execution: ProcessExecution): Promise<ProcessResult> {
    this.executions.push(execution);

    const result = this.results.shift();

    if (!result) {
      throw new Error("Missing fake process result");
    }

    if (execution.onStdoutLine) {
      for (const line of result.stdout.split("\n").filter(Boolean)) {
        await execution.onStdoutLine(line);
      }
    }

    if (execution.onStderrLine) {
      for (const line of result.stderr.split("\n").filter(Boolean)) {
        execution.onStderrLine(line);
      }
    }

    return result;
  }
}
