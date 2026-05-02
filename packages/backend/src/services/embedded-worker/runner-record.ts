import { and, eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { runners } from '../../db/schema/runners.js';
import { publishEvent } from '../../lib/sse.js';

export const EMBEDDED_MACHINE_ID_PREFIX = 'embedded';

export async function upsertEmbeddedRunner(opts: {
  machineId: string;
  workspaceId: string;
  capabilities: string[];
}): Promise<string> {
  const existing = await db.query.runners.findFirst({
    where: and(eq(runners.machineId, opts.machineId), eq(runners.workspaceId, opts.workspaceId)),
  });

  if (existing) {
    await db
      .update(runners)
      .set({ status: 'online', lastHeartbeatAt: new Date(), capabilities: opts.capabilities })
      .where(eq(runners.id, existing.id));
    await publishEvent('runner.status_changed', { runner_id: existing.id, machine_id: opts.machineId, status: 'online' }, opts.workspaceId);
    return existing.id;
  }

  const [created] = await db
    .insert(runners)
    .values({
      workspaceId: opts.workspaceId,
      machineId: opts.machineId,
      secretHash: 'embedded-no-secret',
      capabilities: opts.capabilities,
      status: 'online',
      lastHeartbeatAt: new Date(),
    })
    .returning();

  await publishEvent('runner.status_changed', { runner_id: created.id, machine_id: opts.machineId, status: 'online' }, opts.workspaceId);
  return created.id;
}

export async function markEmbeddedRunnerOffline(runnerId: string, workspaceId: string): Promise<void> {
  await db.update(runners).set({ status: 'offline' }).where(eq(runners.id, runnerId));
  await publishEvent('runner.status_changed', { runner_id: runnerId, status: 'offline' }, workspaceId);
}
