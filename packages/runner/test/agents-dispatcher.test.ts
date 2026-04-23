import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

import type { AgentRequest, AgentResponse } from '../src/agents/protocol.js';

describe('agents dispatcher', () => {
  it('dispatches coder role to stub CODE_PATCH output', async () => {
    const scriptPath = join(process.cwd(), 'src', 'agents', 'dispatcher.ts');
    const request: AgentRequest = {
      type: 'run',
      agent_run_id: 'ar_1',
      step_id: 's_1',
      agent_role: 'coder',
      input_artifacts: [],
      preferred_provider: 'anthropic',
      config: {
        repo_path: process.cwd(),
        feature_branch: 'aww/ws/run',
        max_tokens_budget: 1000,
        providers: {},
      },
    };
    const response = await new Promise<AgentResponse>((resolve, reject) => {
      const child = spawn('tsx', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr));
          return;
        }
        resolve(JSON.parse(stdout.trim()) as AgentResponse);
      });
      child.stdin.write(`${JSON.stringify(request)}\n`);
      child.stdin.end();
    });

    expect(response.type).toBe('complete');
    expect(response.output_artifacts?.[0].role).toBe('CODE_PATCH');
  });
});
