import OpenAIClient from 'openai';

import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

type ChatMessage = OpenAIClient.ChatCompletionMessageParam;

export class OpenAIAdapter implements LLMProvider {
  readonly id = 'openai';
  private readonly client: OpenAIClient;

  constructor(private readonly cfg: { api_key: string; base_url?: string }) {
    this.client = new OpenAIClient({ apiKey: cfg.api_key, baseURL: cfg.base_url });
  }

  async isAvailable() {
    return this.cfg.api_key.length > 0;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const messages: ChatMessage[] = req.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    if (req.system) {
      messages.unshift({ role: 'system', content: req.system });
    }

    const response = await this.client.chat.completions.create({
      model: req.model,
      messages,
      max_tokens: req.max_tokens,
      tools: req.tools?.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      })),
    });

    const choice = response.choices[0];

    return {
      content: choice.message.content ?? '',
      tokens_used: response.usage?.total_tokens,
      stop_reason:
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'length'
            ? 'max_tokens'
            : 'end_turn',
      tool_calls: choice.message.tool_calls?.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
      })),
    };
  }
}
