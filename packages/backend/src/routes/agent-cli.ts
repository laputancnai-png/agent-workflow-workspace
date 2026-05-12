import { spawn } from 'node:child_process';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireUser } from '../middleware/user-auth.js';

const agentIds = ['hermes', 'codex', 'claude', 'openclaw'] as const;
type AgentCliId = (typeof agentIds)[number];

interface CommandResult {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  output: string;
  error?: string;
  durationMs: number;
}

const cliConfig: Record<AgentCliId, { label: string; command: string; testArgs: (prompt: string) => string[] }> = {
  hermes: {
    label: 'Hermes',
    command: 'hermes',
    testArgs: (prompt) => ['chat', '-q', prompt],
  },
  codex: {
    label: 'Codex',
    command: 'codex',
    testArgs: (prompt) => ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', prompt],
  },
  claude: {
    label: 'Claude Code',
    command: 'claude',
    testArgs: (prompt) => ['--print', prompt, '--output-format', 'text'],
  },
  openclaw: {
    label: 'OpenClaw',
    command: 'openclaw',
    testArgs: (prompt) => ['agent', '--local', '--agent', 'main', '--message', prompt, '--timeout', '30'],
  },
};

const testBody = z.object({
  agent: z.enum(agentIds),
});

function tailOutput(value: string) {
  return value.trim().slice(-4000);
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  const started = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let finished = false;

    const finish = (result: Omit<CommandResult, 'durationMs' | 'output'> & { output?: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ...result,
        output: tailOutput(result.output ?? output),
        durationMs: Date.now() - started,
      });
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok: false, exitCode: null, timedOut: true, error: 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => {
      finish({ ok: false, exitCode: null, timedOut: false, error: error.message });
    });
    child.on('close', (exitCode) => {
      finish({ ok: exitCode === 0, exitCode, timedOut: false });
    });
  });
}

async function checkInstalled(agent: AgentCliId) {
  const config = cliConfig[agent];
  const version = await runCommand(config.command, ['--version'], 5000);

  return {
    id: agent,
    label: config.label,
    command: config.command,
    installed: version.ok,
    version: version.ok ? version.output : null,
    error: version.ok ? null : version.error ?? version.output,
  };
}

export const agentCliRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/status', async () => {
    const statuses = await Promise.all(agentIds.map((agent) => checkInstalled(agent)));
    return { data: statuses };
  });

  app.post('/test', async (request, reply) => {
    const parsed = testBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_agent_cli', issues: parsed.error.issues });
    }

    const config = cliConfig[parsed.data.agent];
    const install = await runCommand(config.command, ['--version'], 5000);
    if (!install.ok) {
      return {
        data: {
          agent: parsed.data.agent,
          label: config.label,
          command: config.command,
          ok: false,
          stage: 'install',
          version: null,
          output: install.output,
          error: install.error ?? (install.output || `${config.command} is not installed or not on PATH`),
          durationMs: install.durationMs,
        },
      };
    }

    const prompt = 'Reply with exactly: AWW_AGENT_OK';
    const smoke = await runCommand(config.command, config.testArgs(prompt), 30000);

    return {
      data: {
        agent: parsed.data.agent,
        label: config.label,
        command: config.command,
        ok: smoke.ok && smoke.output.includes('AWW_AGENT_OK'),
        stage: 'smoke',
        version: install.output,
        output: smoke.output,
        error: smoke.ok ? null : smoke.error ?? (smoke.output || 'Agent CLI smoke test failed'),
        durationMs: install.durationMs + smoke.durationMs,
      },
    };
  });
};
