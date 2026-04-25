import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeartbeatManager } from '../src/heartbeat.js';
import type { RunnerApiClient } from '../src/api-client.js';

function makeClient() {
  return {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn(),
    fail: vi.fn(),
    pollTask: vi.fn(),
    ackTask: vi.fn(),
  } as unknown as RunnerApiClient;
}

describe('HeartbeatManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends heartbeat on interval', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const heartbeat = new HeartbeatManager(client, 'ar_1', { intervalMs: 1000 });

    heartbeat.start();
    await vi.advanceTimersByTimeAsync(2500);
    heartbeat.stop();

    expect(client.heartbeat).toHaveBeenCalledTimes(2);
  });

  it('includes checkpoint_data in heartbeat', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const heartbeat = new HeartbeatManager(client, 'ar_1', { intervalMs: 1000 });

    heartbeat.updateCheckpoint({ phase: 'generating', tokens_used: 500 });
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(1100);
    heartbeat.stop();

    expect(client.heartbeat).toHaveBeenCalledWith(
      'ar_1',
      expect.objectContaining({
        checkpoint_data: expect.objectContaining({ phase: 'generating' }),
      }),
    );
  });
});
