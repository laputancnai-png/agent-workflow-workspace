import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentRequest } from '../../src/agents/protocol.js';
import { TesterAgent } from '../../src/agents/tester-agent.js';

describe('TesterAgent', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'aww-tester-'));
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  const makeRequest = (repoPath: string): AgentRequest => ({
    type: 'run',
    agent_run_id: 'ar_5',
    step_id: 's_5',
    agent_role: 'tester',
    input_artifacts: [],
    preferred_provider: 'anthropic',
    config: { repo_path: repoPath, feature_branch: 'main', max_tokens_budget: 1000, providers: {} },
  });

  it('runs npm test and returns TEST_REPORT', async () => {
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({ name: 'test-proj', scripts: { test: 'echo TESTS_PASSED' } }),
    );
    const agent = new TesterAgent();

    const response = await agent.execute(makeRequest(repoDir));

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('TEST_REPORT');
    expect(response.output_artifacts?.[0].content).toContain('TESTS_PASSED');
  });

  it('reports failure when tests fail', async () => {
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({ name: 'test-proj', scripts: { test: 'exit 1' } }),
    );
    const agent = new TesterAgent();

    const response = await agent.execute(makeRequest(repoDir));

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('TEST_REPORT');
    expect(response.output_artifacts?.[0].content).toContain('FAILED');
  });

  it('returns no-test-command report when package.json has no test script', async () => {
    await writeFile(join(repoDir, 'package.json'), JSON.stringify({ name: 'test-proj' }));
    const agent = new TesterAgent();

    const response = await agent.execute(makeRequest(repoDir));

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].content).toContain('No test command');
  });

  it('returns no-test-command report when no package.json', async () => {
    const agent = new TesterAgent();

    const response = await agent.execute(makeRequest(repoDir));

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].content).toContain('No test command');
  });
});
