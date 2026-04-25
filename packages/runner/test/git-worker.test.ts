import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { GitWorker } from '../src/git-worker.js';

async function initBareRepo(dir: string) {
  await simpleGit(dir).init(true);
}

async function initLocalRepo(local: string, remote: string) {
  await simpleGit().clone(remote, local, ['--local']);
  const git = simpleGit(local);
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  await writeFile(join(local, 'README.md'), '# AWW');
  await git.add('README.md');
  await git.commit('init');
  await git.branch(['-M', 'main']);
  await git.push('origin', 'main', ['--set-upstream']);
}

describe('GitWorker', () => {
  let remoteDir: string;
  let localDir: string;
  let worker: GitWorker;

  beforeEach(async () => {
    remoteDir = await mkdtemp(join(tmpdir(), 'aww-remote-'));
    localDir = await mkdtemp(join(tmpdir(), 'aww-local-'));
    await initBareRepo(remoteDir);
    await initLocalRepo(localDir, remoteDir);
    worker = new GitWorker(localDir, 'run-abc');
  });

  afterEach(async () => {
    await rm(remoteDir, { recursive: true, force: true });
    await rm(localDir, { recursive: true, force: true });
  });

  it('createFeatureBranch creates branch from HEAD', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');

    const branches = await simpleGit(localDir).branchLocal();
    expect(branches.all).toContain('aww/ws/run-abc');
  });

  it('commitAll creates a commit', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');
    await writeFile(join(localDir, 'output.ts'), 'const x = 1;');

    const sha = await worker.commitAll('aww(step-1): generated code');

    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('getDiffStat returns stat string', async () => {
    await worker.createFeatureBranch('aww/ws/run-abc');
    await writeFile(join(localDir, 'output.ts'), 'const x = 1;');
    await worker.commitAll('aww(step-1): generated code');

    const stat = await worker.getDiffStat();

    expect(stat).toContain('output.ts');
  });
});
