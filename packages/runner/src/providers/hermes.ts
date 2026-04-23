import http from 'node:http';
import https from 'node:https';

import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

interface HermesChatCompletionResponse {
  choices: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { total_tokens?: number };
}

function mapStopReason(value: string | undefined): CompletionResponse['stop_reason'] {
  if (value === 'length') {
    return 'max_tokens';
  }

  if (value === 'tool_calls') {
    return 'tool_use';
  }

  return 'end_turn';
}

async function requestJson<T>(url: string, init: { method?: string; body?: unknown } = {}) {
  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const request = client.request(
      parsed,
      {
        method: init.method ?? 'GET',
        headers: body
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            }
          : undefined,
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;

          if (status < 200 || status >= 300) {
            reject(new Error(`Hermes API error ${status}: ${raw}`));
            return;
          }

          resolve((raw ? JSON.parse(raw) : {}) as T);
        });
      },
    );

    request.on('error', reject);
    request.setTimeout(120_000, () => {
      request.destroy(new Error('Hermes API timeout'));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

export class HermesAdapter implements LLMProvider {
  readonly id = 'hermes';

  constructor(private readonly cfg: { base_url?: string }) {}

  private get baseUrl() {
    return this.cfg.base_url ?? 'http://localhost:8000';
  }

  async isAvailable() {
    try {
      await requestJson(`${this.baseUrl}/health`);

      return true;
    } catch {
      return false;
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const data = await requestJson<HermesChatCompletionResponse>(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      body: {
        model: req.model,
        messages: req.messages,
        system: req.system,
        max_tokens: req.max_tokens,
        tools: req.tools,
      },
    });
    const choice = data.choices[0];

    return {
      content: choice?.message?.content ?? '',
      stop_reason: mapStopReason(choice?.finish_reason),
      tokens_used: data.usage?.total_tokens,
    };
  }
}
