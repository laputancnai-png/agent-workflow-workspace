import { createId } from '@paralleldrive/cuid2';
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const stepOwnerEnum = pgEnum('step_owner', ['human', 'agent', 'approval_gate']);
export const triggerTypeEnum = pgEnum('trigger_type', ['manual', 'webhook', 'api']);
export const agentRoleEnum = pgEnum('agent_role', [
  'planner',
  'tasker',
  'coder',
  'tester',
  'reviewer',
  'summarizer',
]);
export const runStatusEnum = pgEnum('run_status', [
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'timed_out',
  'retrying',
  'cancelled',
  'human_owned',
]);

export const workflowTemplates = pgTable('workflow_templates', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  stepsJson: jsonb('steps_json').$type<Record<string, unknown>[]>().notNull(),
  isBuiltIn: boolean('is_built_in').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => workflowTemplates.id),
  triggeredById: text('triggered_by_id').references(() => users.id),
  triggerType: triggerTypeEnum('trigger_type').default('manual').notNull(),
  status: runStatusEnum('status').default('pending').notNull(),
  featureBranch: varchar('feature_branch', { length: 256 }),
  baseCommitSha: varchar('base_commit_sha', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export const workflowSteps = pgTable('workflow_steps', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  runId: text('run_id')
    .notNull()
    .references(() => workflowRuns.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  ownerType: stepOwnerEnum('owner_type').notNull(),
  agentRole: agentRoleEnum('agent_role'),
  status: stepStatusEnum('status').default('pending').notNull(),
  inputArtifactRoles: jsonb('input_artifact_roles').$type<string[]>().default([]).notNull(),
  outputArtifactRoles: jsonb('output_artifact_roles').$type<string[]>().default([]).notNull(),
  dependsOnStepIds: jsonb('depends_on_step_ids').$type<string[]>().default([]).notNull(),
  maxRetries: integer('max_retries').default(2).notNull(),
  retryBackoffSeconds: integer('retry_backoff_seconds').default(30).notNull(),
  executionLock: text('execution_lock'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
