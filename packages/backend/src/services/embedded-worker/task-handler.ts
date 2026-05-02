import { join } from 'node:path';

import { and, eq, inArray } from 'drizzle-orm';

import { AgentExecutor } from '@aww/runner/executor';
import { redactSecrets } from '@aww/runner/redact';
import type { AgentRequest } from '@aww/runner/agents/protocol';

import { db } from '../../db/index.js';
import { artifacts } from '../../db/schema/artifacts.js';
import { agentRuns } from '../../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../../db/schema/workflows.js';
import { workspaces } from '../../db/schema/workspaces.js';
import { INLINE_CONTENT_LIMIT, putArtifactContent } from '../../lib/r2.js';
import { publishEvent } from '../../lib/sse.js';
import { requeueStep, scheduleNextStep } from '../scheduler.js';
import type { WorkerConfig } from './config.js';

async function runSafe(cmd: string, args: string[], cwd: string): Promise<{ success: boolean; stderr: string }> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ success: code === 0, stderr }));
    child.on('error', (err) => resolve({ success: false, stderr: err.message }));
  });
}

async function createPullRequest(repoPath: string, featureBranch: string, prSummary: string): Promise<void> {
  const lines = prSummary.split('\n').filter(Boolean);
  const title = lines[0]?.replace(/^#+\s*/, '').trim() || featureBranch;
  const body = lines.slice(1).join('\n').trim() || prSummary;
  const result = await runSafe('gh', ['pr', 'create', '--title', title, '--body', body, '--head', featureBranch], repoPath);
  if (!result.success) {
    process.stderr.write(`[worker] gh pr create failed: ${result.stderr}\n`);
  }
}

export async function claimNextTask(runnerId: string): Promise<string | null> {
  // Claim atomically: find a pending agent_run for this runner and mark it running
  const pending = await db.query.agentRuns.findFirst({
    where: and(eq(agentRuns.runnerId, runnerId), eq(agentRuns.status, 'pending')),
  });
  if (!pending) return null;

  const [claimed] = await db
    .update(agentRuns)
    .set({ status: 'running', updatedAt: new Date() })
    .where(and(eq(agentRuns.id, pending.id), eq(agentRuns.status, 'pending')))
    .returning();

  return claimed?.id ?? null;
}

export async function handleTask(agentRunId: string, cfg: WorkerConfig): Promise<void> {
  const agentRun = await db.query.agentRuns.findFirst({ where: eq(agentRuns.id, agentRunId) });
  if (!agentRun) return;

  const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, agentRun.stepId) });
  const run = step ? await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, step.runId) }) : null;
  const workspace = run ? await db.query.workspaces.findFirst({ where: eq(workspaces.id, run.workspaceId) }) : null;

  if (!step || !run || !workspace) {
    await db.update(agentRuns).set({ status: 'failed', updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));
    return;
  }

  // Ensure feature branch name
  let featureBranch = run.featureBranch ?? null;
  if (!featureBranch) {
    featureBranch = `aww/${workspace.slug}/${run.id.slice(0, 8)}`;
    await db.update(workflowRuns).set({ featureBranch, updatedAt: new Date() }).where(eq(workflowRuns.id, run.id));
  }

  // Load input artifacts
  const runSteps = await db.select({ id: workflowSteps.id }).from(workflowSteps).where(eq(workflowSteps.runId, run.id));
  const stepIds = runSteps.map((s) => s.id);
  const inputArtifacts =
    step.inputArtifactRoles.length > 0 && stepIds.length > 0
      ? await db
          .select({ id: artifacts.id, role: artifacts.role, content: artifacts.contentInline })
          .from(artifacts)
          .where(
            and(
              inArray(artifacts.stepId, stepIds),
              inArray(artifacts.role, step.inputArtifactRoles as Array<typeof artifacts.$inferSelect['role']>),
              eq(artifacts.status, 'committed'),
            ),
          )
      : [];

  // Set up repo path
  let repoPath = process.cwd();
  if (workspace.githubRepoUrl) {
    const repoDir = join(cfg.repoCacheDir, workspace.slug);
    try {
      const { RepoManager } = await import('@aww/runner/repo-manager');
      repoPath = await new RepoManager(repoDir, workspace.githubRepoUrl).prepare();
      const { GitWorker } = await import('@aww/runner/git-worker');
      await new GitWorker(repoPath, run.id).createFeatureBranch(featureBranch);
    } catch (err) {
      process.stderr.write(`[worker] repo setup failed: ${String(err)}\n`);
    }
  }

  const heartbeatTimer = setInterval(async () => {
    await db.update(agentRuns).set({ lastHeartbeatAt: new Date(), updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));
  }, cfg.heartbeatIntervalMs);

  process.stderr.write(`[worker] starting — run=${agentRunId} role=${agentRun.agentRole} dispatcher=${cfg.dispatcherPath} providers=${Object.keys(cfg.providers).join(',') || 'NONE'}\n`);
  const executor = new AgentExecutor({ scriptPath: cfg.dispatcherPath, timeoutMs: cfg.agentTimeoutMs });

  const request: AgentRequest = {
    type: 'run',
    agent_run_id: agentRunId,
    step_id: step.id,
    agent_role: agentRun.agentRole,
    input_artifacts: inputArtifacts.map((a) => ({ id: a.id, role: a.role, content: a.content ?? '' })),
    preferred_provider: workspace.preferredProvider ?? 'openclaw',
    checkpoint_data: (agentRun.checkpointData as Record<string, unknown>) ?? undefined,
    config: {
      repo_path: repoPath,
      feature_branch: featureBranch,
      max_tokens_budget: cfg.maxTokensBudget,
      providers: cfg.providers as Record<string, unknown>,
    },
  };

  try {
    const response = await executor.run(request);
    clearInterval(heartbeatTimer);

    if (response.type === 'complete') {
      // Create output artifacts
      const createdIds: string[] = [];
      for (const art of response.output_artifacts ?? []) {
        const isLarge = Buffer.byteLength(art.content, 'utf8') > INLINE_CONTENT_LIMIT;
        const blobData = isLarge ? await putArtifactContent(art.content).catch(() => null) : null;
        const [artifact] = await db
          .insert(artifacts)
          .values({
            role: art.role as typeof artifacts.$inferInsert['role'],
            stepId: step.id,
            contentInline: blobData ? null : art.content,
            blobKey: blobData?.blobKey ?? undefined,
            gitCommitSha: art.git_commit_sha,
            createdByType: 'agent',
            createdById: agentRun.runnerId,
            status: 'committed',
            committedAt: new Date(),
          })
          .returning();
        createdIds.push(artifact.id);
      }

      const [committed] = await db
        .update(agentRuns)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date(), outputPayloadRef: { artifact_ids: createdIds } })
        .where(and(eq(agentRuns.id, agentRunId), eq(agentRuns.status, 'running')))
        .returning();

      if (committed) {
        if (agentRun.agentRole === 'summarizer' && createdIds.length && featureBranch) {
          const summaryArt = response.output_artifacts?.[0];
          if (summaryArt) await createPullRequest(repoPath, featureBranch, summaryArt.content);
        }

        await db
          .update(workflowSteps)
          .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(workflowSteps.id, step.id));

        await publishEvent('step.status_changed', { stepId: step.id, status: 'completed', run_id: run.id }, workspace.id);
        await scheduleNextStep(step.runId, step.position);
      }
    } else {
      process.stderr.write(
        `[worker] agent fail — run=${agentRunId} role=${agentRun.agentRole} code=${response.error_code ?? 'n/a'} retryable=${String(response.retryable)} msg=${response.error_message ?? ''}\n`,
      );
      await db.update(agentRuns).set({ status: 'failed', updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));

      const retriesUsed = agentRun.attemptNumber;
      const canRetry = response.retryable !== false && retriesUsed <= step.maxRetries;

      if (canRetry) {
        await db.update(workflowSteps).set({ status: 'retrying', updatedAt: new Date() }).where(eq(workflowSteps.id, step.id));
        await publishEvent('step.status_changed', { stepId: step.id, status: 'retrying', run_id: run.id }, workspace.id);
        await requeueStep(step.id, retriesUsed);
      } else {
        await db.update(workflowSteps).set({ status: 'failed', updatedAt: new Date() }).where(eq(workflowSteps.id, step.id));
        await publishEvent('step.status_changed', { stepId: step.id, status: 'failed', run_id: run.id }, workspace.id);
      }
    }
  } catch (err) {
    clearInterval(heartbeatTimer);
    await db.update(agentRuns).set({ status: 'failed', updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));
    await db.update(workflowSteps).set({ status: 'failed', updatedAt: new Date() }).where(eq(workflowSteps.id, step.id));
    await publishEvent('step.status_changed', { stepId: step.id, status: 'failed', run_id: run.id }, workspace.id);
    process.stderr.write(`[worker] task ${agentRunId} threw: ${redactSecrets(String(err))}\n`);
  }
}
