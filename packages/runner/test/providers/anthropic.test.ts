import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnthropicAdapter } from '../../src/providers/anthropic.js';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from Anthropic' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      }),
    };
  },
}));

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter({ api_key: 'sk-ant-test' });
  });

  it('has id = anthropic', () => {
    expect(adapter.id).toBe('anthropic');
  });

  it('isAvailable returns true when api_key set', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when api_key empty', async () => {
    expect(await new AnthropicAdapter({ api_key: '' }).isAvailable()).toBe(false);
  });

  it('complete maps response correctly', async () => {
    const response = await adapter.complete({
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    });

    expect(response.content).toBe('Hello from Anthropic');
    expect(response.tokens_used).toBe(15);
    expect(response.stop_reason).toBe('end_turn');
  });
});
