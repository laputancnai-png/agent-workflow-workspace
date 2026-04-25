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

interface SSEEnvelope {
  stream_id: string;
  event_id: string;
  event_type: string;
  workspace_id?: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

function streamKey(workspaceId?: string) {
  return workspaceId ? `aww:stream:${workspaceId}` : 'aww:stream:global';
}

function channelKey(workspaceId?: string) {
  return workspaceId ? `aww:ws:${workspaceId}` : 'aww:events';
}

function encodeEvent(event: SSEEnvelope) {
  return `id: ${event.stream_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`;
}

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
  const redis = getRedis();
  const eventBase = {
    event_id: createId(),
    event_type: eventType,
    workspace_id: workspaceId,
    payload,
    timestamp: new Date().toISOString()
  };
  const streamId = await redis.xadd(
    streamKey(workspaceId),
    'MAXLEN',
    '~',
    5000,
    '*',
    'event',
    JSON.stringify(eventBase)
  );
  if (!streamId) {
    throw new Error('Failed to append SSE event to Redis stream');
  }
  const event: SSEEnvelope = { ...eventBase, stream_id: streamId };

  await redis.publish(channelKey(workspaceId), JSON.stringify(event));
}

export async function replayEventsSince(workspaceId: string, lastEventId: string) {
  const entries = await getRedis().xrange(streamKey(workspaceId), `(${lastEventId}`, '+', 'COUNT', 200);

  return entries.map(([streamId, fields]) => {
    const record: Record<string, string> = {};
    for (let index = 0; index < fields.length; index += 2) {
      record[fields[index]] = fields[index + 1];
    }

    const eventBase = JSON.parse(record.event) as Omit<SSEEnvelope, 'stream_id'>;
    return { ...eventBase, stream_id: streamId } satisfies SSEEnvelope;
  });
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
      subscriber.reply.raw.write(encodeEvent(JSON.parse(message) as SSEEnvelope));
    }
  });
}
