import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';

import { RunnerApiClient } from '../src/api-client.js';

afterEach(() => {
  nock.cleanAll();
});

const baseUrl = 'http://localhost:3000';

describe('RunnerApiClient', () => {
  const client = new RunnerApiClient({ base_url: baseUrl, runner_id: 'r_1', runner_secret: 'secret' });

  it('includes Authorization header with HMAC scheme', async () => {
    let authHeader = '';
    nock(baseUrl)
      .post('/api/v1/agent-runs/ar_1/heartbeat')
      .reply(function () {
        authHeader = this.req.headers.authorization as string;
        return [200, {}];
      });

    await client.heartbeat('ar_1', { tokens_used: 10 });

    expect(authHeader).toMatch(/^Runner r_1:/);
  });

  it('uses top-level agent-run endpoints', async () => {
    let called = false;
    nock(baseUrl)
      .post('/api/v1/agent-runs/ar_2/complete')
      .reply(() => {
        called = true;
        return [200, {}];
      });

    await client.complete('ar_2', { output_artifact_ids: ['a_1'] });

    expect(called).toBe(true);
  });

  it('pollTask returns null on 204', async () => {
    nock(baseUrl).get('/api/v1/runners/r_1/tasks/claim').query({ timeout: '25' }).reply(204);

    const task = await client.pollTask(25);

    expect(task).toBeNull();
  });

  it('pollTask returns task on 200', async () => {
    nock(baseUrl)
      .get('/api/v1/runners/r_1/tasks/claim')
      .query({ timeout: '25' })
      .reply(200, { data: { agent_run_id: 'ar_1', step_id: 's_1', agent_role: 'planner' } });

    const task = await client.pollTask(25);

    expect(task?.agent_run_id).toBe('ar_1');
  });

  it('sends runner heartbeat to runner endpoint', async () => {
    let called = false;
    nock(baseUrl)
      .post('/api/v1/runners/r_1/heartbeat')
      .reply(() => {
        called = true;
        return [200, {}];
      });

    await client.runnerHeartbeat();

    expect(called).toBe(true);
  });

  it('sends an empty JSON body when acknowledging a task', async () => {
    let body: unknown;
    nock(baseUrl)
      .post('/api/v1/runners/r_1/tasks/ar_1/ack', (requestBody) => {
        body = requestBody;
        return true;
      })
      .reply(200, {});

    await client.ackTask('ar_1');

    expect(body).toEqual({});
  });
});
