import { createInterface } from 'node:readline';

import { AnthropicAdapter } from '../providers/anthropic.js';
import { HermesAdapter } from '../providers/hermes.js';
import { OpenAIAdapter } from '../providers/openai.js';
import { OpenClawAdapter } from '../providers/openclaw.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { LLMProvider } from '../providers/types.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

export abstract class BaseAgent {
  protected registry!: ProviderRegistry;

  async init(providersCfg: Record<string, unknown>) {
    const cfg = providersCfg as {
      anthropic?: { api_key: string };
      openai?: { api_key: string; base_url?: string };
      openclaw?: { gateway_url?: string; api_key?: string };
      hermes?: { base_url?: string };
    };
    const adapters = [
      cfg.anthropic && new AnthropicAdapter(cfg.anthropic),
      cfg.openai && new OpenAIAdapter(cfg.openai),
      cfg.openclaw !== undefined && new OpenClawAdapter(cfg.openclaw),
      cfg.hermes !== undefined && new HermesAdapter(cfg.hermes),
    ].filter(Boolean) as LLMProvider[];

    this.registry = new ProviderRegistry(adapters);
    await this.registry.probe();
  }

  abstract execute(req: AgentRequest): Promise<AgentResponse>;
}

export async function runAgentMain(agentFactory: (role: string) => BaseAgent) {
  const rl = createInterface({ input: process.stdin });
  rl.once('line', async (line) => {
    const request = JSON.parse(line) as AgentRequest;
    const agent = agentFactory(request.agent_role);
    await agent.init(request.config.providers);

    try {
      process.stdout.write(`${JSON.stringify(await agent.execute(request))}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          type: 'fail',
          agent_run_id: request.agent_run_id,
          error_code: 'AGENT_ERROR',
          error_message: String(error),
          retryable: true,
        } satisfies AgentResponse)}\n`,
      );
    }

    process.exit(0);
  });
}
