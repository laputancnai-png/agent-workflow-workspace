import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { getDownloadUrl, getUploadUrl } from '../lib/r2.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';
import { commitArtifact } from '../services/artifact.js';

const createArtifactSchema = z.object({
  role: z.enum([
    'PRD',
    'PLAN',
    'TASK_LIST',
    'CODE_PATCH',
    'TEST_REPORT',
    'REVIEW_COMMENT',
    'PR_SUMMARY',
    'HUMAN_EDIT',
  ]),
  step_id: z.string().optional(),
  parent_artifact_id: z.string().optional(),
  content_inline: z.string().max(64 * 1024).optional(),
  title: z.string().optional(),
  request_upload_url: z.boolean().optional(),
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.post('/', async (request, reply) => {
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = createArtifactSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_artifact', issues: parsed.error.issues });
    }

    const blobKey = parsed.data.request_upload_url ? `artifacts/${createId()}` : undefined;
    const [artifact] = await db
      .insert(artifacts)
      .values({
        role: parsed.data.role,
        stepId: parsed.data.step_id,
        parentArtifactId: parsed.data.parent_artifact_id,
        contentInline: parsed.data.content_inline,
        blobKey,
        title: parsed.data.title,
        createdByType: 'human',
        createdById: userId,
        status: 'draft',
      })
      .returning();

    const uploadUrl = blobKey ? await getUploadUrl(blobKey) : undefined;

    return reply.code(201).send({ data: artifact, upload_url: uploadUrl });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await db.query.artifacts.findFirst({
      where: eq(artifacts.id, id),
    });

    if (!artifact) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return { data: artifact };
  });

  app.get('/:id/content', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await db.query.artifacts.findFirst({
      where: eq(artifacts.id, id),
    });

    if (!artifact) {
      return reply.code(404).send({ error: 'not_found' });
    }

    if (artifact.contentInline) {
      return { data: { content: artifact.contentInline } };
    }

    if (artifact.blobKey) {
      return reply.redirect(302, await getDownloadUrl(artifact.blobKey));
    }

    return reply.code(404).send({ error: 'no_content' });
  });

  app.post('/:id/commit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = await commitArtifact(id);

    if (!artifact) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return { data: artifact };
  });
};
