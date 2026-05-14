import { spawn } from 'node:child_process';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { agentRuns } from '../db/schema/agent-runs.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaces } from '../db/schema/workspaces.js';
import { publishEvent } from '../lib/sse.js';
import { publishWorkspaceToGitHub } from './github-publisher.js';
import { scheduleNextStep } from './scheduler.js';
import { checkoutWorkspaceBranch, commitWorkspaceCode, workspaceCodePath, writeArtifactDoc } from './workspace-files.js';

type ArtifactRole = typeof artifacts.$inferSelect.role;

const roleArtifact: Record<string, { role: ArtifactRole; title: string }> = {
  planner: { role: 'PLAN', title: '工程实现计划' },
  tasker: { role: 'TASK_LIST', title: '任务列表' },
  coder: { role: 'CODE_PATCH', title: '代码实现结果' },
  tester: { role: 'TEST_REPORT', title: '测试报告' },
  reviewer: { role: 'REVIEW_COMMENT', title: '代码审查结果' },
  summarizer: { role: 'PR_SUMMARY', title: 'PR 摘要' },
};

function runCommand(command: string, args: string[], cwd: string, timeoutMs = 180000) {
  return new Promise<{ ok: boolean; output: string; exitCode: number | null }>((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, output: error instanceof Error ? error.message : String(error), exitCode: null });
      return;
    }
    let output = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);

    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, output: error.message, exitCode: null });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0, output: output.trim(), exitCode });
    });
  });
}

function argsFor(provider: string, prompt: string, codeDir: string) {
  switch (provider) {
    case 'codex':
      return { command: 'codex', args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--color', 'never', '--cd', codeDir, prompt] };
    case 'anthropic':
    case 'claude':
      return { command: 'claude', args: ['--print', prompt, '--output-format', 'text', '--permission-mode', 'acceptEdits', '--add-dir', codeDir] };
    case 'openclaw':
      return { command: 'openclaw', args: ['agent', '--local', '--agent', 'main', '--message', prompt, '--timeout', '120'] };
    case 'hermes':
      return { command: 'hermes', args: ['chat', '-Q', '-q', prompt] };
    default:
      return { command: 'codex', args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--color', 'never', '--cd', codeDir, prompt] };
  }
}

function rolesForAgent(role: string): ArtifactRole[] {
  switch (role) {
    case 'planner':
      return ['PRD'];
    case 'tasker':
      return ['PRD', 'PLAN'];
    case 'coder':
      return ['PRD', 'PLAN', 'TASK_LIST'];
    case 'tester':
      return ['PRD', 'PLAN', 'TASK_LIST', 'CODE_PATCH'];
    case 'reviewer':
      return ['PRD', 'PLAN', 'TASK_LIST', 'CODE_PATCH', 'TEST_REPORT'];
    case 'summarizer':
      return ['PRD', 'PLAN', 'TASK_LIST', 'CODE_PATCH', 'TEST_REPORT', 'REVIEW_COMMENT'];
    default:
      return [];
  }
}

async function loadInputArtifacts(runId: string, role: string) {
  const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, runId));
  const stepIds = steps.map((item) => item.id);
  if (!stepIds.length) return [];

  const wantedRoles = rolesForAgent(role);
  const all = await db
    .select()
    .from(artifacts)
    .where(and(inArray(artifacts.stepId, stepIds), inArray(artifacts.role, wantedRoles), eq(artifacts.status, 'committed')));

  // When multiple artifacts share the same role (e.g. human-edited PLAN supersedes agent-generated PLAN),
  // keep only the most recently created one per role.
  const latestByRole = new Map<string, typeof artifacts.$inferSelect>();
  for (const artifact of all) {
    const existing = latestByRole.get(artifact.role);
    if (!existing || artifact.createdAt > existing.createdAt) {
      latestByRole.set(artifact.role, artifact);
    }
  }
  return [...latestByRole.values()];
}

function compactArtifactContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;
  const headSize = Math.floor(maxChars * 0.65);
  const tailSize = maxChars - headSize;
  return [
    content.slice(0, headSize),
    '',
    `... [truncated ${content.length - maxChars} chars] ...`,
    '',
    content.slice(-tailSize),
  ].join('\n');
}

function formatInputArtifacts(inputArtifacts: Array<typeof artifacts.$inferSelect>, maxCharsPerArtifact = 12000) {
  if (!inputArtifacts.length) return '(no input artifacts available)';
  return inputArtifacts
    .map((artifact) => [
      `## ${artifact.role}: ${artifact.title ?? artifact.id}`,
      artifact.contentInline ? compactArtifactContent(artifact.contentInline, maxCharsPerArtifact) : '(artifact has no inline content)',
    ].join('\n\n'))
    .join('\n\n---\n\n');
}

function promptFor(role: string, workspaceName: string, codeDir: string, inputArtifacts: Array<typeof artifacts.$inferSelect>) {
  const inputs = formatInputArtifacts(inputArtifacts, role === 'summarizer' ? 4000 : 12000);
  if (role === 'coder') {
    return [
      `You are the coding agent for workspace "${workspaceName}".`,
      `Work in this code directory: ${codeDir}.`,
      '',
      'Implement the requested product behavior exactly from the PRD, engineering plan, and task list below.',
      'Do not invent an unrelated sample app or placeholder feature.',
      'Create or modify real source files and tests under the code directory.',
      'Keep the change coherent and commit-ready.',
      'When done, summarize changed files and behavior.',
      '',
      '# Input artifacts',
      inputs,
    ].join('\n');
  }

  if (role === 'summarizer') {
    return [
      `You are the PR summarizer agent for workspace "${workspaceName}".`,
      'Return a GitHub pull request title and body in Markdown.',
      'Put the PR title on the first line as a Markdown H1.',
      'Include sections for Summary, Changes, Tests, Risks, and Review Notes.',
      '',
      '# Input artifacts',
      inputs,
    ].join('\n');
  }

  return [
    `You are the ${role} agent for workspace "${workspaceName}".`,
    'Return a concise Markdown artifact for this workflow step.',
    'Be concrete and include assumptions when needed.',
    '',
    '# Input artifacts',
    inputs,
  ].join('\n');
}

export async function executeCliAgentRun(agentRunId: string): Promise<void> {
  const agentRun = await db.query.agentRuns.findFirst({ where: eq(agentRuns.id, agentRunId) });
  if (!agentRun || agentRun.status !== 'running') return;

  const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, agentRun.stepId) });
  if (!step) return;
  const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, step.runId) });
  if (!run) return;
  const workspace = await db.query.workspaces.findFirst({ where: eq(workspaces.id, run.workspaceId) });
  if (!workspace) return;

  const codeDir = await workspaceCodePath(workspace);

  // Ensure coder works on a feature branch, not the base branch.
  if (agentRun.agentRole === 'coder' && !run.featureBranch) {
    const featureBranch = `feat/aww-${run.id.slice(0, 8)}`;
    await checkoutWorkspaceBranch(workspace, featureBranch);
    await db.update(workflowRuns).set({ featureBranch, updatedAt: new Date() }).where(eq(workflowRuns.id, run.id));
  }

  const provider = workspace.preferredProvider || 'codex';
  const inputArtifacts = await loadInputArtifacts(run.id, agentRun.agentRole);
  const prompt = promptFor(agentRun.agentRole, workspace.name, codeDir, inputArtifacts);
  await db.update(agentRuns).set({
    inputPayloadRef: {
      provider,
      codeDir,
      prompt,
      artifactIds: inputArtifacts.map((artifact) => artifact.id),
    },
    updatedAt: new Date(),
  }).where(eq(agentRuns.id, agentRun.id));
  const { command, args } = argsFor(provider, prompt, codeDir);
  const result = await runCommand(command, args, codeDir);

  // Some CLIs (e.g. hermes) exit 0 even when they hit an API error; detect this.
  const hasCliError = /api call failed|rate limit|final error:|authentication failed|unauthorized/i.test(result.output);
  let stepOk = result.ok && !hasCliError;

  // Strip CLI session metadata lines that leak into stdout (e.g. hermes -Q outputs "session_id: xxx").
  const cleanOutput = result.output
    .split('\n')
    .filter((line) => !/^session_id:\s/i.test(line))
    .join('\n')
    .trim();

  // contentInline stores only the agent's substantive output, not execution metadata.
  // Metadata (provider, command, exit code) goes into outputPayloadRef on the agentRun.
  let content = [
    `# ${roleArtifact[agentRun.agentRole]?.title ?? agentRun.agentRole}`,
    '',
    stepOk ? (cleanOutput || '(no output)') : `## 执行失败\n\nProvider: ${provider}, Exit code: ${result.exitCode ?? 'n/a'}\n\n${cleanOutput || '(no output)'}`,
  ].join('\n');

  if (agentRun.agentRole === 'coder') {
    const commit = await commitWorkspaceCode(workspace, `feat(${workspace.slug}): agent implementation`);
    content += `\n\n## Git\n${commit ? `Committed ${commit.head} on ${commit.branch}` : 'No code changes detected.'}`;
  }

  if (agentRun.agentRole === 'summarizer' && result.ok) {
    try {
      const publish = await publishWorkspaceToGitHub(workspace, run, codeDir, cleanOutput);
      content += [
        '',
        '## GitHub',
        `Repository: ${publish.repo}`,
        `Remote: ${publish.remoteUrl}`,
        `Pull request: ${publish.prUrl}`,
      ].join('\n');
    } catch (error) {
      stepOk = false;
      content += [
        '',
        '## GitHub publish failed',
        error instanceof Error ? error.message : String(error),
      ].join('\n');
    }
  }

  const artifactInfo = roleArtifact[agentRun.agentRole] ?? roleArtifact.reviewer;
  const [artifact] = await db.insert(artifacts).values({
    role: artifactInfo.role,
    stepId: step.id,
    title: artifactInfo.title,
    contentInline: content,
    createdByType: 'agent',
    createdById: provider,
    status: 'committed',
    committedAt: new Date(),
  }).returning();
  await writeArtifactDoc(workspace, artifact);

  await db.update(agentRuns).set({
    status: stepOk ? 'completed' : 'failed',
    completedAt: stepOk ? new Date() : null,
    updatedAt: new Date(),
    outputPayloadRef: { provider, command, exitCode: result.exitCode, githubPublished: agentRun.agentRole === 'summarizer' ? stepOk : undefined },
  }).where(eq(agentRuns.id, agentRun.id));

  await db.update(workflowSteps).set({
    status: stepOk ? 'completed' : 'failed',
    completedAt: stepOk ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(workflowSteps.id, step.id));

  // SSE publish must not block workflow advancement — fire-and-forget.
  publishEvent('step.status_changed', { stepId: step.id, status: stepOk ? 'completed' : 'failed', run_id: step.runId }, run.workspaceId).catch(() => {});

  if (stepOk) {
    await scheduleNextStep(step.runId, step.position);
  } else {
    // Mark run failed so it doesn't silently stay in 'running' state.
    await db.update(workflowRuns).set({ status: 'failed', updatedAt: new Date() }).where(eq(workflowRuns.id, run.id));
    publishEvent('run.status_changed', { run_id: run.id, status: 'failed' }, run.workspaceId).catch(() => {});
  }
}
