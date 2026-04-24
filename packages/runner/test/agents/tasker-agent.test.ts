import { describe, expect, it } from 'vitest';

import type { AgentRequest } from '../../src/agents/protocol.js';
import { TaskerAgent } from '../../src/agents/tasker-agent.js';
import { MockRegistry } from '../helpers/mock-registry.js';

const baseRequest: AgentRequest = {
  type: 'run',
  agent_run_id: 'ar_2',
  step_id: 's_2',
  agent_role: 'tasker',
  input_artifacts: [],
  preferred_provider: 'anthropic',
  config: { repo_path: '/tmp', feature_branch: 'main', max_tokens_budget: 1000, providers: {} },
};

describe('TaskerAgent', () => {
  it('returns TASK_LIST artifact from PLAN input', async () => {
    const agent = new TaskerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: '1. Setup project\n2. Implement auth\n3. Write tests',
      stop_reason: 'end_turn',
      tokens_used: 120,
    });

    const response = await agent.execute({
      ...baseRequest,
      input_artifacts: [{ id: 'a_1', role: 'PLAN', content: '# Engineering Plan\n\nPhase 1: Setup' }],
    });

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('TASK_LIST');
    expect(response.output_artifacts?.[0].content).toContain('Setup project');
    expect(response.tokens_used).toBe(120);
  });

  it('works without PLAN input', async () => {
    const agent = new TaskerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: '1. Generic task',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute(baseRequest);

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('TASK_LIST');
  });
});
