import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

import { requestJson } from './request-json.js';

export interface RegistrationResult {
  runner_id: string;
  runner_secret: string;
}

export async function registerRunner(opts: {
  base_url: string;
  registration_token: string;
  workspace_id: string;
  provider_ids: string[];
}) {
  const roleCapabilities = ['planner', 'tasker', 'coder', 'tester', 'reviewer', 'summarizer'].map((role) => `role:${role}`);
  const providerCapabilities = opts.provider_ids.map((provider) => `provider:${provider}`);
  const result = await requestJson<RegistrationResult>(`${opts.base_url}/api/v1/runners/register`, {
    method: 'POST',
    body: {
      registration_token: opts.registration_token,
      machine_id: randomUUID(),
      machine_hostname: hostname(),
      workspace_id: opts.workspace_id,
      capabilities: [...roleCapabilities, ...providerCapabilities],
    },
  });
  const awwDir = process.env.AWW_HOME ?? join(homedir(), '.aww');
  await mkdir(awwDir, { recursive: true });
  await writeFile(
    join(awwDir, 'runner.json'),
    JSON.stringify({ ...result, workspace_id: opts.workspace_id, base_url: opts.base_url }, null, 2),
    { mode: 0o600 },
  );
  await writeFile(join(awwDir, 'config.toml'), renderConfigToml(opts, result), { mode: 0o600 });

  return result;
}

function renderConfigToml(opts: { base_url: string; workspace_id: string; provider_ids: string[] }, result: RegistrationResult) {
  const providers = opts.provider_ids
    .map((provider) => {
      if (provider === 'openclaw') {
        return '[providers.openclaw]\ngateway_url = "ws://127.0.0.1:18789"\n';
      }

      if (provider === 'hermes') {
        return '[providers.hermes]\nbase_url = "http://localhost:7331"\n';
      }

      return `[providers.${provider}]\n`;
    })
    .join('\n');

  return `[cloud]
base_url = "${opts.base_url}"

[runner]
runner_id = "${result.runner_id}"
runner_secret = "${result.runner_secret}"
workspace_id = "${opts.workspace_id}"
max_concurrent_agents = 1

${providers}`;
}
