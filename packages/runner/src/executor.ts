import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { AgentRequest, AgentResponse } from './agents/protocol.js';

export class AgentExecutor {
  constructor(private readonly opts: { scriptPath: string; timeoutMs: number }) {}

  run(req: AgentRequest) {
    return new Promise<AgentResponse>((resolve) => {
      let settled = false;
      const child = spawn('node', [this.opts.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const finish = (response: AgentResponse) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        resolve(response);
      };

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish({
          type: 'fail',
          agent_run_id: req.agent_run_id,
          error_code: 'TIMEOUT',
          error_message: `Agent timed out after ${this.opts.timeoutMs}ms`,
          retryable: true,
        });
      }, this.opts.timeoutMs);

      const rl = createInterface({ input: child.stdout });
      rl.once('line', (line) => {
        try {
          finish(JSON.parse(line) as AgentResponse);
        } catch {
          finish({
            type: 'fail',
            agent_run_id: req.agent_run_id,
            error_code: 'PARSE_ERROR',
            error_message: line,
            retryable: false,
          });
        }
      });

      child.on('error', (error) => {
        finish({
          type: 'fail',
          agent_run_id: req.agent_run_id,
          error_code: 'SPAWN_ERROR',
          error_message: error.message,
          retryable: false,
        });
      });

      child.stdin.write(`${JSON.stringify(req)}\n`);
      child.stdin.end();
    });
  }
}
