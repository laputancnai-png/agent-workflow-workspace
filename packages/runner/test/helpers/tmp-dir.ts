import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTmpDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'aww-runner-test-'));

  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
