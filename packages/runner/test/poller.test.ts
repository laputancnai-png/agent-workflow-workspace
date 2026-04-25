import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimedTask, RunnerApiClient } from '../src/api-client.js';
import { TaskPoller } from '../src/poller.js';

function makeClient(tasks: Array<ClaimedTask | null>) {
  const iter = tasks[Symbol.iterator]();

  return {
    pollTask: vi.fn().mockImplementation(() => Promise.resolve(iter.next().value ?? null)),
    ackTask: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  } as unknown as RunnerApiClient;
}

describe('TaskPoller', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('calls onTask callback when task arrives', async () => {
    const task: ClaimedTask = {
      agent_run_id: 'ar_1',
      step_id: 's_1',
      agent_role: 'planner',
      input_artifact_ids: [],
      preferred_provider: 'anthropic',
    };
    const client = makeClient([null, task]);
    const onTask = vi.fn();
    const poller = new TaskPoller(client, onTask, { intervalMs: 0, maxIterations: 2 });

    await poller.run();

    expect(onTask).toHaveBeenCalledWith(task);
    expect(client.ackTask).toHaveBeenCalledWith('ar_1');
  });

  it('does not block on null responses', async () => {
    const client = makeClient([null, null]);
    const onTask = vi.fn();
    const poller = new TaskPoller(client, onTask, { intervalMs: 0, maxIterations: 2 });

    await poller.run();

    expect(onTask).not.toHaveBeenCalled();
  });
});
