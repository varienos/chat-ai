import type { ProviderName } from "../domain/providers.js";
import type { LlmProvider, ProviderDefinition } from "./types.js";

export class ProviderRegistry {
  private readonly providerDefinitions: ProviderDefinition[];

  constructor(
    private readonly defaultProvider: ProviderName,
    private readonly providers: LlmProvider[],
  ) {
    this.providerDefinitions = this.providers.map((provider) =>
      provider.getDefinition(),
    );
  }

  getDefaultProvider(): ProviderName {
    return this.defaultProvider;
  }

  get(name: ProviderName): LlmProvider | null {
    return this.providers.find((provider) => provider.getDefinition().name === name) ?? null;
  }

  list(): ProviderDefinition[] {
    return this.providerDefinitions;
  }

  has(name: string): name is ProviderName {
    return this.providerDefinitions.some((provider) => provider.name === name);
  }

  require(name: ProviderName): LlmProvider {
    const provider = this.get(name);

    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }

    return provider;
  }
}
