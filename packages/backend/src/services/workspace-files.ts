import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { artifacts } from '../db/schema/artifacts.js';
import type { workspaces } from '../db/schema/workspaces.js';

const execFileAsync = promisify(execFile);

function safeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'workspace';
}

export function workspaceRoot(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>) {
  const baseDir = process.env.AWW_WORKSPACE_ROOT ?? join(process.cwd(), '..', '..', 'tmp', 'workspaces');
  return join(baseDir, safeSegment(workspace.name || workspace.slug));
}

export async function ensureWorkspaceFolders(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>) {
  const root = workspaceRoot(workspace);
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'code'), { recursive: true });
  return root;
}

export async function workspaceCodePath(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>) {
  const root = await ensureWorkspaceFolders(workspace);
  return join(root, 'code');
}

async function runGit(args: string[], cwd: string) {
  return execFileAsync('git', args, { cwd, timeout: 15000 });
}

export async function ensureWorkspaceGit(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>) {
  const codeDir = await workspaceCodePath(workspace);
  const expectedRoot = resolve(codeDir);
  try {
    const root = (await runGit(['rev-parse', '--show-toplevel'], codeDir)).stdout.trim();
    if (resolve(root) !== expectedRoot) {
      throw new Error(`workspace code path is inside parent git repo: ${root}`);
    }
  } catch {
    await runGit(['init', '-b', 'main'], codeDir);
    await runGit(['config', 'user.name', 'AWW Agent'], codeDir);
    await runGit(['config', 'user.email', 'aww-agent@example.local'], codeDir);
    await writeFile(join(codeDir, '.gitignore'), ['node_modules/', '.venv/', '.pytest_cache/', 'dist/', 'build/', 'coverage/', ''].join('\n'), 'utf8');
    try {
      await stat(join(codeDir, 'README.md'));
    } catch {
      await writeFile(join(codeDir, 'README.md'), `# ${workspace.name}\n\nAWW workspace code directory.\n`, 'utf8');
    }
    await runGit(['add', '.gitignore', 'README.md'], codeDir);
    await runGit(['commit', '-m', 'chore: initialize workspace code directory'], codeDir);
  }
  return codeDir;
}

export async function getWorkspaceGitInfo(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>) {
  const codeDir = await ensureWorkspaceGit(workspace);
  const branch = (await runGit(['branch', '--show-current'], codeDir)).stdout.trim() || 'main';
  const head = (await runGit(['rev-parse', 'HEAD'], codeDir)).stdout.trim();
  const commitCount = Number((await runGit(['rev-list', '--count', 'HEAD'], codeDir)).stdout.trim());
  return { branch, head, commitCount };
}

export async function checkoutWorkspaceBranch(
  workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>,
  branch: string,
  baseRef = 'HEAD',
) {
  const codeDir = await ensureWorkspaceGit(workspace);
  await runGit(['checkout', '-B', branch, baseRef], codeDir);
  return getWorkspaceGitInfo(workspace);
}

export async function commitWorkspaceCode(workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>, message: string) {
  const codeDir = await ensureWorkspaceGit(workspace);
  await runGit(['add', '-A'], codeDir);
  const status = (await runGit(['status', '--porcelain'], codeDir)).stdout.trim();
  if (!status) return null;
  await runGit(['commit', '-m', message], codeDir);
  return getWorkspaceGitInfo(workspace);
}

export async function writeArtifactDoc(
  workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>,
  artifact: Pick<typeof artifacts.$inferSelect, 'id' | 'role' | 'title' | 'contentInline'>,
) {
  if (!artifact.contentInline) return;

  const root = await ensureWorkspaceFolders(workspace);
  const docsDir = join(root, 'docs');
  const base = artifact.role.toLowerCase();
  const filename = `${base}.md`;
  const oldFiles = await readdir(docsDir).catch(() => []);
  await Promise.all(
    oldFiles
      .filter((file) => file !== filename && file.startsWith(`${base}-`) && file.endsWith('.md'))
      .map((file) => rm(join(docsDir, file), { force: true })),
  );
  await writeFile(join(docsDir, filename), artifact.contentInline, 'utf8');
}

export interface WorkspaceFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: WorkspaceFileNode[];
}

const IGNORED_CODE_TREE_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'coverage',
]);

export async function listWorkspaceFiles(
  workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>,
  area: 'docs' | 'code',
): Promise<WorkspaceFileNode[]> {
  const root = await ensureWorkspaceFolders(workspace);
  const base = join(root, area);

  async function walk(dir: string, relative = ''): Promise<WorkspaceFileNode[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const sortedEntries = entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const nodes: WorkspaceFileNode[] = [];
    for (const entry of sortedEntries) {
      if (area === 'code' && IGNORED_CODE_TREE_DIRS.has(entry.name)) continue;

      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const abs = join(dir, entry.name);
      if (entry.name === '.git') {
        nodes.push({ name: '.git', path: rel, type: 'directory' as const, children: [] });
        continue;
      }

      try {
        if (entry.isDirectory()) {
          nodes.push({ name: entry.name, path: rel, type: 'directory' as const, children: await walk(abs, rel) });
          continue;
        }

        const info = await stat(abs);
        if (!info.isFile()) continue;
        nodes.push({ name: entry.name, path: rel, type: 'file' as const, size: info.size } as WorkspaceFileNode & { size: number });
      } catch {
        continue;
      }
    }
    return nodes;
  }

  return walk(base);
}

export async function readWorkspaceFile(
  workspace: Pick<typeof workspaces.$inferSelect, 'name' | 'slug'>,
  area: 'docs' | 'code',
  relativePath: string,
) {
  const root = await ensureWorkspaceFolders(workspace);
  const base = resolve(join(root, area));
  const target = resolve(join(base, relativePath));
  if (!target.startsWith(`${base}/`) || relativePath.split('/').includes('.git')) {
    throw new Error('invalid_path');
  }
  const info = await stat(target);
  if (!info.isFile()) throw new Error('not_file');
  return readFile(target, 'utf8');
}
