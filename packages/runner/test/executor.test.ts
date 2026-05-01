import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentRequest } from '../src/agents/protocol.js';
import { AgentExecutor } from '../src/executor.js';

function makeRequest(dir: string, agentRunId: string): AgentRequest {
  return {
    type: 'run',
    agent_run_id: agentRunId,
    step_id: 's_1',
    agent_role: 'planner',
    input_artifacts: [],
    preferred_provider: 'anthropic',
    config: {
      repo_path: dir,
      feature_branch: 'aww/ws/run',
      max_tokens_budget: 50000,
      providers: {},
    },
  };
}

describe('AgentExecutor', () => {
  it('runs a minimal agent script and returns complete response', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));

    try {
      const agentScript = join(dir, 'fake-agent.mjs');
      await writeFile(
        agentScript,
        `
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    type: 'complete',
    agent_run_id: req.agent_run_id,
    output_artifacts: [{ role: 'PLAN', content: 'Generated plan' }],
    tokens_used: 100
  }) + '\\n');
  process.exit(0);
});
`,
      );
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 5000 });

      const response = await executor.run(makeRequest(dir, 'ar_1'));

      expect(response.type).toBe('complete');
      expect(response.output_artifacts?.[0].content).toBe('Generated plan');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runs a TypeScript agent script through tsx', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));

    try {
      const agentScript = join(dir, 'fake-agent.ts');
      await writeFile(join(dir, 'helper.ts'), "export const plan = 'Generated from TS';\n");
      await writeFile(
        agentScript,
        `
import { createInterface } from 'node:readline';
import { plan } from './helper.js';
type WireRequest = { agent_run_id: string };
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line) as WireRequest;
  process.stdout.write(JSON.stringify({
    type: 'complete',
    agent_run_id: req.agent_run_id,
    output_artifacts: [{ role: 'PLAN', content: plan }],
    tokens_used: 100
  }) + '\\n');
  process.exit(0);
});
`,
      );
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 5000 });

      const response = await executor.run(makeRequest(dir, 'ar_ts'));

      expect(response.type).toBe('complete');
      expect(response.output_artifacts?.[0].content).toBe('Generated from TS');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns fail response on timeout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));

    try {
      const agentScript = join(dir, 'hanging-agent.mjs');
      await writeFile(agentScript, 'setInterval(() => {}, 99999);');
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 500 });

      const response = await executor.run(makeRequest(dir, 'ar_2'));

      expect(response.type).toBe('fail');
      expect(response.error_code).toBe('TIMEOUT');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns fail response when an agent exits without protocol output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aww-exec-'));

    try {
      const agentScript = join(dir, 'crashing-agent.mjs');
      await writeFile(agentScript, "process.stderr.write('missing provider config\\n'); process.exit(1);");
      const executor = new AgentExecutor({ scriptPath: agentScript, timeoutMs: 5000 });

      const response = await executor.run(makeRequest(dir, 'ar_3'));

      expect(response.type).toBe('fail');
      expect(response.error_code).toBe('NO_OUTPUT');
      expect(response.error_message).toContain('missing provider config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
