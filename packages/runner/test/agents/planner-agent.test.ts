import { describe, expect, it } from 'vitest';

import { PlannerAgent } from '../../src/agents/planner-agent.js';
import type { AgentRequest } from '../../src/agents/protocol.js';
import { MockRegistry } from '../helpers/mock-registry.js';

const baseRequest: AgentRequest = {
  type: 'run',
  agent_run_id: 'ar_1',
  step_id: 's_1',
  agent_role: 'planner',
  input_artifacts: [],
  preferred_provider: 'anthropic',
  config: { repo_path: '/tmp', feature_branch: 'main', max_tokens_budget: 1000, providers: {} },
};

describe('PlannerAgent', () => {
  it('returns PLAN artifact with LLM content', async () => {
    const agent = new PlannerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: '# Engineering Plan\n\nPhase 1: Setup',
      stop_reason: 'end_turn',
      tokens_used: 150,
    });

    const response = await agent.execute({
      ...baseRequest,
      input_artifacts: [{ id: 'a_1', role: 'PRD', content: 'Build a todo app' }],
    });

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('PLAN');
    expect(response.output_artifacts?.[0].content).toContain('Engineering Plan');
    expect(response.tokens_used).toBe(150);
  });

  it('works without PRD input artifact', async () => {
    const agent = new PlannerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: 'Generic plan',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute(baseRequest);

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('PLAN');
    expect(response.output_artifacts?.[0].content).toBe('Generic plan');
  });
});
