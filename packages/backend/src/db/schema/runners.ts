import { createId } from '@paralleldrive/cuid2';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { workspaces } from './workspaces.js';
import { agentRoleEnum, workflowSteps } from './workflows.js';

export const runnerStatusEnum = pgEnum('runner_status', ['online', 'offline', 'draining']);
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
]);

export const runners = pgTable('runners', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  machineId: varchar('machine_id', { length: 256 }).notNull(),
  secretHash: text('secret_hash').notNull(),
  status: runnerStatusEnum('status').default('offline').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().default([]).notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentRuns = pgTable('agent_runs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  stepId: text('step_id')
    .notNull()
    .references(() => workflowSteps.id),
  runnerId: text('runner_id').references(() => runners.id),
  status: agentRunStatusEnum('status').default('pending').notNull(),
  agentRole: agentRoleEnum('agent_role').notNull(),
  inputPayloadRef: jsonb('input_payload_ref').$type<Record<string, unknown>>().default({}).notNull(),
  outputPayloadRef: jsonb('output_payload_ref').$type<Record<string, unknown>>().default({}).notNull(),
  checkpointData: jsonb('checkpoint_data').$type<Record<string, unknown>>().default({}).notNull(),
  attemptNumber: integer('attempt_number').default(1).notNull(),
  timeoutSeconds: integer('timeout_seconds').default(600).notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  gitBranch: varchar('git_branch', { length: 256 }),
  headCommitSha: varchar('head_commit_sha', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
});

export type Runner = typeof runners.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
