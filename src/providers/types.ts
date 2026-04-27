import type { ProviderName } from "../domain/providers.js";

export interface ProviderDefinition {
  enabled: boolean;
  name: ProviderName;
}

export type SandboxMode = "danger-full-access" | "read-only" | "workspace-write";

export interface ProviderLoginStatus {
  authenticated: boolean;
  mode: "api_key" | "oauth";
  provider: ProviderName;
}

export interface ChatRequest {
  prompt: string;
  sessionId: string;
}

export interface ChatCompletion {
  content: string;
  finishReason: string;
  metadata: Record<string, unknown>;
  provider: ProviderName;
}

export type ProviderStreamEvent = {
  chunk: string;
  type: "assistant.delta";
};

export interface LlmProvider {
  chat(request: ChatRequest): Promise<ChatCompletion>;
  chatStream(
    request: ChatRequest,
    onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion>;
  checkLoginStatus(): Promise<ProviderLoginStatus>;
  getDefinition(): ProviderDefinition;
}
