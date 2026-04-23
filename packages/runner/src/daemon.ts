import { homedir } from 'node:os';
import { join } from 'node:path';

import { RunnerApiClient, type ClaimedTask } from './api-client.js';
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
  const executor = new AgentExecutor({
    scriptPath: join(import.meta.dirname, 'agents', 'dispatcher.js'),
    timeoutMs: 10 * 60_000,
  });

  async function handleTask(task: ClaimedTask) {
    const heartbeat = new HeartbeatManager(client, task.agent_run_id);
    heartbeat.start();
    try {
      const request: AgentRequest = {
        type: 'run',
        agent_run_id: task.agent_run_id,
        step_id: task.step_id,
        agent_role: task.agent_role,
        input_artifacts: [],
        preferred_provider: task.preferred_provider,
        checkpoint_data: task.checkpoint_data,
        config: {
          repo_path: process.cwd(),
          feature_branch: '',
          max_tokens_budget: 200_000,
          providers: cfg.providers as Record<string, unknown>,
        },
      };
      const response = await executor.run(request);
      heartbeat.stop();

      if (response.type === 'complete') {
        await client.complete(task.agent_run_id, { output_artifact_ids: [], tokens_used: response.tokens_used });
      } else {
        await client.fail(task.agent_run_id, {
          error_code: response.error_code,
          error_message: response.error_message,
          retryable: response.retryable,
        });
      }
    } catch (error) {
      heartbeat.stop();
      await client.fail(task.agent_run_id, { error_code: 'INTERNAL', error_message: String(error), retryable: true });
    }
  }

  const poller = new TaskPoller(client, (task) => void handleTask(task));
  process.on('SIGTERM', () => poller.stop());
  process.on('SIGINT', () => poller.stop());
  await poller.run();
}
