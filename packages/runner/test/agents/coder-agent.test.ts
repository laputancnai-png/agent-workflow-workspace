import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { CoderAgent } from '../../src/agents/coder-agent.js';
import type { AgentRequest } from '../../src/agents/protocol.js';
import { MockRegistry } from '../helpers/mock-registry.js';

async function initRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(dir, 'README.md'), '# Test');
  await git.add('README.md');
  await git.commit('init');
  await git.branch(['-M', 'main']);
}

describe('CoderAgent', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'aww-coder-'));
    await initRepo(repoDir);
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  const makeRequest = (overrides?: Partial<AgentRequest>): AgentRequest => ({
    type: 'run',
    agent_run_id: 'ar_coder',
    step_id: 's_1',
    agent_role: 'coder',
    input_artifacts: [{ id: 'a_1', role: 'TASK_LIST', content: '1. Add hello function' }],
    preferred_provider: 'anthropic',
    config: {
      repo_path: repoDir,
      feature_branch: 'aww/ws/run',
      max_tokens_budget: 10_000,
      providers: {},
    },
    ...overrides,
  });

  it('writes files and creates git commit', async () => {
    const agent = new CoderAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: JSON.stringify({
        commit_message: 'feat: add hello function',
        files: [{ path: 'src/hello.ts', content: 'export function hello() { return "hi"; }' }],
      }),
      stop_reason: 'end_turn',
      tokens_used: 200,
    });

    const response = await agent.execute(makeRequest());

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('CODE_PATCH');
    expect(response.output_artifacts?.[0].git_commit_sha).toMatch(/^[a-f0-9]{40}$/);
    expect(existsSync(join(repoDir, 'src/hello.ts'))).toBe(true);
    const content = await readFile(join(repoDir, 'src/hello.ts'), 'utf8');
    expect(content).toContain('hello');
  });

  it('strips markdown code fences from LLM response', async () => {
    const agent = new CoderAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content:
        '```json\n' +
        JSON.stringify({ commit_message: 'chore: add file', files: [{ path: 'note.txt', content: 'hi' }] }) +
        '\n```',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute(makeRequest());

    expect(response.type).toBe('complete');
    expect(existsSync(join(repoDir, 'note.txt'))).toBe(true);
  });

  it('returns fail when LLM response is not valid JSON', async () => {
    const agent = new CoderAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: 'This is definitely not JSON.',
      stop_reason: 'end_turn',
    });

    const response = await agent.execute(makeRequest());

    expect(response.type).toBe('fail');
    expect(response.error_code).toBe('PARSE_ERROR');
  });

  it('blocks path traversal outside repo', async () => {
    const agent = new CoderAgent();
    (agent as unknown as { registry: MockRegistry }).registry = new MockRegistry({
      content: JSON.stringify({
        commit_message: 'evil: path traversal',
        files: [
          { path: '../../etc/passwd', content: 'evil' },
          { path: 'safe.txt', content: 'safe content' },
        ],
      }),
      stop_reason: 'end_turn',
    });

    const response = await agent.execute(makeRequest());

    expect(response.type).toBe('complete');
    expect(existsSync('/etc/passwd2')).toBe(false);
    expect(existsSync(join(repoDir, 'safe.txt'))).toBe(true);
  });
});
