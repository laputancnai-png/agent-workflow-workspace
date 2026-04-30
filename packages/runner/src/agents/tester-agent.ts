import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BaseAgent } from './base-agent.js';
import { runCommand } from './exec.js';
import type { AgentRequest, AgentResponse } from './protocol.js';

async function detectTestCommand(repoPath: string): Promise<string | null> {
  try {
    const raw = await readFile(join(repoPath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const testScript = pkg.scripts?.test;

    if (!testScript || testScript.startsWith('echo "Error: no test specified"')) {
      return null;
    }

    try {
      await readFile(join(repoPath, 'pnpm-lock.yaml'));
      return 'pnpm test';
    } catch {
      return 'npm test';
    }
  } catch {
    // no package.json
  }

  try {
    await readFile(join(repoPath, 'pytest.ini'));
    return 'pytest';
  } catch {
    // no pytest.ini
  }

  try {
    const raw = await readFile(join(repoPath, 'pyproject.toml'), 'utf8');
    if (raw.includes('[tool.pytest')) {
      return 'pytest';
    }
  } catch {
    // no pyproject.toml
  }

  return null;
}

export class TesterAgent extends BaseAgent {
  async execute(req: AgentRequest): Promise<AgentResponse> {
    const { repo_path } = req.config;
    const command = await detectTestCommand(repo_path);

    if (!command) {
      return {
        type: 'complete',
        agent_run_id: req.agent_run_id,
        output_artifacts: [{ role: 'TEST_REPORT', content: 'No test command detected in repository.' }],
      };
    }

    const result = await runCommand(command, repo_path);
    const status = result.success ? 'PASSED' : 'FAILED';
    const output = `${status}\n\n${result.stdout}\n${result.stderr}`.trim();

    return {
      type: 'complete',
      agent_run_id: req.agent_run_id,
      output_artifacts: [{ role: 'TEST_REPORT', content: output }],
    };
  }
}
