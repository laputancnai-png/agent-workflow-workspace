import { BaseAgent } from './base-agent.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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
        model: DEFAULT_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `PRD:\n\n${prd}` }],
      },
      req.preferred_provider,
    );

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      tokens_used: response.tokens_used,
      output_artifacts: [{ role: 'PLAN', content: response.content }],
    };
  }
}
