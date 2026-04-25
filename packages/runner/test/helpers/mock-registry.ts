import { ProviderRegistry } from '../../src/providers/registry.js';
import type { CompletionRequest, CompletionResponse } from '../../src/providers/types.js';

export class MockRegistry extends ProviderRegistry {
  constructor(private readonly mockResponse: CompletionResponse) {
    super([]);
  }

  override async complete(_req: CompletionRequest, _preferredId: string): Promise<CompletionResponse> {
    return this.mockResponse;
  }
}
