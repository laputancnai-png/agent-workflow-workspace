import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aww-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads valid config', async () => {
    const toml = `
[cloud]
base_url = "http://localhost:3000"

[runner]
runner_id = "r_123"
runner_secret = "secret"
workspace_id = "ws_abc"

[providers.anthropic]
api_key = "sk-ant-test"
`;
    await writeFile(join(dir, 'config.toml'), toml);

    const cfg = await loadConfig(join(dir, 'config.toml'));

    expect(cfg.cloud.base_url).toBe('http://localhost:3000');
    expect(cfg.runner.runner_id).toBe('r_123');
    expect(cfg.providers.anthropic?.api_key).toBe('sk-ant-test');
  });

  it('throws ConfigError when file missing', async () => {
    await expect(loadConfig(join(dir, 'missing.toml'))).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when required fields absent', async () => {
    await writeFile(join(dir, 'config.toml'), '[cloud]\n');

    await expect(loadConfig(join(dir, 'config.toml'))).rejects.toBeInstanceOf(ConfigError);
  });
});
