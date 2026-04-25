import { createId } from '@paralleldrive/cuid2';
import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  githubId: varchar('github_id', { length: 64 }).unique().notNull(),
  login: varchar('login', { length: 128 }).notNull(),
  email: varchar('email', { length: 256 }),
  avatarUrl: text('avatar_url'),
  preferredLanguage: varchar('preferred_language', { length: 8 }).default('zh-CN').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
