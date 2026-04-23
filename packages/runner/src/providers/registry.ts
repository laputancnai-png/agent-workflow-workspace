import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

export class NoProviderError extends Error {}

export class ProviderRegistry {
  private available = new Set<string>();

  constructor(private readonly providers: LLMProvider[]) {}

  async probe() {
    const results = await Promise.allSettled(
      this.providers.map(async (provider) => ({
        id: provider.id,
        ok: await provider.isAvailable(),
      })),
    );

    this.available.clear();

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.ok) {
        this.available.add(result.value.id);
      }
    }
  }

  availableIds() {
    return this.providers.filter((provider) => this.available.has(provider.id)).map((provider) => provider.id);
  }

  async complete(req: CompletionRequest, preferredId: string): Promise<CompletionResponse> {
    const ordered = [
      ...this.providers.filter((provider) => provider.id === preferredId && this.available.has(provider.id)),
      ...this.providers.filter((provider) => provider.id !== preferredId && this.available.has(provider.id)),
    ];

    if (ordered.length === 0) {
      throw new NoProviderError('No available LLM provider');
    }

    return ordered[0].complete(req);
  }
}
