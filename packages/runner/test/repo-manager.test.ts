import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { RepoManager } from '../src/repo-manager.js';

async function initRemoteRepo(dir: string) {
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(dir, 'README.md'), '# Test');
  await git.add('README.md');
  await git.commit('init');
  await git.branch(['-M', 'main']);
  return dir;
}

describe('RepoManager', () => {
  let remoteDir: string;
  let workDir: string;

  beforeEach(async () => {
    remoteDir = await mkdtemp(join(tmpdir(), 'aww-remote-'));
    workDir = await mkdtemp(join(tmpdir(), 'aww-work-'));
    await initRemoteRepo(remoteDir);
  });

  afterEach(async () => {
    await rm(remoteDir, { recursive: true, force: true });
    await rm(workDir, { recursive: true, force: true });
  });

  it('clones repo on first prepare()', async () => {
    const targetPath = join(workDir, 'repo');
    const manager = new RepoManager(targetPath, remoteDir);

    const repoPath = await manager.prepare();

    expect(repoPath).toBe(targetPath);
    expect(existsSync(join(targetPath, '.git'))).toBe(true);
    expect(existsSync(join(targetPath, 'README.md'))).toBe(true);
  });

  it('fetches on subsequent prepare() calls without re-cloning', async () => {
    const targetPath = join(workDir, 'repo');
    const manager = new RepoManager(targetPath, remoteDir);

    await manager.prepare();
    const repoPath2 = await manager.prepare();

    expect(repoPath2).toBe(targetPath);
    expect(existsSync(join(targetPath, '.git'))).toBe(true);
  });

  it('returns the target path', async () => {
    const targetPath = join(workDir, 'repo');
    const manager = new RepoManager(targetPath, remoteDir);

    const result = await manager.prepare();
    expect(result).toBe(targetPath);
  });
});
