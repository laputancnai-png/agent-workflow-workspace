import { describe, expect, it, vi } from 'vitest';

import { ProviderRegistry } from '../src/providers/registry.js';
import type { CompletionRequest, LLMProvider } from '../src/providers/types.js';

function makeProvider(id: string, available: boolean): LLMProvider {
  return {
    id,
    isAvailable: vi.fn().mockResolvedValue(available),
    complete: vi.fn().mockResolvedValue({ content: 'ok', stop_reason: 'end_turn' }),
  };
}

describe('ProviderRegistry', () => {
  it('routes to preferred provider when available', async () => {
    const anthropic = makeProvider('anthropic', true);
    const openai = makeProvider('openai', true);
    const registry = new ProviderRegistry([anthropic, openai]);
    const request: CompletionRequest = { model: 'claude-opus', messages: [], max_tokens: 100 };

    await registry.probe();
    await registry.complete(request, 'anthropic');

    expect(anthropic.complete).toHaveBeenCalledWith(request);
    expect(openai.complete).not.toHaveBeenCalled();
  });

  it('falls back to next provider when preferred unavailable', async () => {
    const anthropic = makeProvider('anthropic', false);
    const openai = makeProvider('openai', true);
    const registry = new ProviderRegistry([anthropic, openai]);
    const request: CompletionRequest = { model: 'gpt-4', messages: [], max_tokens: 100 };

    await registry.probe();
    await registry.complete(request, 'anthropic');

    expect(openai.complete).toHaveBeenCalledWith(request);
  });

  it('throws when no providers available', async () => {
    const registry = new ProviderRegistry([makeProvider('anthropic', false)]);

    await registry.probe();

    await expect(
      registry.complete({ model: 'm', messages: [], max_tokens: 10 }, 'anthropic'),
    ).rejects.toThrow('No available LLM provider');
  });

  it('lists available provider ids', async () => {
    const registry = new ProviderRegistry([
      makeProvider('anthropic', true),
      makeProvider('openclaw', false),
    ]);

    await registry.probe();

    expect(registry.availableIds()).toEqual(['anthropic']);
  });
});
