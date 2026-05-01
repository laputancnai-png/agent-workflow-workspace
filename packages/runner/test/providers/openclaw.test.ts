import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';

import { OpenClawAdapter } from '../../src/providers/openclaw.js';

async function startMockGateway() {
  return new Promise<{ wss: WebSocketServer; port: number }>((resolve) => {
    const wss = new WebSocketServer({ port: 0 });
    wss.on('listening', () => {
      resolve({ wss, port: (wss.address() as { port: number }).port });
    });
  });
}

async function closeGateway(wss: WebSocketServer) {
  return new Promise<void>((resolve) => {
    wss.close(() => resolve());
  });
}

describe('OpenClawAdapter', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    ({ wss, port } = await startMockGateway());
  });

  afterEach(async () => {
    await closeGateway(wss);
  });

  it('has id = openclaw', () => {
    expect(new OpenClawAdapter({ gateway_url: 'ws://localhost:18789' }).id).toBe('openclaw');
  });

  it('isAvailable returns true when gateway reachable', async () => {
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });

    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when gateway unreachable', async () => {
    const adapter = new OpenClawAdapter({ gateway_url: 'ws://localhost:19999' });

    expect(await adapter.isAvailable()).toBe(false);
  });

  it('complete performs connect handshake and receives non-streaming response', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'abc123' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok' } }));
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(
            JSON.stringify({
              kind: 'res',
              id: msg.id,
              result: { content: 'OpenClaw says hi', stop_reason: 'end_turn' },
            }),
          );
        }
      });
    });
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });

    const response = await adapter.complete({
      model: 'openclaw-default',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 100,
    });

    expect(response.content).toBe('OpenClaw says hi');
    expect(response.stop_reason).toBe('end_turn');
  });

  it('complete aggregates streaming event frames into final content', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'xyz' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok' } }));
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'event', method: 'llm.stream', params: { chunk: 'Hello ' } }));
          ws.send(JSON.stringify({ kind: 'event', method: 'llm.stream', params: { chunk: 'world' } }));
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { content: null, stop_reason: 'end_turn' } }));
        }
      });
    });
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });

    const response = await adapter.complete({
      model: 'openclaw-default',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    });

    expect(response.content).toBe('Hello world');
    expect(response.stop_reason).toBe('end_turn');
  });

  it('complete rejects on gateway error response', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'err' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as { kind?: string; method?: string; id?: string };

        if (msg.kind === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok' } }));
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, error: { code: 'rate_limit', message: 'Too many requests' } }));
        }
      });
    });
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}` });

    await expect(
      adapter.complete({
        model: 'openclaw-default',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 100,
      }),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('complete supports OpenClaw v3 session gateway frames', async () => {
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'v3' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as {
          type?: string;
          method?: string;
          id?: string;
          params?: Record<string, unknown>;
        };

        if (msg.type === 'req' && msg.method === 'connect') {
          ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: { type: 'hello-ok', protocol: 3 } }));
        }
        if (msg.type === 'req' && msg.method === 'sessions.create') {
          ws.send(
            JSON.stringify({
              type: 'res',
              id: msg.id,
              ok: true,
              payload: { ok: true, key: 'agent:main:dashboard:test', sessionId: 'session-1' },
            }),
          );
        }
        if (msg.type === 'req' && msg.method === 'sessions.messages.subscribe') {
          ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: { subscribed: true } }));
        }
        if (msg.type === 'req' && msg.method === 'sessions.send') {
          expect(msg.params?.message).toContain('Hello');
          ws.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, payload: { runId: 'run-1', status: 'started' } }));
          ws.send(
            JSON.stringify({
              type: 'event',
              event: 'chat',
              payload: {
                sessionKey: 'agent:main:dashboard:test',
                state: 'delta',
                message: { role: 'assistant', content: [{ type: 'text', text: 'Open' }] },
              },
            }),
          );
          ws.send(
            JSON.stringify({
              type: 'event',
              event: 'chat',
              payload: {
                sessionKey: 'agent:main:dashboard:test',
                state: 'final',
                message: { role: 'assistant', content: [{ type: 'text', text: 'OpenClaw v3 says hi' }] },
              },
            }),
          );
        }
      });
    });
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}`, api_key: 'gateway-token' });

    const response = await Promise.race([
      adapter.complete({
        model: 'openclaw-default',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timed out waiting for v3 completion')), 500);
      }),
    ]);

    expect(response.content).toBe('OpenClaw v3 says hi');
    expect(response.stop_reason).toBe('end_turn');
  });

  it('includes api_key in connect params when configured', async () => {
    let connectParams: Record<string, unknown> = {};
    wss.on('connection', (ws) => {
      ws.send(JSON.stringify({ kind: 'event', method: 'connect.challenge', params: { nonce: 'k' } }));
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as {
          kind?: string;
          method?: string;
          id?: string;
          params?: Record<string, unknown>;
        };

        if (msg.kind === 'req' && msg.method === 'connect') {
          connectParams = msg.params ?? {};
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { message: 'hello-ok' } }));
        }
        if (msg.kind === 'req' && msg.method === 'llm.complete') {
          ws.send(JSON.stringify({ kind: 'res', id: msg.id, result: { content: 'ok', stop_reason: 'end_turn' } }));
        }
      });
    });
    const adapter = new OpenClawAdapter({ gateway_url: `ws://localhost:${port}`, api_key: 'test-key-abc' });

    await adapter.complete({
      model: 'openclaw-default',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 100,
    });

    expect(connectParams.api_key).toBe('test-key-abc');
  });
});
