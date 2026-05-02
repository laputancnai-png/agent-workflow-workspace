import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'nvidia/qwen/qwen3-next-80b-a3b-instruct';

const SYSTEM_PROMPT = `You are an expert technical lead breaking down engineering plans into tasks.
Given an engineering plan, produce a concrete numbered task list where each task:
- Has a clear title and description
- Is scoped to one file or component
- Includes acceptance criteria
- Estimates complexity (S/M/L)

Format each task as: ## Task N: <title>\n<description>\n**Criteria:** <criteria>\n**Size:** S|M|L`;

export class TaskerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const plan = req.input_artifacts.find((a) => a.role === 'PLAN')?.content ?? '(no engineering plan provided)';

    const response = await this.registry.complete(
      {
        model: req.preferred_model ?? DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Engineering Plan:\n\n${plan}` }],
      },
      req.preferred_provider,
    );

    const content = response.content.trim();
    const isPlaceholder =
      content === 'NO_REPLY' ||
      content.length < 100 ||
      /no (engineering |prd |plan )?(was |is )?(provided|given|found|available)/i.test(content) ||
      /please (share|provide|paste)/i.test(content);

    if (isPlaceholder) {
      return {
        type: 'fail',
        agent_run_id: req.agent_run_id,
        error_code: 'BAD_OUTPUT',
        error_message: `Tasker produced placeholder output: ${content.slice(0, 100)}`,
        retryable: true,
      };
    }

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'TASK_LIST', content }],
    };
  }
}
