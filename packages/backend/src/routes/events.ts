import { and, eq, or } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/index.js';
import { workspaceMembers, workspaces } from '../db/schema/workspaces.js';
import { addSSESubscriber, replayEventsSince } from '../lib/sse.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:workspaceId/events', { preHandler: requireUser }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const userId = (request as AuthenticatedRequest).userId;

    const workspace = await db.query.workspaces.findFirst({
      where: or(eq(workspaces.id, workspaceId), eq(workspaces.slug, workspaceId)),
    });
    if (!workspace) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
    });

    if (!member) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.write(':ok\n\n');

    const lastEventId = request.headers['last-event-id'];
    if (typeof lastEventId === 'string' && lastEventId) {
      const replay = await replayEventsSince(workspace.id, lastEventId);
      for (const event of replay) {
        reply.raw.write(`id: ${event.stream_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    }

    const unsubscribe = addSSESubscriber(workspace.id, reply);
    request.raw.on('close', unsubscribe);

    await new Promise(() => {});
  });
};
