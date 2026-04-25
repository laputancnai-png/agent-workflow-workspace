import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OpenAIAdapter } from '../../src/providers/openai.js';

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: 'OpenAI response', tool_calls: null },
              finish_reason: 'stop',
            },
          ],
          usage: { total_tokens: 20 },
        }),
      },
    };
  },
}));

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ api_key: 'sk-test' });
  });

  it('has id = openai', () => {
    expect(adapter.id).toBe('openai');
  });

  it('isAvailable true when api_key set', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when api_key empty', async () => {
    expect(await new OpenAIAdapter({ api_key: '' }).isAvailable()).toBe(false);
  });

  it('maps response content and tokens', async () => {
    const response = await adapter.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    });

    expect(response.content).toBe('OpenAI response');
    expect(response.tokens_used).toBe(20);
    expect(response.stop_reason).toBe('end_turn');
  });

  it('accepts custom base_url for OpenAI-compatible endpoints', () => {
    const custom = new OpenAIAdapter({ api_key: 'x', base_url: 'http://localhost:11434/v1' });

    expect(custom.id).toBe('openai');
  });
});
