import type { ClaimedTask, RunnerApiClient } from './api-client.js';

interface PollerOptions {
  intervalMs?: number;
  maxIterations?: number;
  timeoutSeconds?: number;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TaskPoller {
  private running = false;

  constructor(
    private readonly client: RunnerApiClient,
    private readonly onTask: (task: ClaimedTask) => void,
    private readonly opts: PollerOptions = {},
  ) {}

  async run() {
    this.running = true;
    const maxIterations = this.opts.maxIterations ?? Number.POSITIVE_INFINITY;
    let iteration = 0;

    while (this.running && iteration < maxIterations) {
      iteration += 1;

      try {
        const task = await this.client.pollTask(this.opts.timeoutSeconds ?? 25);

        if (task) {
          await this.client.ackTask(task.agent_run_id);
          this.onTask(task);
        }
      } catch {
        const backoff = Math.min(1000 * 2 ** Math.min(iteration, 5), 30_000);
        await delay(this.opts.intervalMs ?? backoff);
      }

      if (this.opts.intervalMs !== undefined) {
        await delay(this.opts.intervalMs);
      }
    }
  }

  stop() {
    this.running = false;
  }
}
