import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AnthropicAdapter, HermesAdapter, NoProviderError, OpenAIAdapter, OpenClawAdapter, ProviderRegistry } from '@aww/runner/providers';
import { loadWorkerConfig } from '../services/embedded-worker/config.js';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { decisions } from '../db/schema/decisions.js';
import { agentRuns, runners } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaceMembers, workspaces } from '../db/schema/workspaces.js';
import { getRedis } from '../lib/redis.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';
import { registerEmbeddedRunnerForWorkspace } from '../services/embedded-worker/index.js';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  githubRepoUrl: z.string().url().optional(),
  initialPrd: z.string().max(64 * 1024).optional(),
  preferredProvider: z.string().min(1).max(32).optional(),
  preferredModel: z.string().min(1).max(64).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  githubRepoUrl: z.string().url().nullable().optional(),
  defaultBranch: z.string().min(1).max(128).optional(),
  preferredProvider: z.string().min(1).max(32).optional(),
  preferredModel: z.string().min(1).max(64).optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/', async (request) => {
    const userId = (request as AuthenticatedRequest).userId;
    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId));

    return { data: rows.map((row) => row.workspace) };
  });

  app.post('/', async (request, reply) => {
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = createWorkspaceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_workspace', issues: parsed.error.issues });
    }

    const [workspace] = await db.insert(workspaces).values(parsed.data).returning();
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId,
      role: 'owner',
    });

    await registerEmbeddedRunnerForWorkspace(workspace.id).catch((err) => {
      app.log.warn({ err }, 'embedded runner registration failed for new workspace');
    });

    return reply.code(201).send({ data: workspace });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;
    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });

    if (!workspace) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });

    if (!member) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return { data: workspace };
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = updateWorkspaceSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_workspace', issues: parsed.error.issues });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });
    if (!workspace) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [updated] = await db
      .update(workspaces)
      .set({
        updatedAt: new Date(),
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.githubRepoUrl !== undefined && { githubRepoUrl: parsed.data.githubRepoUrl }),
        ...(parsed.data.defaultBranch !== undefined && { defaultBranch: parsed.data.defaultBranch }),
        ...(parsed.data.preferredProvider !== undefined && { preferredProvider: parsed.data.preferredProvider }),
        ...(parsed.data.preferredModel !== undefined && { preferredModel: parsed.data.preferredModel }),
      })
      .where(eq(workspaces.id, workspace.id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return { data: updated };
  });

  app.post('/:id/test-provider', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });
    if (!member) return reply.code(403).send({ error: 'forbidden' });

    const cfg = loadWorkerConfig();
    const preferredProvider = workspace.preferredProvider ?? 'openclaw';

    const adapters = [
      cfg.providers.openclaw ? new OpenClawAdapter(cfg.providers.openclaw) : null,
      cfg.providers.anthropic ? new AnthropicAdapter(cfg.providers.anthropic) : null,
      cfg.providers.openai ? new OpenAIAdapter(cfg.providers.openai) : null,
      cfg.providers.hermes ? new HermesAdapter(cfg.providers.hermes) : null,
    ].filter((a) => a !== null);

    if (adapters.length === 0) {
      return { data: { ok: false, error: `未配置任何 provider（当前: ${preferredProvider}）。请在服务器环境变量中设置 OPENCLAW_GATEWAY_URL 或 ANTHROPIC_API_KEY 等。` } };
    }

    const registry = new ProviderRegistry(adapters);
    await registry.probe();

    const available = registry.availableIds();
    if (!available.includes(preferredProvider)) {
      const allDown = available.length === 0;
      return {
        data: {
          ok: false,
          error: allDown
            ? `所有 provider 均不可用（已配置: ${adapters.map((a) => a.id).join(', ')}）`
            : `当前 provider "${preferredProvider}" 不可用，可用的有: ${available.join(', ')}`,
        },
      };
    }

    try {
      const response = await registry.complete(
        {
          model: workspace.preferredModel ?? 'nvidia/qwen/qwen3-next-80b-a3b-instruct',
          max_tokens: 128,
          messages: [{ role: 'user', content: 'Hi! Reply with just one short greeting in Chinese.' }],
        },
        preferredProvider,
      );
      return { data: { ok: true, response: response.content.trim(), provider: preferredProvider } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: { ok: false, error: msg } };
    }
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;
    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)),
    });

    if (!member || member.role !== 'owner') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    await db.transaction(async (tx) => {
      const runRows = await tx.select({ id: workflowRuns.id }).from(workflowRuns).where(eq(workflowRuns.workspaceId, id));
      const runIds = runRows.map((run) => run.id);

      if (runIds.length > 0) {
        const stepRows = await tx.select({ id: workflowSteps.id }).from(workflowSteps).where(inArray(workflowSteps.runId, runIds));
        const stepIds = stepRows.map((step) => step.id);

        if (stepIds.length > 0) {
          await tx.delete(decisions).where(or(inArray(decisions.stepId, stepIds), inArray(decisions.targetStepId, stepIds)));
          await tx.delete(artifacts).where(inArray(artifacts.stepId, stepIds));
          await tx.delete(agentRuns).where(inArray(agentRuns.stepId, stepIds));
          await tx.delete(workflowSteps).where(inArray(workflowSteps.id, stepIds));
        }

        await tx.delete(workflowRuns).where(inArray(workflowRuns.id, runIds));
      }

      await tx.delete(workspaces).where(eq(workspaces.id, id));
    });
    return reply.code(204).send();
  });

  app.get('/:id/runners', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });
    if (!workspace) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });
    if (!member) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const rows = await db.select().from(runners).where(eq(runners.workspaceId, workspace.id));
    return { data: rows };
  });

  app.get('/:id/artifacts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });
    if (!member) return reply.code(403).send({ error: 'forbidden' });

    const runs = await db.select({ id: workflowRuns.id })
      .from(workflowRuns)
      .where(eq(workflowRuns.workspaceId, workspace.id));

    if (runs.length === 0) return { data: [] };

    const runIds = runs.map((r) => r.id);
    const steps = await db.select({ id: workflowSteps.id })
      .from(workflowSteps)
      .where(inArray(workflowSteps.runId, runIds));

    if (steps.length === 0) return { data: [] };

    const stepIds = steps.map((s) => s.id);
    const rows = await db.select()
      .from(artifacts)
      .where(inArray(artifacts.stepId, stepIds))
      .orderBy(desc(artifacts.createdAt));

    return { data: rows };
  });

  app.get('/:id/audit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, id), eq(workspaces.slug, id)),
    });
    if (!workspace) return reply.code(404).send({ error: 'not_found' });

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });
    if (!member) return reply.code(403).send({ error: 'forbidden' });

    const entries = await getRedis().xrevrange(`aww:stream:${workspace.id}`, '+', '-', 'COUNT', 100);
    const events = entries.map(([streamId, fields]) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) record[fields[i]] = fields[i + 1];
      const parsed = JSON.parse(record.event) as Record<string, unknown>;
      return { stream_id: streamId, ...parsed };
    });

    return { data: events };
  });
};
