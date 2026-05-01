import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerRunner } from '../src/registration.js';

describe('registerRunner', () => {
  let home: string;
  let originalAwwHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'aww-runner-home-'));
    originalAwwHome = process.env.AWW_HOME;
    process.env.AWW_HOME = join(home, '.aww');
  });

  afterEach(async () => {
    process.env.AWW_HOME = originalAwwHome;
    nock.cleanAll();
    await rm(home, { recursive: true, force: true });
  });

  it('registers provider capabilities and writes runner config', async () => {
    const scope = nock('http://localhost:3000')
      .post('/api/v1/runners/register', (body) => {
        expect(body.registration_token).toBe('registration-token-123');
        expect(body.workspace_id).toBe('workspace-1');
        expect(body.capabilities).toContain('provider:openclaw');
        expect(body.capabilities).toContain('role:planner');
        return true;
      })
      .reply(200, { data: { runner_id: 'runner-1', runner_secret: 'secret-1' } });

    await registerRunner({
      base_url: 'http://localhost:3000',
      registration_token: 'registration-token-123',
      workspace_id: 'workspace-1',
      provider_ids: ['openclaw'],
    });

    const runnerJson = await readFile(join(home, '.aww', 'runner.json'), 'utf8');
    const configToml = await readFile(join(home, '.aww', 'config.toml'), 'utf8');

    expect(JSON.parse(runnerJson).runner_id).toBe('runner-1');
    expect(configToml).toContain('runner_id = "runner-1"');
    expect(configToml).toContain('[providers.openclaw]');
    expect(scope.isDone()).toBe(true);
  });
});
