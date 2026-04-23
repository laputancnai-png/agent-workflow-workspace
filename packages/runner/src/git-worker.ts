import { createWriteStream, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { simpleGit, type SimpleGit } from 'simple-git';

export class GitWorker {
  private readonly git: SimpleGit;
  private readonly lockPath: string;

  constructor(
    private readonly repoPath: string,
    private readonly runId: string,
  ) {
    this.git = simpleGit(repoPath);
    const lockDir = join(homedir(), '.aww', 'locks');
    mkdirSync(lockDir, { recursive: true });
    this.lockPath = join(lockDir, `${runId}.lock`);
  }

  private async withLock<T>(fn: () => Promise<T>) {
    const lockStream = createWriteStream(this.lockPath, { flags: 'wx' });

    try {
      return await fn();
    } finally {
      lockStream.close();
      await unlink(this.lockPath).catch(() => {});
    }
  }

  async fetch() {
    await this.withLock(() => this.git.fetch('origin'));
  }

  async createFeatureBranch(branchName: string) {
    await this.withLock(async () => {
      const branches = await this.git.branchLocal();

      if (branches.all.includes(branchName)) {
        await this.git.checkout(branchName);
        await this.git.pull('origin', branchName, ['--ff-only']).catch(() => {});
        return;
      }

      await this.git.checkoutLocalBranch(branchName);
    });
  }

  async commitAll(message: string) {
    return this.withLock(async () => {
      await this.git.add('-A');
      await this.git.commit(message);
      const log = await this.git.log({ maxCount: 1 });

      if (!log.latest) {
        throw new Error('No git commit found after commitAll');
      }

      return log.latest.hash;
    });
  }

  async pushBranch(branchName: string) {
    await this.withLock(async () => {
      try {
        await this.git.push('origin', branchName, ['--set-upstream']);
      } catch {
        await this.git.pull('origin', branchName, ['--rebase']);
        await this.git.push('origin', branchName);
      }
    });
  }

  async getDiffStat() {
    return this.git.diff(['HEAD~1', 'HEAD', '--stat']);
  }
}
