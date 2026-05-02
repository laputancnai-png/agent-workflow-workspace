import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'nvidia/qwen/qwen3-next-80b-a3b-instruct';

const SYSTEM_PROMPT = `You are an expert software engineer creating engineering plans.
Given a Product Requirements Document (PRD), produce a structured engineering plan including:
1. Technical architecture overview
2. Component breakdown
3. Implementation phases with dependencies
4. Key risks and mitigations
5. Success criteria

Be concise and actionable. Use markdown headers.`;

export class PlannerAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const prd = req.input_artifacts.find((a) => a.role === 'PRD')?.content ?? '(no PRD provided)';

    const response = await this.registry.complete(
      {
        model: req.preferred_model ?? DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `PRD:\n\n${prd}` }],
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
        error_message: `Planner produced placeholder output: ${content.slice(0, 100)}`,
        retryable: true,
      };
    }

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'PLAN', content }],
    };
  }
}
