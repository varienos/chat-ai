import { FatalProviderError, NotFoundError, RateLimitError, ValidationError } from "../errors.js";
import { loadKnowledgeBase, loadSystemPromptFile } from "../deck/deck-knowledge.js";
import type { ProviderName } from "../domain/providers.js";
import type { MetricsRegistry } from "../observability/metrics-registry.js";
import type { ProviderRegistry } from "../providers/provider-registry.js";
import type { ProviderStreamEvent } from "../providers/types.js";
import type { SessionService } from "./session-service.js";

interface ChatServiceOptions {
  maxConcurrentStreams?: number;
  metricsRegistry?: MetricsRegistry;
  getConfig: () => Promise<{
    systemPrompt: string;
    recentMessageLimit: number;
    knowledgeBase: { path: string; maxChars: number };
  }>;
}

export class ChatService {
  private activeStreams = 0;
  private readonly maxConcurrentStreams: number;

  constructor(
    private readonly sessionService: SessionService,
    private readonly providerRegistry: ProviderRegistry,
    private readonly options: ChatServiceOptions,
  ) {
    this.maxConcurrentStreams = options.maxConcurrentStreams ?? 10;
  }

  async chat(input: {
    message: string;
    provider?: string;
    sessionId: string;
  }) {
    const session = await this.sessionService.getSession(input.sessionId);

    if (!session) {
      throw new NotFoundError("Session not found");
    }

    if (session.status !== "active") {
      throw new ValidationError("Session is no longer active");
    }

    const providerName = this.resolveProvider(input.provider, session.provider);
    const provider = this.providerRegistry.require(providerName);
    this.options.metricsRegistry?.recordRequestStarted(providerName);

    try {
      await this.sessionService.appendMessage(session.id, {
        content: input.message,
        provider: providerName,
        role: "user",
      });

      const { systemPrompt, recentMessageLimit, knowledgeBase } = await this.options.getConfig();
      const filePrompt = await loadSystemPromptFile(knowledgeBase.path);
      const basePrompt = filePrompt || systemPrompt;
      const kb = await loadKnowledgeBase(knowledgeBase.path, knowledgeBase.maxChars);
      const fullSystemPrompt = kb ? `${basePrompt}\n\n${kb}` : basePrompt;
      const prompt = await this.sessionService.buildPrompt({
        recentMessageLimit,
        sessionId: session.id,
        systemPrompt: fullSystemPrompt,
      });
      const completion = await provider.chat({
        prompt,
        sessionId: session.id,
      });
      const latencyMs =
        typeof completion.metadata.durationMs === "number"
          ? completion.metadata.durationMs
          : undefined;
      const assistantMessage = await this.sessionService.appendMessage(session.id, {
        content: completion.content,
        latencyMs,
        metadata: {
          ...completion.metadata,
          finishReason: completion.finishReason,
        },
        provider: providerName,
        role: "assistant",
      });

      this.options.metricsRegistry?.recordRequestCompleted(providerName, latencyMs);

      return {
        message: assistantMessage,
        provider: providerName,
        sessionId: session.id,
      };
    } catch (error) {
      this.options.metricsRegistry?.recordRequestFailed(providerName, error);
      if (error instanceof FatalProviderError) {
        try {
          await this.sessionService.updateSessionStatus(input.sessionId, "error");
        } catch (statusErr) {
          console.error(`[chat] Failed to update session ${input.sessionId} to error status:`, statusErr instanceof Error ? statusErr.message : statusErr);
        }
      }
      throw error;
    }
  }

  async chatStream(
    input: {
      message: string;
      provider?: string;
      sessionId: string;
    },
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ) {
    if (this.activeStreams >= this.maxConcurrentStreams) {
      throw new RateLimitError();
    }

    // Atomic check-and-increment before any async work to prevent TOCTOU race
    this.activeStreams++;

    try {
      const session = await this.sessionService.getSession(input.sessionId);

      if (!session) {
        throw new NotFoundError("Session not found");
      }

      if (session.status !== "active") {
        throw new ValidationError("Session is no longer active");
      }

      const providerName = this.resolveProvider(input.provider, session.provider);
      const provider = this.providerRegistry.require(providerName);
      this.options.metricsRegistry?.recordRequestStarted(providerName);

      await this.sessionService.appendMessage(session.id, {
        content: input.message,
        provider: providerName,
        role: "user",
      });

      const { systemPrompt, recentMessageLimit, knowledgeBase } = await this.options.getConfig();
      const filePrompt = await loadSystemPromptFile(knowledgeBase.path);
      const basePrompt = filePrompt || systemPrompt;
      const kb = await loadKnowledgeBase(knowledgeBase.path, knowledgeBase.maxChars);
      const fullSystemPrompt = kb ? `${basePrompt}\n\n${kb}` : basePrompt;
      const prompt = await this.sessionService.buildPrompt({
        recentMessageLimit,
        sessionId: session.id,
        systemPrompt: fullSystemPrompt,
      });
      const completion = await provider.chatStream(
        {
          prompt,
          sessionId: session.id,
        },
        onEvent,
      );
      const latencyMs =
        typeof completion.metadata.durationMs === "number"
          ? completion.metadata.durationMs
          : undefined;
      const assistantMessage = await this.sessionService.appendMessage(session.id, {
        content: completion.content,
        latencyMs,
        metadata: {
          ...completion.metadata,
          finishReason: completion.finishReason,
        },
        provider: providerName,
        role: "assistant",
      });

      this.options.metricsRegistry?.recordRequestCompleted(providerName, latencyMs);

      return {
        message: assistantMessage,
        provider: providerName,
        sessionId: session.id,
      };
    } catch (error) {
      this.options.metricsRegistry?.recordRequestFailed(
        input.provider as ProviderName ?? "codex",
        error,
      );
      if (error instanceof FatalProviderError) {
        try {
          await this.sessionService.updateSessionStatus(input.sessionId, "error");
        } catch (statusErr) {
          console.error(`[chat] Failed to update session ${input.sessionId} to error status:`, statusErr instanceof Error ? statusErr.message : statusErr);
        }
      }
      throw error;
    } finally {
      this.activeStreams--;
    }
  }

  resolveProviderName(provider: string): ProviderName {
    return this.resolveProvider(provider, "codex");
  }

  private resolveProvider(
    requestedProvider: string | undefined,
    sessionProvider: ProviderName,
  ): ProviderName {
    if (!requestedProvider) {
      return sessionProvider;
    }

    if (!this.providerRegistry.has(requestedProvider)) {
      throw new ValidationError(`Provider is not enabled: ${requestedProvider}`);
    }

    return requestedProvider;
  }
}
