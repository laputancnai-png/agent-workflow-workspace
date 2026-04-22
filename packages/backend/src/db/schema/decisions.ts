import { createId } from '@paralleldrive/cuid2';
import { jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { artifacts } from './artifacts.js';
import { users } from './users.js';
import { workflowSteps } from './workflows.js';

export const decisionActionEnum = pgEnum('decision_action', [
  'approve',
  'reject',
  'request_changes',
  'edit',
  'take_over',
  'rerun',
]);

export const decisions = pgTable('decisions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  stepId: text('step_id')
    .notNull()
    .references(() => workflowSteps.id),
  actorId: text('actor_id').references(() => users.id),
  action: decisionActionEnum('action').notNull(),
  comment: text('comment'),
  artifactVersionId: text('artifact_version_id').references(() => artifacts.id),
  resultingArtifactId: text('resulting_artifact_id').references(() => artifacts.id),
  targetStepId: text('target_step_id').references(() => workflowSteps.id),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;
