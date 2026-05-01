import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { RunnerApiClient, type ClaimedTask } from './api-client.js';
import { runSafe } from './agents/exec.js';
import type { AgentRequest } from './agents/protocol.js';
import { loadConfig } from './config.js';
import { AgentExecutor } from './executor.js';
import { HeartbeatManager } from './heartbeat.js';
import { TaskPoller } from './poller.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { HermesAdapter } from './providers/hermes.js';
import { OpenAIAdapter } from './providers/openai.js';
import { OpenClawAdapter } from './providers/openclaw.js';
import { ProviderRegistry } from './providers/registry.js';
import type { LLMProvider } from './providers/types.js';
import { GitWorker } from './git-worker.js';
import { redactSecrets } from './redact.js';
import { RepoManager } from './repo-manager.js';

async function createPullRequest(repoPath: string, featureBranch: string, prSummary: string): Promise<void> {
  const lines = prSummary.split('\n').filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, '').trim() || featureBranch;
  const body = lines.slice(1).join('\n').trim() || prSummary;
  const result = await runSafe('gh', ['pr', 'create', '--title', title, '--body', body, '--head', featureBranch], repoPath);
  if (!result.success) {
    process.stderr.write(`[daemon] gh pr create failed: ${result.stderr}\n`);
  }
}

export async function startDaemon(configPath?: string) {
  const cfg = await loadConfig(configPath ?? join(homedir(), '.aww', 'config.toml'));
  const providers = [
    cfg.providers.anthropic && new AnthropicAdapter(cfg.providers.anthropic),
    cfg.providers.openai && new OpenAIAdapter(cfg.providers.openai),
    cfg.providers.openclaw !== undefined && new OpenClawAdapter(cfg.providers.openclaw),
    cfg.providers.hermes !== undefined && new HermesAdapter(cfg.providers.hermes),
  ].filter(Boolean) as LLMProvider[];
  const registry = new ProviderRegistry(providers);
  await registry.probe();

  const client = new RunnerApiClient({
    base_url: cfg.cloud.base_url,
    runner_id: cfg.runner.runner_id,
    runner_secret: cfg.runner.runner_secret,
  });
  const runnerHeartbeat = setInterval(() => {
    client.runnerHeartbeat().catch((error) => {
      process.stderr.write(`[daemon] runner heartbeat failed: ${String(error)}\n`);
    });
  }, 60_000);
  await client.runnerHeartbeat();
  const dispatcherJs = join(import.meta.dirname, 'agents', 'dispatcher.js');
  const dispatcherTs = join(import.meta.dirname, 'agents', 'dispatcher.ts');
  const executor = new AgentExecutor({
    scriptPath: existsSync(dispatcherJs) ? dispatcherJs : dispatcherTs,
    timeoutMs: 10 * 60_000,
  });

  async function handleTask(task: ClaimedTask) {
    const heartbeat = new HeartbeatManager(client, task.agent_run_id);
    heartbeat.start();
    try {
      let repoPath = process.cwd();
      const featureBranch = task.feature_branch ?? task.default_branch;
      if (task.repo_url && task.workspace_slug) {
        const repoDir = join(homedir(), '.aww', 'repos', task.workspace_slug);
        repoPath = await new RepoManager(repoDir, task.repo_url).prepare();
        const lockId = task.run_id ?? task.agent_run_id;
        const gitWorker = new GitWorker(repoPath, lockId);
        await gitWorker.createFeatureBranch(featureBranch);
      }

      const request: AgentRequest = {
        type: 'run',
        agent_run_id: task.agent_run_id,
        step_id: task.step_id,
        agent_role: task.agent_role,
        input_artifacts: task.input_artifacts ?? [],
        preferred_provider: task.preferred_provider,
        checkpoint_data: task.checkpoint_data,
        config: {
          repo_path: repoPath,
          feature_branch: featureBranch,
          max_tokens_budget: 200_000,
          providers: cfg.providers as Record<string, unknown>,
        },
      };
      const response = await executor.run(request);
      heartbeat.stop();

      if (response.type === 'complete') {
        if (task.agent_role === 'summarizer' && response.output_artifacts?.length && task.feature_branch && repoPath) {
          await createPullRequest(repoPath, task.feature_branch, response.output_artifacts[0].content);
        }
        await client.complete(task.agent_run_id, {
          output_artifacts: response.output_artifacts,
          tokens_used: response.tokens_used,
        });
      } else {
        await client.fail(task.agent_run_id, {
          error_code: response.error_code,
          error_message: redactSecrets(response.error_message ?? ''),
          retryable: response.retryable,
        });
      }
    } catch (error) {
      heartbeat.stop();
      await client.fail(task.agent_run_id, { error_code: 'INTERNAL', error_message: redactSecrets(String(error)), retryable: true });
    }
  }

  const poller = new TaskPoller(client, (task) => void handleTask(task));
  const stop = () => {
    clearInterval(runnerHeartbeat);
    poller.stop();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  await poller.run();
}
