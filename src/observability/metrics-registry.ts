import type { ProviderName } from "../domain/providers.js";
import { isTimeoutError } from "../errors.js";

interface ProviderMetricsState {
  activeRequests: number;
  errorCount: number;
  latencySampleCount: number;
  timeoutCount: number;
  totalLatencyMs: number;
  totalRequests: number;
}

export interface ProviderMetricsSnapshot {
  activeRequests: number;
  activeSessions: number;
  averageLatencyMs: number;
  errorCount: number;
  errorRate: number;
  timeoutCount: number;
  totalRequests: number;
}

export class MetricsRegistry {
  private readonly state = new Map<ProviderName, ProviderMetricsState>();

  recordRequestStarted(provider: ProviderName) {
    const state = this.ensureState(provider);
    state.activeRequests += 1;
    state.totalRequests += 1;
  }

  recordRequestCompleted(provider: ProviderName, latencyMs?: number) {
    const state = this.ensureState(provider);
    state.activeRequests = Math.max(state.activeRequests - 1, 0);

    if (typeof latencyMs === "number") {
      state.totalLatencyMs += latencyMs;
      state.latencySampleCount += 1;
    }
  }

  recordRequestFailed(provider: ProviderName, error: unknown) {
    const state = this.ensureState(provider);
    state.activeRequests = Math.max(state.activeRequests - 1, 0);
    state.errorCount += 1;

    if (isTimeoutError(error)) {
      state.timeoutCount += 1;
    }
  }

  snapshot(activeSessionsByProvider: Partial<Record<ProviderName, number>>) {
    const providers = new Set<ProviderName>([
      ...this.state.keys(),
      ...(Object.keys(activeSessionsByProvider) as ProviderName[]),
    ]);
    const output: Partial<Record<ProviderName, ProviderMetricsSnapshot>> = {};

    for (const provider of providers) {
      const state = this.ensureState(provider);

      output[provider] = {
        activeRequests: state.activeRequests,
        activeSessions: activeSessionsByProvider[provider] ?? 0,
        averageLatencyMs:
          state.latencySampleCount > 0
            ? state.totalLatencyMs / state.latencySampleCount
            : 0,
        errorCount: state.errorCount,
        errorRate:
          state.totalRequests > 0 ? state.errorCount / state.totalRequests : 0,
        timeoutCount: state.timeoutCount,
        totalRequests: state.totalRequests,
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      providers: output,
    };
  }

  private ensureState(provider: ProviderName) {
    let state = this.state.get(provider);

    if (!state) {
      state = {
        activeRequests: 0,
        errorCount: 0,
        latencySampleCount: 0,
        timeoutCount: 0,
        totalLatencyMs: 0,
        totalRequests: 0,
      };
      this.state.set(provider, state);
    }

    return state;
  }
}
