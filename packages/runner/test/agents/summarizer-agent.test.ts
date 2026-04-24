import { describe, expect, it } from 'vitest';

import type { AgentRequest } from '../../src/agents/protocol.js';
import { SummarizerAgent } from '../../src/agents/summarizer-agent.js';
import { MockRegistry } from '../helpers/mock-registry.js';

const baseRequest: AgentRequest = {
  type: 'run',
  agent_run_id: 'ar_4',
  step_id: 's_4',
  agent_role: 'summarizer',
  input_artifacts: [],
  preferred_provider: 'anthropic',
  config: { repo_path: '/tmp/nonexistent-repo', feature_branch: 'aww/ws/run', max_tokens_budget: 1000, providers: {} },
};

describe('SummarizerAgent', () => {
  it('returns PR_SUMMARY artifact', async () => {
    const agent = new SummarizerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: '## Summary\n\n- Added user authentication\n\n## Test plan\n- [ ] Run unit tests',
      stop_reason: 'end_turn',
      tokens_used: 180,
    });

    const response = await agent.execute(baseRequest);

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('PR_SUMMARY');
    expect(response.output_artifacts?.[0].content).toContain('Summary');
    expect(response.tokens_used).toBe(180);
  });

  it('handles missing repo gracefully', async () => {
    const agent = new SummarizerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: 'PR summary.',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute({
      ...baseRequest,
      config: { ...baseRequest.config, repo_path: '/does-not-exist' },
    });

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('PR_SUMMARY');
  });
});
