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
  const result = await requestJson<RegistrationResult>(`${opts.base_url}/api/v1/runners/register`, {
    method: 'POST',
    body: {
      registration_token: opts.registration_token,
      machine_id: randomUUID(),
      machine_hostname: hostname(),
      workspace_id: opts.workspace_id,
      capabilities: {
        agent_roles: ['planner', 'tasker', 'coder', 'tester', 'reviewer', 'summarizer'],
        providers: opts.provider_ids,
      },
    },
  });
  const awwDir = join(homedir(), '.aww');
  await mkdir(awwDir, { recursive: true });
  await writeFile(
    join(awwDir, 'runner.json'),
    JSON.stringify({ ...result, workspace_id: opts.workspace_id, base_url: opts.base_url }, null, 2),
    { mode: 0o600 },
  );

  return result;
}
