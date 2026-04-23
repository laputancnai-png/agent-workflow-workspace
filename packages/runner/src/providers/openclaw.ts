import { randomUUID } from 'node:crypto';

import { WebSocket } from 'ws';

import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

interface GatewayMessage {
  kind: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: { code?: string; message?: string };
}

const OPENCLAW_ERROR_LABELS: Record<string, string> = {
  auth_failed: 'Authentication failed - check api_key in config',
  invalid_model: 'Model not supported by this Gateway',
  context_length: 'Context length exceeded max_tokens',
};

function mapStopReason(value: unknown): CompletionResponse['stop_reason'] {
  return value === 'tool_use' || value === 'max_tokens' ? value : 'end_turn';
}

export class OpenClawAdapter implements LLMProvider {
  readonly id = 'openclaw';

  constructor(private readonly cfg: { gateway_url?: string; api_key?: string }) {}

  private get gatewayUrl() {
    return this.cfg.gateway_url ?? 'ws://localhost:18789';
  }

  async isAvailable() {
    return new Promise<boolean>((resolve) => {
      const ws = new WebSocket(this.gatewayUrl);
      const timer = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, 500);

      ws.on('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      });
      ws.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.gatewayUrl);
      const connectId = randomUUID();
      const completionId = randomUUID();
      let connected = false;
      let streamedContent = '';

      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('OpenClaw Gateway timeout after 60s'));
      }, 60_000);

      function fail(error: Error) {
        clearTimeout(timeout);
        ws.close();
        reject(error);
      }

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as GatewayMessage;

        if (message.kind === 'event' && message.method === 'connect.challenge') {
          const params: Record<string, unknown> = { client: 'aww-runner', protocol: '1.0' };

          if (this.cfg.api_key) {
            params.api_key = this.cfg.api_key;
          }

          ws.send(JSON.stringify({ kind: 'req', id: connectId, method: 'connect', params }));
          return;
        }

        if (message.kind === 'res' && message.id === connectId) {
          if (message.error) {
            fail(new Error(message.error.message ?? 'OpenClaw connect failed'));
            return;
          }

          connected = true;
          ws.send(
            JSON.stringify({
              kind: 'req',
              id: completionId,
              method: 'llm.complete',
              params: {
                model: req.model,
                messages: req.messages,
                system: req.system,
                max_tokens: req.max_tokens,
                tools: req.tools,
              },
            }),
          );
          return;
        }

        if (message.kind === 'event' && message.method === 'llm.stream' && connected) {
          streamedContent += String(message.params?.chunk ?? '');
          return;
        }

        if (message.kind === 'res' && message.id === completionId && connected) {
          clearTimeout(timeout);
          ws.close();

          if (message.error) {
            const code = message.error.code ?? '';
            reject(new Error(message.error.message ?? OPENCLAW_ERROR_LABELS[code] ?? 'unknown error'));
            return;
          }

          resolve({
            content: streamedContent || String(message.result?.content ?? ''),
            stop_reason: mapStopReason(message.result?.stop_reason),
          });
        }
      });

      ws.on('error', (error) => {
        fail(error);
      });
    });
  }
}
