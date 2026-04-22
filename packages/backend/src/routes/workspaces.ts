import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { workspaceMembers, workspaces } from '../db/schema/workspaces.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  githubRepoUrl: z.string().url().optional(),
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

    return reply.code(201).send({ data: workspace });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as AuthenticatedRequest).userId;
    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)),
    });

    if (!member) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, id),
    });

    return { data: workspace };
  });
};
