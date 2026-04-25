import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';

import { startDaemon } from './daemon.js';
import { registerRunner } from './registration.js';

export function buildCliProgram() {
  const program = new Command();

  program.name('aww').description('AWW Local Runner CLI').version('0.1.0');
  program
    .command('runner:register')
    .description('Register this machine as an AWW Runner')
    .requiredOption('--token <token>', 'One-time registration token from AWW UI')
    .requiredOption('--url <url>', 'AWW Cloud base URL')
    .requiredOption('--workspace <id>', 'Workspace ID')
    .action(async (opts: { token: string; url: string; workspace: string }) => {
      await registerRunner({
        base_url: opts.url,
        registration_token: opts.token,
        workspace_id: opts.workspace,
        provider_ids: [],
      });
    });
  program
    .command('runner:start')
    .description('Start the Runner daemon')
    .option('--config <path>', 'Path to config.toml', join(homedir(), '.aww', 'config.toml'))
    .action(async (opts: { config: string }) => {
      await startDaemon(opts.config);
    });

  return program;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildCliProgram().parseAsync(process.argv).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
