import type { ProviderName } from "../domain/providers.js";
import { ValidationError } from "../errors.js";
import type {
  ChatCompletion,
  ChatRequest,
  LlmProvider,
  ProviderDefinition,
  ProviderStreamEvent,
} from "./types.js";

export class StaticProvider implements LlmProvider {
  constructor(
    private readonly name: ProviderName,
    private readonly enabled: boolean,
  ) {}

  getDefinition(): ProviderDefinition {
    return {
      enabled: this.enabled,
      name: this.name,
    };
  }

  async chat(_request: ChatRequest): Promise<ChatCompletion> {
    throw new ValidationError(`Provider ${this.name} is not wired for chat`);
  }

  async chatStream(
    _request: ChatRequest,
    _onEvent: (event: ProviderStreamEvent) => Promise<void> | void,
  ): Promise<ChatCompletion> {
    throw new ValidationError(`Provider ${this.name} is not wired for chat`);
  }

  async checkLoginStatus() {
    return {
      authenticated: false,
      mode: "oauth" as const,
      provider: this.name,
    };
  }
}
