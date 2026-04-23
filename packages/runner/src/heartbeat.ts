import type { RunnerApiClient } from './api-client.js';

export class HeartbeatManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private checkpoint: Record<string, unknown> = {};

  constructor(
    private readonly client: RunnerApiClient,
    private readonly agentRunId: string,
    private readonly opts: { intervalMs: number } = { intervalMs: 30_000 },
  ) {}

  updateCheckpoint(data: Record<string, unknown>) {
    this.checkpoint = { ...this.checkpoint, ...data };
  }

  start() {
    this.timer = setInterval(() => {
      this.client
        .heartbeat(this.agentRunId, {
          checkpoint_data: this.checkpoint,
          ts: new Date().toISOString(),
        })
        .catch(() => {});
    }, this.opts.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
