import { describe, expect, it } from 'vitest';

import type { AgentRequest } from '../../src/agents/protocol.js';
import { ReviewerAgent } from '../../src/agents/reviewer-agent.js';
import { MockRegistry } from '../helpers/mock-registry.js';

const baseRequest: AgentRequest = {
  type: 'run',
  agent_run_id: 'ar_3',
  step_id: 's_3',
  agent_role: 'reviewer',
  input_artifacts: [],
  preferred_provider: 'anthropic',
  config: { repo_path: '/tmp/nonexistent-repo', feature_branch: 'aww/ws/run', max_tokens_budget: 1000, providers: {} },
};

describe('ReviewerAgent', () => {
  it('returns REVIEW_COMMENT artifact', async () => {
    const agent = new ReviewerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: '## Review\n\n### Summary\nLooks good.\n\n### Issues\nNone.',
      stop_reason: 'end_turn',
      tokens_used: 200,
    });

    const response = await agent.execute(baseRequest);

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('REVIEW_COMMENT');
    expect(response.output_artifacts?.[0].content).toContain('Review');
    expect(response.tokens_used).toBe(200);
  });

  it('handles missing repo gracefully', async () => {
    const agent = new ReviewerAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: 'No issues found.',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute({
      ...baseRequest,
      config: { ...baseRequest.config, repo_path: '/does-not-exist' },
    });

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('REVIEW_COMMENT');
  });
});
