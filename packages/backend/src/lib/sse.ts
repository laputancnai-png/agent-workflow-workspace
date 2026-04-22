import { createId } from '@paralleldrive/cuid2';
import type { FastifyReply } from 'fastify';

import { getRedis } from './redis.js';

interface SSESubscriber {
  id: string;
  reply: FastifyReply;
  workspaceId: string;
}

const subscribers = new Map<string, Set<SSESubscriber>>();
let relayStarted = false;

export function addSSESubscriber(workspaceId: string, reply: FastifyReply) {
  const subscriber = { id: createId(), reply, workspaceId };
  const workspaceSubscribers = subscribers.get(workspaceId) ?? new Set<SSESubscriber>();
  workspaceSubscribers.add(subscriber);
  subscribers.set(workspaceId, workspaceSubscribers);

  return () => {
    workspaceSubscribers.delete(subscriber);
  };
}

export async function publishEvent(
  eventType: string,
  payload: Record<string, unknown>,
  workspaceId?: string,
) {
  const event = {
    event_id: createId(),
    event_type: eventType,
    workspace_id: workspaceId,
    payload,
    timestamp: new Date().toISOString(),
  };
  const channel = workspaceId ? `aww:ws:${workspaceId}` : 'aww:events';

  await getRedis().publish(channel, JSON.stringify(event));
}

export function startSSERelay() {
  if (relayStarted) {
    return;
  }

  relayStarted = true;
  const sub = getRedis().duplicate();
  void sub.psubscribe('aww:ws:*');
  sub.on('pmessage', (_pattern, channel, message) => {
    const workspaceId = channel.replace('aww:ws:', '');
    const workspaceSubscribers = subscribers.get(workspaceId);

    if (!workspaceSubscribers) {
      return;
    }

    for (const subscriber of workspaceSubscribers) {
      subscriber.reply.raw.write(`data: ${message}\n\n`);
    }
  });
}
