import { createId } from '@paralleldrive/cuid2';
import { pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.js';

export const memberRoleEnum = pgEnum('member_role', [
  'owner',
  'admin',
  'contributor',
  'reviewer',
  'viewer',
]);

export const workspaces = pgTable('workspaces', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  slug: varchar('slug', { length: 64 }).unique().notNull(),
  name: varchar('name', { length: 128 }).notNull(),
  githubRepoUrl: text('github_repo_url'),
  defaultBranch: varchar('default_branch', { length: 128 }).default('main').notNull(),
  preferredModel: varchar('preferred_model', { length: 64 }).default('claude-sonnet-4-6').notNull(),
  preferredProvider: varchar('preferred_provider', { length: 32 }).default('anthropic').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').default('viewer').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniq: unique().on(table.workspaceId, table.userId),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
