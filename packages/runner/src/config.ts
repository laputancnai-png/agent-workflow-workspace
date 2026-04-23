import { readFile } from 'node:fs/promises';

import { parse } from 'smol-toml';

export class ConfigError extends Error {}

export interface RunnerConfig {
  cloud: { base_url: string };
  runner: {
    runner_id: string;
    runner_secret: string;
    workspace_id: string;
    max_concurrent_agents?: number;
  };
  providers: {
    anthropic?: { api_key: string };
    openai?: { api_key: string; base_url?: string };
    openclaw?: { gateway_url?: string; api_key?: string };
    hermes?: { base_url?: string };
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function requireString(section: Record<string, unknown>, key: string, label: string) {
  const value = section[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`Missing required ${label}`);
  }

  return value;
}

export async function loadConfig(path: string): Promise<RunnerConfig> {
  let raw: string;

  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    throw new ConfigError(`Config file not found: ${path}`);
  }

  const parsed = parse(raw) as Record<string, unknown>;
  const cloud = asRecord(parsed.cloud);
  const runner = asRecord(parsed.runner);

  if (!cloud) {
    throw new ConfigError('Missing required [cloud] section');
  }

  if (!runner) {
    throw new ConfigError('Missing required [runner] section');
  }

  requireString(cloud, 'base_url', '[cloud].base_url');
  requireString(runner, 'runner_id', '[runner].runner_id');
  requireString(runner, 'runner_secret', '[runner].runner_secret');
  requireString(runner, 'workspace_id', '[runner].workspace_id');

  return parsed as unknown as RunnerConfig;
}
