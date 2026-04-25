import { createId } from '@paralleldrive/cuid2';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { workflowSteps } from './workflows.js';

export const artifactRoleEnum = pgEnum('artifact_role', [
  'PRD',
  'PLAN',
  'TASK_LIST',
  'CODE_PATCH',
  'TEST_REPORT',
  'REVIEW_COMMENT',
  'PR_SUMMARY',
  'HUMAN_EDIT',
]);
export const artifactStatusEnum = pgEnum('artifact_status', ['draft', 'committed', 'superseded']);
export const artifactCreatorEnum = pgEnum('artifact_creator_type', ['human', 'agent', 'system']);

export const artifacts = pgTable('artifacts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  stepId: text('step_id').references(() => workflowSteps.id),
  role: artifactRoleEnum('role').notNull(),
  status: artifactStatusEnum('status').default('draft').notNull(),
  parentArtifactId: text('parent_artifact_id'),
  version: integer('version').default(1).notNull(),
  title: varchar('title', { length: 256 }),
  contentInline: text('content_inline'),
  blobKey: text('blob_key'),
  gitCommitSha: varchar('git_commit_sha', { length: 64 }),
  createdByType: artifactCreatorEnum('created_by_type').notNull(),
  createdById: text('created_by_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  committedAt: timestamp('committed_at'),
});

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
