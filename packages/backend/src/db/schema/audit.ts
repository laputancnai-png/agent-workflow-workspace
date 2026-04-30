import { createId } from '@paralleldrive/cuid2';
import { jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

import { workspaces } from './workspaces.js';

export const auditActorEnum = pgEnum('audit_actor_type', ['user', 'agent', 'runner', 'system']);

export const auditEvents = pgTable('audit_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  actorType: auditActorEnum('actor_type').notNull(),
  actorId: text('actor_id'),
  targetEntity: varchar('target_entity', { length: 64 }),
  targetId: text('target_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
  selfHash: varchar('self_hash', { length: 64 }).notNull(),
  prevHash: varchar('prev_hash', { length: 64 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type AuditEvent = typeof auditEvents.$inferSelect;
