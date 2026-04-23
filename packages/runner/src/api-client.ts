import { createHmac } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

export interface ClaimedTask {
  agent_run_id: string;
  step_id: string;
  agent_role: string;
  input_artifact_ids: string[];
  preferred_provider: string;
  checkpoint_data?: Record<string, unknown>;
}

export class RunnerApiClient {
  constructor(private readonly cfg: { base_url: string; runner_id: string; runner_secret: string }) {}

  private sign(body: string) {
    const signature = createHmac('sha256', this.cfg.runner_secret).update(body).digest('hex');

    return `Runner ${this.cfg.runner_id}:${signature}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | undefined> {
    const bodyString = body === undefined ? '' : JSON.stringify(body);
    const url = new URL(`${this.cfg.base_url}${path}`);
    const client = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = client.request(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.sign(bodyString),
            ...(bodyString ? { 'Content-Length': Buffer.byteLength(bodyString) } : {}),
          },
        },
        (response) => {
          let raw = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            const status = response.statusCode ?? 0;

            if (status === 204) {
              resolve(undefined);
              return;
            }

            if (status < 200 || status >= 300) {
              reject(new Error(`API ${method} ${path} -> ${status}: ${raw}`));
              return;
            }

            const parsed = raw ? (JSON.parse(raw) as { data?: T }) : {};
            resolve(parsed.data as T);
          });
        },
      );

      request.on('error', reject);
      request.setTimeout(30_000, () => {
        request.destroy(new Error(`API ${method} ${path} timeout`));
      });

      if (bodyString) {
        request.write(bodyString);
      }

      request.end();
    });
  }

  async pollTask(timeoutSeconds = 25) {
    const task = await this.request<ClaimedTask>(
      'GET',
      `/api/v1/runners/${this.cfg.runner_id}/tasks/claim?timeout=${timeoutSeconds}`,
    );

    return task ?? null;
  }

  async heartbeat(agentRunId: string, data: Record<string, unknown>) {
    await this.request('POST', `/api/v1/runners/agent-runs/${agentRunId}/heartbeat`, data);
  }

  async complete(agentRunId: string, data: Record<string, unknown>) {
    await this.request('POST', `/api/v1/runners/agent-runs/${agentRunId}/complete`, data);
  }

  async fail(agentRunId: string, data: Record<string, unknown>) {
    await this.request('POST', `/api/v1/runners/agent-runs/${agentRunId}/fail`, data);
  }

  async ackTask(taskId: string) {
    await this.request('POST', `/api/v1/runners/${this.cfg.runner_id}/tasks/${taskId}/ack`);
  }
}
