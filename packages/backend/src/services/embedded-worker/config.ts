import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// From packages/backend/src/services/embedded-worker/ → up 4 = packages/ → packages/runner/
const defaultDispatcherTs = resolve(here, '../../../../runner/src/agents/dispatcher.ts');
const defaultDispatcherJs = resolve(here, '../../../../runner/dist/agents/dispatcher.js');

function resolveDispatcherPath(): string {
  if (process.env.AGENT_DISPATCHER_PATH) return process.env.AGENT_DISPATCHER_PATH;
  if (existsSync(defaultDispatcherJs)) return defaultDispatcherJs;
  return defaultDispatcherTs;
}

export interface WorkerConfig {
  enabled: boolean;
  machineId: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  agentTimeoutMs: number;
  maxTokensBudget: number;
  repoCacheDir: string;
  dispatcherPath: string;
  providers: {
    openclaw?: { gateway_url: string; api_key?: string; agent_id?: string };
    anthropic?: { api_key: string };
    openai?: { api_key: string };
    hermes?: { base_url: string; api_key?: string };
  };
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    enabled: process.env.WORKER_ENABLED !== 'false',
    machineId: process.env.WORKER_MACHINE_ID ?? 'embedded',
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000),
    heartbeatIntervalMs: Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 30_000),
    agentTimeoutMs: Number(process.env.WORKER_AGENT_TIMEOUT_MS ?? 600_000),
    maxTokensBudget: Number(process.env.WORKER_MAX_TOKENS_BUDGET ?? 200_000),
    repoCacheDir: process.env.WORKER_REPO_CACHE_DIR ?? resolve(process.cwd(), '.aww-repos'),
    dispatcherPath: resolveDispatcherPath(),
    providers: {
      ...(process.env.OPENCLAW_GATEWAY_URL && {
        openclaw: {
          gateway_url: process.env.OPENCLAW_GATEWAY_URL,
          api_key: process.env.OPENCLAW_API_KEY,
          agent_id: process.env.OPENCLAW_AGENT_ID ?? 'main',
        },
      }),
      ...(process.env.ANTHROPIC_API_KEY && {
        anthropic: { api_key: process.env.ANTHROPIC_API_KEY },
      }),
      ...(process.env.OPENAI_API_KEY && {
        openai: { api_key: process.env.OPENAI_API_KEY },
      }),
      ...(process.env.HERMES_BASE_URL && {
        hermes: { base_url: process.env.HERMES_BASE_URL, api_key: process.env.HERMES_API_KEY },
      }),
    },
  };
}
