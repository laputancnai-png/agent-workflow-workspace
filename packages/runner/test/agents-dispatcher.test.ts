import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import type { AgentRequest, AgentResponse } from '../src/agents/protocol.js';

function runDispatcher(request: AgentRequest): Promise<AgentResponse> {
  const scriptPath = join(process.cwd(), 'src', 'agents', 'dispatcher.ts');
  return new Promise((resolve, reject) => {
    const child = spawn('tsx', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr));
        return;
      }
      resolve(JSON.parse(stdout.trim()) as AgentResponse);
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();
  });
}

describe('agents dispatcher', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'aww-disp-'));
    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');
    await writeFile(join(repoDir, 'README.md'), '# Test');
    await git.add('README.md');
    await git.commit('init');
    await git.branch(['-M', 'main']);
    await writeFile(
      join(repoDir, 'package.json'),
      JSON.stringify({ name: 'test', scripts: { test: 'echo TESTS_OK' } }),
    );
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('dispatches tester role and returns TEST_REPORT', async () => {
    const request: AgentRequest = {
      type: 'run',
      agent_run_id: 'ar_1',
      step_id: 's_1',
      agent_role: 'tester',
      input_artifacts: [],
      preferred_provider: 'anthropic',
      config: {
        repo_path: repoDir,
        feature_branch: 'main',
        max_tokens_budget: 1000,
        providers: {},
      },
    };

    const response = await runDispatcher(request);

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('TEST_REPORT');
    expect(response.output_artifacts?.[0].content).toContain('TESTS_OK');
  }, 15_000);

  it('dispatches coder role and returns fail when no LLM provider configured', async () => {
    const request: AgentRequest = {
      type: 'run',
      agent_run_id: 'ar_2',
      step_id: 's_2',
      agent_role: 'coder',
      input_artifacts: [{ id: 'a_1', role: 'TASK_LIST', content: '1. Add feature' }],
      preferred_provider: 'anthropic',
      config: {
        repo_path: repoDir,
        feature_branch: 'main',
        max_tokens_budget: 1000,
        providers: {},
      },
    };

    const response = await runDispatcher(request);

    expect(response.type).toBe('fail');
    expect(response.agent_run_id).toBe('ar_2');
  });
});
