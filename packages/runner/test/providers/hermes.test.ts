import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';

import { HermesAdapter } from '../../src/providers/hermes.js';

afterEach(() => {
  nock.cleanAll();
});

describe('HermesAdapter', () => {
  const baseUrl = 'http://localhost:8000';

  it('has id = hermes', () => {
    expect(new HermesAdapter({ base_url: baseUrl }).id).toBe('hermes');
  });

  it('isAvailable when /health returns 200', async () => {
    nock(baseUrl).get('/health').reply(200, { status: 'ok' });
    const adapter = new HermesAdapter({ base_url: baseUrl });

    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable false when /health fails', async () => {
    nock(baseUrl).get('/health').replyWithError('ECONNREFUSED');
    const adapter = new HermesAdapter({ base_url: baseUrl });

    expect(await adapter.isAvailable()).toBe(false);
  });

  it('complete calls POST /v1/chat/completions and maps response', async () => {
    nock(baseUrl)
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'Hermes response' }, finish_reason: 'stop' }],
        usage: { total_tokens: 42 },
      });
    const adapter = new HermesAdapter({ base_url: baseUrl });

    const response = await adapter.complete({
      model: 'hermes',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    });

    expect(response.content).toBe('Hermes response');
    expect(response.tokens_used).toBe(42);
    expect(response.stop_reason).toBe('end_turn');
  });
});
