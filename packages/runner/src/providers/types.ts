export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  max_tokens: number;
  system?: string;
}

export interface CompletionResponse {
  content: string;
  tool_calls?: ToolCall[];
  tokens_used?: number;
  stop_reason: 'end_turn' | 'max_tokens' | 'tool_use';
}

export interface LLMProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
