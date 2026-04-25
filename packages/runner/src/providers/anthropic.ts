import Anthropic from '@anthropic-ai/sdk';

import type { CompletionRequest, CompletionResponse, LLMProvider } from './types.js';

type AnthropicStopReason = 'end_turn' | 'max_tokens' | 'tool_use' | string | null;

function mapStopReason(reason: AnthropicStopReason): CompletionResponse['stop_reason'] {
  if (reason === 'tool_use') {
    return 'tool_use';
  }

  if (reason === 'max_tokens') {
    return 'max_tokens';
  }

  return 'end_turn';
}

export class AnthropicAdapter implements LLMProvider {
  readonly id = 'anthropic';
  private readonly client: Anthropic;

  constructor(private readonly cfg: { api_key: string }) {
    this.client = new Anthropic({ apiKey: cfg.api_key });
  }

  async isAvailable() {
    return this.cfg.api_key.length > 0;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const systemMessage = req.messages.find((message) => message.role === 'system');
    const messages = req.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));

    const response = await this.client.messages.create({
      model: req.model,
      messages,
      system: req.system ?? systemMessage?.content,
      max_tokens: req.max_tokens,
      tools: req.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      })) as Parameters<typeof this.client.messages.create>[0]['tools'],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const toolBlocks = response.content.filter((block) => block.type === 'tool_use');

    return {
      content: textBlock?.type === 'text' ? textBlock.text : '',
      tokens_used: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
      stop_reason: mapStopReason(response.stop_reason),
      tool_calls: toolBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      })),
    };
  }
}
