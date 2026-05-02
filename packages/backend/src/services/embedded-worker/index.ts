import { eq, inArray } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { runners } from '../../db/schema/runners.js';
import { workspaces } from '../../db/schema/workspaces.js';
import type { WorkerConfig } from './config.js';
import { loadWorkerConfig } from './config.js';
import { markEmbeddedRunnerOffline, upsertEmbeddedRunner } from './runner-record.js';
import { claimNextTask, handleTask } from './task-handler.js';

const CAPABILITIES = ['general'];

const runnerMap = new Map<string, string>(); // runnerId → workspaceId

export async function registerEmbeddedRunnerForWorkspace(workspaceId: string): Promise<void> {
  const cfg = loadWorkerConfig();
  if (!cfg.enabled) return;
  const runnerId = await upsertEmbeddedRunner({
    machineId: cfg.machineId,
    workspaceId,
    capabilities: CAPABILITIES,
  });
  runnerMap.set(runnerId, workspaceId);
}

export function startEmbeddedWorker(): { stop(): Promise<void> } {
  const cfg = loadWorkerConfig();

  if (!cfg.enabled) {
    return { stop: async () => {} };
  }

  if (Object.keys(cfg.providers).length === 0) {
    process.stderr.write(
      '[worker] WARNING: No LLM provider configured. Agent steps will fail.\n' +
      '         Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENCLAW_GATEWAY_URL in .env\n',
    );
  }

  let stopRequested = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function poll(config: WorkerConfig): Promise<void> {
    if (stopRequested) return;

    const runnerIds = [...runnerMap.keys()];

    // Keep runners alive so the watchdog doesn't mark them offline
    if (runnerIds.length > 0) {
      await db
        .update(runners)
        .set({ lastHeartbeatAt: new Date() })
        .where(inArray(runners.id, runnerIds))
        .catch(() => {});
    }

    for (const runnerId of runnerIds) {
      const taskId = await claimNextTask(runnerId).catch(() => null);
      if (taskId) {
        void handleTask(taskId, config).catch((err) => {
          process.stderr.write(`[worker] unhandled task error: ${String(err)}\n`);
        });
      }
    }

    pollTimer = setTimeout(() => void poll(config), config.pollIntervalMs);
  }

  void (async () => {
    const allWorkspaces = await db.select({ id: workspaces.id }).from(workspaces);
    for (const ws of allWorkspaces) {
      await registerEmbeddedRunnerForWorkspace(ws.id);
    }
    void poll(cfg);
  })().catch((err) => {
    process.stderr.write(`[worker] startup error: ${String(err)}\n`);
  });

  return {
    stop: async () => {
      stopRequested = true;
      if (pollTimer) clearTimeout(pollTimer);
      await Promise.allSettled(
        [...runnerMap.entries()].map(([runnerId, workspaceId]) =>
          markEmbeddedRunnerOffline(runnerId, workspaceId),
        ),
      );
    },
  };
}
