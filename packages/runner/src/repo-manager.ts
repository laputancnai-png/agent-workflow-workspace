import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { simpleGit } from 'simple-git';

export class RepoManager {
  constructor(
    private readonly targetPath: string,
    private readonly repoUrl: string,
  ) {}

  async prepare(): Promise<string> {
    if (existsSync(this.targetPath)) {
      await simpleGit(this.targetPath).fetch('origin').catch(() => {});
    } else {
      mkdirSync(dirname(this.targetPath), { recursive: true });
      await simpleGit().clone(this.repoUrl, this.targetPath);
      const git = simpleGit(this.targetPath);
      await git.addConfig('user.email', 'runner@aww.local');
      await git.addConfig('user.name', 'AWW Runner');
    }

    return this.targetPath;
  }
}
