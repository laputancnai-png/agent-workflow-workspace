import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';

export async function commitArtifact(id: string) {
  const [artifact] = await db
    .update(artifacts)
    .set({ status: 'committed', committedAt: new Date() })
    .where(eq(artifacts.id, id))
    .returning();

  return artifact;
}
