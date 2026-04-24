import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';
import { requestJson } from '../request-json.js';

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

export class HermesAdapter implements LLMProvider {
  readonly id = 'hermes';

  constructor(private readonly cfg: { base_url?: string }) {}

  private get baseUrl() {
    return this.cfg.base_url ?? 'http://localhost:8000';
  }

  async isAvailable() {
    try {
      await requestJson(`${this.baseUrl}/health`, { timeoutMs: 2_000 });
      return true;
    } catch {
      try {
        await requestJson(`${this.baseUrl}/health/detailed`, { timeoutMs: 2_000 });
        return true;
      } catch {
        return false;
      }
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const data = await requestJson<HermesChatCompletionResponse>(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      timeoutMs: 120_000,
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
